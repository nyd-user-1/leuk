-- Leuk — 019: tin_registry (organization names for contract-holder TINs).
--
-- provider_rate_signals.tin is a bare string ('ein:832675429'); the MRF
-- provider_references carry the org's business_name alongside — this table is
-- where those names land, so Know-Your-Rates screens say "River Region
-- Psychiatry · EIN 26-2976526" instead of accounting metadata (NYS-27).
--
-- tin_norm = lowercased, dashes/spaces stripped ('ein:832675429') — payers
-- format EINs inconsistently. Names come from payer files (source = payer
-- slug/file) and are attestations of the payer's roster, not legal-entity
-- lookups; first_seen/last_seen bound the observation window.
--
-- Populated by scripts/mrf scans (tin-name sidecar, pending) + manual seeds.
-- Read via lib/repos/tin-registry.ts (getOrgName).

CREATE TABLE IF NOT EXISTS tin_registry (
  tin_norm      TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'mrf',   -- payer/file the name came from
  first_seen    DATE NOT NULL DEFAULT CURRENT_DATE,
  last_seen     DATE NOT NULL DEFAULT CURRENT_DATE
);

COMMENT ON TABLE tin_registry IS
  'Org names observed for contract-holder TINs in payer MRF files. Names are payer-roster attestations, not legal-entity records.';

-- Seed: the four names proven by raw-file greps on 2026-07-12.
INSERT INTO tin_registry (tin_norm, business_name, source, first_seen) VALUES
  ('ein:832675429', 'New York Medical Behavioral Health Services (Headway NY)', 'oxford-ohbs mrf', '2026-07-12'),
  ('ein:853976267', 'Orenda Psychiatry PLLC', 'cigna mrf', '2026-07-12'),
  ('ein:262976526', 'River Region Psychiatry', 'cigna mrf', '2026-07-12'),
  ('ein:842050464', 'Culpepper Psychiatric Associates', 'cigna mrf', '2026-07-12')
ON CONFLICT (tin_norm) DO NOTHING;
