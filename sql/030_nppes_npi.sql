-- Leuk — 030: nppes_npi (the full NPPES dissemination file, nationwide).
--
-- WHY THIS EXISTS. sql/025's nppes_organizations is NY-scoped by construction
-- ("NY practice location + every npi-type TIN"): 103,772 of its 104,060 rows are
-- NY. That is fine for naming npi-type TINs — those NPIs are in the list by
-- definition — but it cannot name an ein-type group whose organization sits out
-- of state. Measured 2026-07-15: ein:042774441's roster anchors at 300 LONGWOOD
-- AVE, BOSTON MA. BOSTON CHILDREN'S HOSPITAL is simply absent from our data, so
-- the group renders "Unnamed practice" forever, no matter how good the join is.
-- This table is the whole file — both entity types, every state — so the group
-- naming route (see the matcher in scripts/nppes-name-groups.mjs) can run in SQL
-- against a complete universe instead of a NY keyhole.
--
-- WHAT IT IS NOT. Not a replacement for directory_providers (which carries
-- Medicaid cross-links, profession normalization and slugs) or for
-- nppes_organizations (whose consumers are stable). It is the raw federal
-- identity spine those two could later be rebuilt on — see the consolidation
-- ticket referenced in docs/reports/2026-07-15-nppes-infrastructure.md.
--
-- SELECTED COLUMNS ONLY. The dissemination file is 330 columns / ~10GB
-- unzipped; loading it whole would be ~40GB in Neon for no gain. These are the
-- columns the naming + entity_kind work actually reads, plus the freshness
-- fields scripts/nppes-sync.mjs needs to apply weekly incrementals.
--
-- ── THE TWO MATCH KEYS, AND WHY THEY LOOK LIKE THIS ─────────────────────────
-- Both are STORED generated columns so the match is an indexed equality join
-- rather than a 8.6M-row expression scan, and so every caller normalizes
-- identically (a matcher that normalizes one side differently silently matches
-- nothing — that is exactly how the first local attempt failed).
--
-- addr_key — uppercase, suite designators dropped, then all non-alphanumerics
-- stripped. The designator step is load-bearing and was measured, not guessed:
-- NPI 1477783496's practice location is '109 W 27TH ST STE 5S' while the
-- organization at that same desk (MCCD PSYCHIATRY SERVICES PLLC, Talkiatry's
-- billing entity) publishes '109 W 27TH ST # 5S'. Strip punctuation alone and
-- they are '109W27THSTSTE5S' vs '109W27THST5S' — no match. Drop STE/# first and
-- both land on '109W27THST5S'. ST (street) is deliberately NOT in the list.
--
-- phone keys — digits only, and BOTH the location AND mailing numbers are kept.
-- Also measured: that same MCCD record publishes location tel 917-634-5311 and
-- mailing tel 833-351-8255, while the practitioner at the address publishes
-- 833-351-8255 as his LOCATION phone. A location-to-location phone rule rejects
-- the true match. The matcher compares the practitioner's location phone against
-- either of the organization's numbers.
--
-- Normalization only ever CREATES candidate matches; it never accepts one. The
-- accept/skip decision (exactly one distinct name, else skip) lives in the
-- matcher, so a loose key here cannot invent a name — it can only widen the
-- candidate set that ambiguity detection then throws away.

