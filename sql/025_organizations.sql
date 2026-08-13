-- Leuk — 025: the organization layer (NYS-41 + NYS-27 + NYS-52 as one).
--
-- Provider platforms (Headway ~13.6k NPIs, Alma-scale groups, hospital
-- systems) are the missing entity between providers and payers. The anchor
-- key is the billing TIN from provider_rate_signals ('ein:832675429' /
-- 'npi:1234567890', always normalized: lowercase, digits/letters only —
-- scan-tic.mjs + load-rate-signals.mjs both enforce this since 2026-07-13).
--
-- Three evidence layers, kept separate on purpose:
--  * nppes_organizations — NPI-2 identity records from the NPPES monthly file
--    (NY practice location + every NPI that appears as an 'npi:' TIN). CMS
--    suppresses EINs in the public file ('<UNAVAIL>'), so this names npi-TINs
--    directly but CANNOT name ein-TINs on its own.
--  * org_affiliations — payer-attested provider↔org links pulled from the
--    PractitionerRole.organization reference that Anthem/Humana Plan-Net
--    resources carry (display = real org name, e.g. "Lifestance Psychology").
--    Extracted idempotently from provider_network_participation.raw_resource
--    by scripts/orgs-sync.mjs — re-run after every FHIR harvest.
--  * tin_registry (sql/019) — stays the ein-TIN name store; orgs-sync.mjs
--    backfills it from nppes_organizations (npi-TINs), directory_providers
--    (individual npi-TINs), and the FHIR roster crosswalk (ein-TINs whose
--    rate-signal roster overlaps an org_affiliations roster).
--
-- The two matviews are the org-page data layer AND the NYS-52 fix: /rates
-- roster-check queries on platform-scale TINs (Headway × high-volume CPT)
-- degrade to seq scans past ~20% selectivity; the (tin, payer, billing_code)
-- rollup answers them from a few hundred rows instead.
--
-- After every rate load or FHIR enrich, refresh 021 + 023 + 024 + these two:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY org_tin_rate_summary;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY org_tin_rosters;

-- ── nppes_organizations ──────────────────────────────────────────────────────
-- NPI-2 (organization) records. Populated by scripts/ingest-orgs.mjs streaming
-- the NPPES monthly zip; idempotent upsert on npi.
CREATE TABLE IF NOT EXISTS nppes_organizations (
  npi                 TEXT PRIMARY KEY,
  name                TEXT NOT NULL,            -- Legal Business Name
  other_name          TEXT,                     -- DBA, when published
  ein                 TEXT,                     -- NULL when CMS-suppressed (almost always)
  taxonomy            TEXT,                     -- primary taxonomy code
  address             TEXT,
  city                TEXT,
  state               TEXT,
  zip                 TEXT,
  phone               TEXT,
  authorized_official TEXT,                     -- "Last, First — Title"
  is_subpart          BOOLEAN,
  parent_lbn          TEXT,                     -- parent Legal Business Name (subparts)
  enumeration_date    DATE,
  last_update         DATE,
  deactivation_date   DATE,
  ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nppes_orgs_state ON nppes_organizations(state);
CREATE INDEX IF NOT EXISTS idx_nppes_orgs_name_trgm
  ON nppes_organizations USING gin (name gin_trgm_ops);
COMMENT ON TABLE nppes_organizations IS
  'NPI-2 organization records from the NPPES monthly dissemination file (NY + every npi-type TIN). Identity only — participation/rates join via TIN or org_affiliations.';

-- ── org_affiliations ─────────────────────────────────────────────────────────
-- Payer-attested provider↔organization links (FHIR PractitionerRole.organization).
-- org_ref is the payer's own Organization resource URL — stable within a payer,
-- meaningless across payers. Names are payer-roster attestations, same epistemic
-- class as tin_registry names.
CREATE TABLE IF NOT EXISTS org_affiliations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npi             TEXT NOT NULL,
  payer_source_id UUID NOT NULL REFERENCES payer_sources(id) ON DELETE CASCADE,
  org_ref         TEXT NOT NULL,               -- payer's Organization/… reference
  org_display     TEXT NOT NULL,               -- the org name the payer publishes
  first_seen      DATE NOT NULL DEFAULT CURRENT_DATE,
  last_seen       DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (npi, payer_source_id, org_ref)
);
CREATE INDEX IF NOT EXISTS idx_org_aff_org ON org_affiliations(payer_source_id, org_ref);
CREATE INDEX IF NOT EXISTS idx_org_aff_npi ON org_affiliations(npi);
CREATE INDEX IF NOT EXISTS idx_org_aff_display_trgm
  ON org_affiliations USING gin (org_display gin_trgm_ops);
COMMENT ON TABLE org_affiliations IS
  'FHIR-attested provider↔org links (PractitionerRole.organization display+reference). Extracted from provider_network_participation.raw_resource by scripts/orgs-sync.mjs.';

-- ── org_tin_rate_summary ─────────────────────────────────────────────────────
-- Grain: (tin, payer, billing_code) -> roster size + rate band. Same dedup
-- pattern as sql/024 (collapse file_date duplicates per npi×rate first). No
-- NY-payer regex here: org pages show every book the TIN appears in, and the
-- Aetna product labels wouldn't match the 024 regex anyway.
CREATE MATERIALIZED VIEW IF NOT EXISTS org_tin_rate_summary AS
WITH dd AS (
  SELECT npi, tin, payer, billing_code, negotiated_rate, max(as_of) AS as_of
  FROM provider_rate_signals
  WHERE negotiated_type NOT ILIKE '%percent%'
  GROUP BY 1, 2, 3, 4, 5
)
SELECT tin, payer, billing_code,
       count(DISTINCT npi)::int AS npis,
       count(*)::int AS rate_points,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS p25,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS median,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS p75,
       min(negotiated_rate)::float8 AS min_rate,
       max(negotiated_rate)::float8 AS max_rate,
       max(as_of) AS as_of
FROM dd
GROUP BY tin, payer, billing_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_otrs_key
  ON org_tin_rate_summary(tin, payer, billing_code);
CREATE INDEX IF NOT EXISTS idx_otrs_code ON org_tin_rate_summary(billing_code);

-- ── org_tin_rosters ──────────────────────────────────────────────────────────
-- Grain: (tin, npi) -> which payers attest this membership and when. The org
-- page roster AND the reverse lookup ("which orgs does this NPI bill under").
CREATE MATERIALIZED VIEW IF NOT EXISTS org_tin_rosters AS
SELECT tin, npi,
       count(DISTINCT payer)::int AS payer_count,
       array_agg(DISTINCT payer) AS payers,
       count(*)::int AS rate_rows,
       max(file_date) AS last_file_date,
       max(as_of) AS as_of
FROM provider_rate_signals
GROUP BY tin, npi;

CREATE UNIQUE INDEX IF NOT EXISTS idx_otr_key ON org_tin_rosters(tin, npi);
CREATE INDEX IF NOT EXISTS idx_otr_npi ON org_tin_rosters(npi);
