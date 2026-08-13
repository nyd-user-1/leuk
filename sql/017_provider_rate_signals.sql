-- Leuk — 017: provider_rate_signals (Transparency-in-Coverage negotiated rates).
--
-- The corroboration layer's second, independent kind of evidence. A negotiated
-- rate proves a CONTRACT existed on the file date — money, not paperwork. It is
-- deliberately its own table, NOT bolted onto provider_network_participation:
-- rates carry a different freshness/confidence profile (as-of semantics, zombie
-- risk) and their own source treatment (MRF files, not FHIR directories).
--
-- THE THREE DISPLAY RULES (structural — see lib/repos/rate-signals.ts):
--  1. negotiated_rate is what the PAYER pays the PROVIDER. Never patient cost.
--     The column is named negotiated_rate — never cost, never price — and the
--     read layer only releases it pre-labeled ("in-network rate · as-of {date}").
--  2. A rate proves a contract on file_date. Every rate-derived claim carries
--     its as-of date.
--  3. MEMBERSHIP vs LIVENESS: a rate row is the payer's own published
--     attestation that the provider is in-network — a fair membership claim on
--     its own. What it does NOT carry: accepting-new-patients or a recency
--     heartbeat (zombie rates are why CMS proposed a Utilization File). Gate
--     accepting/liveness display on a same-payer directory listing; never
--     gate the membership claim.
--
-- Date semantics (distinct on purpose — do not collapse):
--  * file_date = the payer's published MRF date (their claim of currency).
--  * as_of     = the rate's effective date if the file carries one, else the
--                date WE fetched the file (TiC files usually carry only an
--                expiration, so as_of is typically the fetch date).
--
-- tin is REQUIRED: NPIs ride multiple TINs (PoC: 17 NPIs >3 TINs, max 11) and
-- the TIN disambiguates practice affiliation for dedup + corroboration joins.
--
-- Populated by scripts/mrf/load-rate-signals.mjs from scan-tic.mjs CSVs.
-- Idempotent; safe to re-run (exact duplicates collapse on the UNIQUE key).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS provider_rate_signals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npi              TEXT NOT NULL,
  tin              TEXT NOT NULL,                 -- 'ein:XXXXXXXXX' | 'npi:XXXXXXXXXX'
  payer            TEXT NOT NULL,                 -- reporting entity, e.g. 'Oxford Health Insurance Inc'
  plan_or_network  TEXT NOT NULL,                 -- e.g. 'Behavior Health P3', 'Freedom Network'
  billing_code     TEXT NOT NULL,                 -- CPT (90791, 90834, 90837, 99214, 90853, …)
  negotiated_rate  NUMERIC(10,2) NOT NULL,        -- payer→provider dollars (or % if negotiated_type says so)
  billing_class    TEXT NOT NULL DEFAULT 'professional',
  negotiated_type  TEXT NOT NULL DEFAULT 'negotiated',  -- 'negotiated' | 'percentage' | 'per diem' | …
  place_of_service TEXT NOT NULL DEFAULT '',      -- POS list as published ('11|02', 'CSTM-00')
  source_file      TEXT NOT NULL,                 -- exact MRF blob name
  file_date        DATE NOT NULL,                 -- payer's published MRF date
  as_of            DATE NOT NULL,                 -- effective date if carried, else fetch date
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (npi, tin, payer, plan_or_network, billing_code, negotiated_rate,
          billing_class, negotiated_type, place_of_service, file_date)
);

CREATE INDEX IF NOT EXISTS idx_prs_npi ON provider_rate_signals (npi);
CREATE INDEX IF NOT EXISTS idx_prs_payer_code ON provider_rate_signals (payer, billing_code);

COMMENT ON TABLE provider_rate_signals IS
  'TiC MRF negotiated rates — contract-evidence signals, NPI-keyed. A rate proves a contract existed on file_date; it does NOT prove the panel is open or the provider still bills the plan. Read via lib/repos/rate-signals.ts only.';
COMMENT ON COLUMN provider_rate_signals.negotiated_rate IS
  'What the PAYER pays the PROVIDER. NOT the patient''s cost — patient cost depends on deductible/coinsurance we do not have. Only surfaced pre-labeled by the read layer.';
COMMENT ON COLUMN provider_rate_signals.file_date IS
  'The payer''s published MRF date.';
COMMENT ON COLUMN provider_rate_signals.as_of IS
  'Rate effective date if the file carries one, else the date we fetched the file. Distinct from file_date by design.';