-- ── nppes_npi ────────────────────────────────────────────────────────────────
-- One row per NPI, nationwide, both entity types. Loaded by
-- scripts/ingest-nppes-full.mjs (monthly full replacement, chunked COPY);
-- maintained by scripts/nppes-sync.mjs (weekly incremental + deactivations).
CREATE TABLE IF NOT EXISTS nppes_npi (
  npi               TEXT PRIMARY KEY,
  entity_type       SMALLINT,        -- 1 = individual (NPI-1), 2 = organization (NPI-2)
  org_name          TEXT,            -- Legal Business Name (NPI-2 only)
  last_name         TEXT,            -- NPI-1 only
  first_name        TEXT,            -- NPI-1 only
  credential        TEXT,            -- NPI-1 only ('MD', 'L.C.S.W.' — unnormalized upstream)
  loc_addr1         TEXT,
  loc_addr2         TEXT,
  loc_city          TEXT,
  loc_state         TEXT,
  loc_zip           TEXT,
  loc_phone         TEXT,
  mail_phone        TEXT,
  -- 'Y' / 'N' / 'X' (not answered). THE point of this column: it retires the
  -- roster-of-one inference in sql/027 with the provider's own attestation.
  sole_proprietor   TEXT,
  primary_taxonomy  TEXT,            -- the taxonomy flagged primary, not first-match
  enumeration_date  DATE,
  last_update       DATE,
  deactivation_date DATE,            -- non-NULL = deactivated; matcher excludes these
  reactivation_date DATE,
  ingested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  addr_key TEXT GENERATED ALWAYS AS (
    regexp_replace(
      regexp_replace(
        upper(coalesce(loc_addr1, '')),
        '\y(STE|SUITE|APT|UNIT|RM|ROOM|FL|FLOOR|OFC|OFFICE|BLDG|DEPT|NO)\y', ' ', 'g'),
      '[^A-Z0-9]', '', 'g')
  ) STORED,
  zip5 TEXT GENERATED ALWAYS AS (
    left(regexp_replace(coalesce(loc_zip, ''), '[^0-9]', '', 'g'), 5)
  ) STORED,
  loc_phone_key TEXT GENERATED ALWAYS AS (
    regexp_replace(coalesce(loc_phone, ''), '[^0-9]', '', 'g')
  ) STORED,
  mail_phone_key TEXT GENERATED ALWAYS AS (
    regexp_replace(coalesce(mail_phone, ''), '[^0-9]', '', 'g')
  ) STORED
);

-- The matcher's access path: "every NPI-2 at this address in this ZIP". zip5
-- leads because addr_key alone is not unique nationally ('100 MAIN ST' is
-- everywhere) and a zip5-led key keeps the candidate set tiny.
CREATE INDEX IF NOT EXISTS idx_nppes_npi_addr ON nppes_npi (zip5, addr_key)
  WHERE entity_type = 2 AND deactivation_date IS NULL;
-- Roster lookups (practitioner -> their own address/phone) hit the PK, so no
-- index needed there. entity_type filters most reporting queries.
CREATE INDEX IF NOT EXISTS idx_nppes_npi_entity ON nppes_npi (entity_type);
CREATE INDEX IF NOT EXISTS idx_nppes_npi_state ON nppes_npi (loc_state);

COMMENT ON TABLE nppes_npi IS
  'Full NPPES dissemination file (nationwide, both entity types, selected columns). Monthly full replacement via scripts/ingest-nppes-full.mjs; weekly incrementals via scripts/nppes-sync.mjs. addr_key/zip5/phone keys are generated so every matcher normalizes identically.';
COMMENT ON COLUMN nppes_npi.sole_proprietor IS
  'NPPES "Is Sole Proprietor" (Y/N/X). Retires the roster-of-one entity_kind inference in sql/027 — the provider attests this themselves.';
COMMENT ON COLUMN nppes_npi.addr_key IS
  'Practice-location address 1, uppercased, suite designators dropped, non-alphanumerics stripped. Matches STE 5S to # 5S. Creates candidates only; the matcher decides.';

-- ── nppes_other_names ────────────────────────────────────────────────────────
-- The Other Name reference file bundled in the monthly zip: additional names for
-- NPI-2s — overwhelmingly DBAs ("doing business as"). The display name a patient
-- would recognize is usually here, not in the Legal Business Name: the legal
-- entity behind a practice is routinely an opaque holding name. Type code 3 =
-- 'Doing Business As'; the matcher prefers it over org_name and falls back.
-- Grain is (npi, name) — an NPI can carry several other names.
CREATE TABLE IF NOT EXISTS nppes_other_names (
  npi        TEXT NOT NULL,
  other_name TEXT NOT NULL,
  type_code  TEXT,          -- 1=former legal 2=professional 3=DBA 4=former 5=other
  PRIMARY KEY (npi, other_name)
);
CREATE INDEX IF NOT EXISTS idx_nppes_other_names_npi ON nppes_other_names (npi);
COMMENT ON TABLE nppes_other_names IS
  'NPPES Other Name reference file (NPI-2 additional names; type_code 3 = DBA). Preferred over the Legal Business Name for display.';
