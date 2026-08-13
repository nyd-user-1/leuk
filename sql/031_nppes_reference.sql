-- Leuk — 031: the rest of the NPPES dissemination assets + the NUCC code set.
--
-- sql/030 loaded the identity spine (nppes_npi, nppes_other_names). This adds
-- the two reference files that ship in the same monthly zip but answer
-- different questions, plus the code set that makes any of it readable, plus
-- the log that makes the weekly sync idempotent.

-- ── nucc_taxonomy ────────────────────────────────────────────────────────────
-- The NUCC Health Care Provider Taxonomy code set (883 codes, v26.0). NOT a CMS
-- file — NUCC publishes it separately (nucc.org/images/stories/CSV) and CMS only
-- ships a PDF of it in the zip. Loaded by ingest-nppes-full.mjs --mode=taxonomy.
--
-- We had no reference table: `scripts/lib/mh-taxonomy.mjs` is a hand-curated
-- 12-code INCLUDE-SET that decides who belongs in the behavioural-health
-- directory. That is a policy filter and should stay one — it is deliberately
-- narrower than "all behavioural health" (it excludes the neurology/pain/sleep
-- 2084 subcodes on purpose). This table is the opposite thing: the complete code
-- set, for reading a code we did not choose.
--
-- Why it matters beyond display: `grouping` is what makes sql/030's naming
-- matcher legible. Its impossible-biller gate excludes NUCC 33x/34x, and this
-- table is the proof of what those are — 33x = 'Suppliers', 34x =
-- 'Transportation Services'. Verified here, not assumed:
--   10x Behavioral Health & Social Service Providers   26x Ambulatory Health Care Facilities
--   25x Agencies                                        27x/28x Hospital Units / Hospitals
--   33x Suppliers                                       34x Transportation Services
--   36x Physician Assistants & Advanced Practice Nursing Providers
CREATE TABLE IF NOT EXISTS nucc_taxonomy (
  code           TEXT PRIMARY KEY,
  grouping       TEXT,          -- 'Suppliers', 'Behavioral Health & Social Service Providers', …
  classification TEXT,
  specialization TEXT,
  definition     TEXT,
  display_name   TEXT,
  section        TEXT           -- 'Individual' | 'Non-Individual'
);
CREATE INDEX IF NOT EXISTS idx_nucc_taxonomy_grouping ON nucc_taxonomy (grouping);
COMMENT ON TABLE nucc_taxonomy IS
  'NUCC Health Care Provider Taxonomy code set (nucc.org, v26.0). Reference/display only — scripts/lib/mh-taxonomy.mjs remains the behavioural-health policy filter.';

-- ── nppes_endpoints ──────────────────────────────────────────────────────────
-- The Endpoint reference file: per-NPI digital endpoints — FHIR/Direct/REST URLs
-- a provider or organization publishes for electronic exchange.
--
-- Why this is worth a table: every payer FHIR base URL we harvest today was
-- found by hand (docs/PAYER-RESEARCH.md). This file is the federal registry of
-- provider-side endpoints, self-attested, and it is how an org-level FHIR/Direct
-- address becomes a lookup rather than a research task. It is NOT a payer
-- directory — no rates, no networks — so nothing on /published-rates reads it.
-- Loaded now because it ships in the zip we already downloaded and re-fetching
-- 1.1GB later to get it would be silly.
--
-- Grain: (npi, endpoint). One NPI can publish several; the same URL can appear
-- for several NPIs. The loader dedupes — like the Other Name file, this one
-- ships exact duplicate rows.
CREATE TABLE IF NOT EXISTS nppes_endpoints (
  npi                       TEXT NOT NULL,
  endpoint_type             TEXT,          -- DIRECT | FHIR | REST | SOAP | OTHERS
  endpoint_type_description TEXT,
  endpoint                  TEXT NOT NULL, -- the URL / Direct address itself
  affiliation               TEXT,          -- Y/N: endpoint belongs to an affiliated org
  endpoint_description      TEXT,
  affiliation_lbn           TEXT,          -- affiliated org's legal business name
  use_code                  TEXT,
  use_description           TEXT,
  content_type              TEXT,
  content_description       TEXT,
  aff_address1              TEXT,
  aff_city                  TEXT,
  aff_state                 TEXT,
  aff_postal                TEXT,
  PRIMARY KEY (npi, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_nppes_endpoints_type ON nppes_endpoints (endpoint_type);
COMMENT ON TABLE nppes_endpoints IS
  'NPPES Endpoint reference file: provider-published digital endpoints (FHIR/Direct/REST). Self-attested; presence is not proof an endpoint answers.';

-- ── nppes_sync_log ───────────────────────────────────────────────────────────
-- What makes scripts/nppes-sync.mjs idempotent AND resumable. NPPES publishes a
-- full replacement monthly and an incremental every week; the weeklies must be
-- applied in order and exactly once — applying one twice is harmless (upsert),
-- but SKIPPING one silently leaves the table a week stale with no way to notice.
-- This table is that record: one row per file, written only after the file has
-- fully applied. A crash mid-file leaves no row, so a re-run redoes that file
-- from the start — which upsert semantics make safe.
CREATE TABLE IF NOT EXISTS nppes_sync_log (
  file_name    TEXT PRIMARY KEY,   -- e.g. 'npidata_pfile_20260706-20260712.csv'
  kind         TEXT NOT NULL,      -- 'monthly' | 'weekly' | 'deactivation'
  rows_applied INT,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE nppes_sync_log IS
  'One row per NPPES file fully applied to nppes_npi. Written only on completion — a missing row means "not applied", so re-running is safe and skipping is visible.';
