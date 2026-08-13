-- Leuk — 029: the rest of Anthem's Plan-Net directory (NYS-53 sub-issues).
--
-- We already harvest PractitionerRole. This lands the other five resource types
-- the API exposes, populated by scripts/ingest-anthem-resources.mjs:
--   Location (NYS-55) · OrganizationAffiliation (NYS-56) ·
--   HealthcareService (NYS-57) · InsurancePlan (NYS-58) · Organization (NYS-59)
--
-- Keyed by the payer's own FHIR resource id (opaque hash). raw JSONB is the
-- lossless safety net; the typed columns are the extracted convenience fields.
-- All idempotent (id PK, upsert). `fhir_` prefix keeps these distinct from the
-- inference-layer tables (org_affiliations in sql/025 comes from PractitionerRole,
-- NOT the authoritative OrganizationAffiliation resource landed here).

-- ── fhir_organizations (NYS-59) — full org: own NPI, type, address, phone ─────
CREATE TABLE IF NOT EXISTS fhir_organizations (
  id           TEXT PRIMARY KEY,               -- FHIR Organization id
  npi          TEXT,                           -- from identifier (us-npi), when present
  name         TEXT,
  org_type     TEXT,                           -- prov | ntwk | ins | pay | …
  is_network   BOOLEAN NOT NULL DEFAULT false, -- type = ntwk (networks are Organizations)
  taxonomy     TEXT,                           -- qualification/specialty NUCC code
  phone        TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  zip          TEXT,
  last_updated TIMESTAMPTZ,
  source       TEXT NOT NULL DEFAULT 'anthem',
  raw          JSONB,
  ingested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fhir_org_npi ON fhir_organizations(npi) WHERE npi IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fhir_org_network ON fhir_organizations(is_network) WHERE is_network;

-- ── fhir_locations (NYS-55) — geo, phone, address, accessibility ─────────────
CREATE TABLE IF NOT EXISTS fhir_locations (
  id            TEXT PRIMARY KEY,
  name          TEXT,
  phone         TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  zip           TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  accessibility TEXT[],                         -- e.g. {WHEELCHAIR_ACCESS}
  hours         JSONB,                          -- hoursOfOperation, when present
  last_updated  TIMESTAMPTZ,
  source        TEXT NOT NULL DEFAULT 'anthem',
  raw           JSONB,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fhir_loc_state ON fhir_locations(state);

-- ── fhir_org_affiliations (NYS-56) — org ↔ network + participating org ────────
CREATE TABLE IF NOT EXISTS fhir_org_affiliations (
  id                    TEXT PRIMARY KEY,
  primary_org_ref       TEXT,                   -- organization.reference
  primary_org_display   TEXT,
  participating_org_ref TEXT,                   -- participatingOrganization.reference
  participating_display TEXT,
  network_refs          TEXT[],                 -- network[].reference (Organization/…)
  network_names         TEXT[],                 -- network[].display
  location_refs         TEXT[],
  service_refs          TEXT[],                 -- healthcareService[].reference
  specialties           TEXT[],
  last_updated          TIMESTAMPTZ,
  source                TEXT NOT NULL DEFAULT 'anthem',
  raw                   JSONB,
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fhir_orgaff_primary ON fhir_org_affiliations(primary_org_ref);
CREATE INDEX IF NOT EXISTS idx_fhir_orgaff_participating ON fhir_org_affiliations(participating_org_ref);

-- ── fhir_healthcare_services (NYS-57) — telehealth, languages, categories ─────
CREATE TABLE IF NOT EXISTS fhir_healthcare_services (
  id               TEXT PRIMARY KEY,
  org_ref          TEXT,                        -- providedBy.reference
  location_refs    TEXT[],
  name             TEXT,
  categories       TEXT[],
  service_types    TEXT[],
  specialties      TEXT[],
  delivery_methods TEXT[],                      -- {physical,virtual}
  telehealth       BOOLEAN NOT NULL DEFAULT false, -- has a virtual delivery method
  languages        TEXT[],                      -- communication
  last_updated     TIMESTAMPTZ,
  source           TEXT NOT NULL DEFAULT 'anthem',
  raw              JSONB,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fhir_hcs_org ON fhir_healthcare_services(org_ref);
CREATE INDEX IF NOT EXISTS idx_fhir_hcs_telehealth ON fhir_healthcare_services(telehealth) WHERE telehealth;

-- ── fhir_insurance_plans (NYS-58) — the sellable plan/product layer ───────────
CREATE TABLE IF NOT EXISTS fhir_insurance_plans (
  id            TEXT PRIMARY KEY,
  plan_key      TEXT,                           -- identifier Prod_Plan_Key
  name          TEXT,
  plan_type     TEXT,                           -- MEDICAID | COMMERCIAL | …
  owned_by_ref  TEXT,
  coverage_area TEXT[],
  network_refs  TEXT[],                         -- plan network refs, when present
  last_updated  TIMESTAMPTZ,
  source        TEXT NOT NULL DEFAULT 'anthem',
  raw           JSONB,
  ingested_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fhir_plan_type ON fhir_insurance_plans(plan_type);
