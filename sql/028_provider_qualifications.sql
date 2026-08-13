-- Leuk — 028: provider_qualifications (NYS-54).
--
-- Anthem's Plan-Net PractitionerRole carries a `qualification` extension array
-- we've been STORING (provider_network_participation.raw_resource) but never
-- extracting: degrees, per-state license numbers, and specialty taxonomies.
-- This table structures them. No new API calls — populated from raw payloads
-- already in the DB by scripts/extract-qualifications.mjs.
--
-- Shape observed in Anthem raw (2026-07-14):
--   Degree   → code='MD'|'MSW'|'PSYD'|'MB,MBBS'   (display sometimes null)
--   License  → display='CA - C155127' | 'NY - 401137'  (code null; state+num)
--   Specialty→ code='2084P0800X' (NUCC), display='Psychiatry Physician'
-- code + display both NOT NULL DEFAULT '' so the dedup key stays simple.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS provider_qualifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npi            TEXT NOT NULL,
  qual_type      TEXT NOT NULL,                 -- 'license' | 'degree' | 'specialty' | 'other'
  code           TEXT NOT NULL DEFAULT '',      -- degree abbr / NUCC taxonomy; '' for licenses
  display        TEXT NOT NULL DEFAULT '',      -- human label / 'ST - number' for licenses; '' when absent
  license_state  TEXT,                          -- parsed 2-letter state (licenses only)
  license_number TEXT,                          -- parsed number (licenses only)
  source         TEXT NOT NULL DEFAULT 'anthem',-- payer_source slug the qualification came from
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (npi, qual_type, code, display, source)
);

CREATE INDEX IF NOT EXISTS idx_prov_qual_npi ON provider_qualifications(npi);
CREATE INDEX IF NOT EXISTS idx_prov_qual_lic_state
  ON provider_qualifications(license_state) WHERE qual_type = 'license';

COMMENT ON TABLE provider_qualifications IS
  'Provider degrees / state license numbers / specialty taxonomies extracted from Anthem Plan-Net PractitionerRole qualification extensions (NYS-54). Payer-attested, not a primary licensure source.';
