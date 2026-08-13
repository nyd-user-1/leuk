-- Leuk — external provider directory (003). Public open-data ingest +
-- referrals + provider applications. Follows 001 conventions: uuid PKs via
-- gen_random_uuid(), TIMESTAMPTZ, CHECK-constrained enums, snake_case.
--
-- Sources (Socrata SODA, no auth):
--   medicaid  → health.data.ny.gov/resource/keti-qx5t (provider-level, NPI)
--   omh       → data.ny.gov/resource/6nvr-tbv8 (OMH mental-health programs)
--   nyc_dohmh → data.cityofnewyork.us/resource/8nqg-ia7v (currently 403/private)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── directory_providers ─────────────────────────────────────────────────────
-- Provider-level rows (Medicaid enrolled listing). license_no/taxonomy/phone
-- are nullable — the Medicaid feed omits them; kept for future federal joins.
CREATE TABLE IF NOT EXISTS directory_providers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npi         TEXT,
  name        TEXT NOT NULL,
  profession  TEXT,
  license_no  TEXT,
  taxonomy    TEXT,
  address     TEXT,
  city        TEXT,
  county      TEXT,
  zip         TEXT,
  phone       TEXT,
  source      TEXT NOT NULL CHECK (source IN ('medicaid')),
  source_id   TEXT NOT NULL,
  raw         JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_dir_providers_county ON directory_providers(county);
CREATE INDEX IF NOT EXISTS idx_dir_providers_profession ON directory_providers(profession);
CREATE INDEX IF NOT EXISTS idx_dir_providers_npi ON directory_providers(npi);
COMMENT ON TABLE directory_providers IS 'NY Medicaid enrolled mental-health providers (open data); UNIQUE(source,source_id) for idempotent upsert.';

-- ── directory_programs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS directory_programs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency        TEXT,
  facility      TEXT,
  program_name  TEXT NOT NULL,
  program_type  TEXT,
  populations   TEXT,
  address       TEXT,
  city          TEXT,
  county        TEXT,
  zip           TEXT,
  phone         TEXT,
  source        TEXT NOT NULL CHECK (source IN ('omh','nyc_dohmh')),
  source_id     TEXT NOT NULL,
  raw           JSONB,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_dir_programs_county ON directory_programs(county);
CREATE INDEX IF NOT EXISTS idx_dir_programs_type ON directory_programs(program_type);
COMMENT ON TABLE directory_programs IS 'OMH / NYC DOHMH mental-health programs (open data); UNIQUE(source,source_id) for idempotent upsert.';

-- ── referrals ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES directory_providers(id) ON DELETE SET NULL,
  program_id  UUID REFERENCES directory_programs(id) ON DELETE SET NULL,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined')),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_client ON referrals(client_id);
COMMENT ON TABLE referrals IS 'Practitioner-initiated referrals of a client to a directory provider or program.';

-- ── provider_applications ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_applications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  license_type TEXT,
  state        TEXT,
  npi          TEXT,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','reviewing','contacted','closed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_provider_apps_status ON provider_applications(status);
COMMENT ON TABLE provider_applications IS 'Public "Join as a provider" submissions from the marketing front door.';
