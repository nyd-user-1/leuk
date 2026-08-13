-- Leuk — 013: payer insurance-network directory (FHIR Da Vinci PDex Plan-Net).
--
-- NPPES (sql/003 + 006) gives us provider identity but ZERO insurance data — no
-- plan participation, no accepting-new-patients status. Payers publish that under
-- the CMS interoperability mandate as FHIR R4 Plan-Net provider directories, all
-- the same shape. These tables model many payers as configurable sources and
-- enrich our existing 99k NPIs; Humana is the reference source.
--
-- Design notes:
--  * `payer_sources` is deliberately NOT named `payers` — a billing `payers`
--    table already exists (sql/001, insurance_policies.payer_id). Different
--    concept: this is a FHIR *ingest source*, not a client's insurer.
--  * We MATCH, never CREATE providers: participation joins directory_providers on
--    npi; NPIs we can't match are parked in payer_unmatched_npis for review.
--  * Every participation row keeps the full source resource in raw_resource JSONB
--    so we never re-fetch to recover a field we didn't model.
--  * location_ref defaults to '' (not NULL) so the idempotency key works with a
--    plain ON CONFLICT — two NULLs are distinct in a UNIQUE and would duplicate.
--
-- Populated by scripts/ingest-payers.mjs. Idempotent; safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── payer_sources ───────────────────────────────────────────────────────────
-- One row per payer FHIR endpoint. Adding Aetna/UHC/Cigna = a new row (+ an auth
-- strategy in the ingester if auth_type <> 'none'), not new code paths.
CREATE TABLE IF NOT EXISTS payer_sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT NOT NULL UNIQUE,               -- 'humana' — CLI + registry key
  name             TEXT NOT NULL,                      -- 'Humana'
  fhir_base_url    TEXT NOT NULL,                      -- 'https://fhir.humana.com/api/'
  auth_type        TEXT NOT NULL DEFAULT 'none' CHECK (auth_type IN ('none','oauth2','apikey')),
  plan_net_profile BOOLEAN NOT NULL DEFAULT true,      -- serves the Da Vinci PDex Plan-Net profile
  last_synced_at   TIMESTAMPTZ,                        -- set at the end of a successful run
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE payer_sources IS 'One row per payer FHIR Plan-Net endpoint (Humana, Aetna, …). NOT the billing payers table.';

-- ── payer_networks ──────────────────────────────────────────────────────────
-- The plans/networks a payer publishes (e.g. "Humana/ChoiceCare Network PPO").
-- One provider can participate in many networks.
CREATE TABLE IF NOT EXISTS payer_networks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_source_id UUID NOT NULL REFERENCES payer_sources(id) ON DELETE CASCADE,
  network_name    TEXT NOT NULL,                       -- valueReference.display
  raw_network_id  TEXT,                                -- valueReference.reference (Organization/…), when present
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payer_source_id, network_name)
);
CREATE INDEX IF NOT EXISTS idx_payer_networks_source ON payer_networks(payer_source_id);
COMMENT ON TABLE payer_networks IS 'Plans/networks a payer publishes; UNIQUE(payer_source_id, network_name) for idempotent upsert.';

-- ── provider_network_participation ──────────────────────────────────────────
-- The money table. One row = "this NPI is in this network for this payer at this
-- location, and is/ isn't accepting new patients". Joins directory_providers on npi.
CREATE TABLE IF NOT EXISTS provider_network_participation (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npi                   TEXT NOT NULL,
  payer_source_id       UUID NOT NULL REFERENCES payer_sources(id) ON DELETE CASCADE,
  network_id            UUID NOT NULL REFERENCES payer_networks(id) ON DELETE CASCADE,
  accepting_new_patients TEXT NOT NULL DEFAULT 'unknown'
                          CHECK (accepting_new_patients IN ('accepting','not_accepting','unknown')),
  location_ref          TEXT NOT NULL DEFAULT '',      -- Location/… reference; '' sentinel keeps the key idempotent
  raw_specialty_code    TEXT,                          -- NUCC code from PractitionerRole.specialty (join to our taxonomy)
  source_last_updated   TIMESTAMPTZ,                   -- PractitionerRole.meta.lastUpdated
  ingested_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_resource          JSONB,                         -- full source PractitionerRole, never lossy
  UNIQUE (npi, payer_source_id, network_id, location_ref)
);
CREATE INDEX IF NOT EXISTS idx_pnp_npi ON provider_network_participation(npi);
CREATE INDEX IF NOT EXISTS idx_pnp_payer_accepting
  ON provider_network_participation(payer_source_id, accepting_new_patients);
COMMENT ON TABLE provider_network_participation IS 'Enrichment: which of our NPIs are in which payer network + accepting-new-patients. MATCH only; join directory_providers ON npi.';

-- ── payer_unmatched_npis ────────────────────────────────────────────────────
-- Payer providers whose NPI is NOT in directory_providers. We never invent a
-- provider from payer data — NPPES is the identity source of truth — so these are
-- parked here for review instead. Deduped per (npi, payer).
CREATE TABLE IF NOT EXISTS payer_unmatched_npis (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npi                   TEXT NOT NULL,
  payer_source_id       UUID NOT NULL REFERENCES payer_sources(id) ON DELETE CASCADE,
  name                  TEXT,                           -- from the resolved /Practitioner, if we got it
  network_name          TEXT,
  raw_specialty_code    TEXT,
  accepting_new_patients TEXT,
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_resource          JSONB,
  UNIQUE (npi, payer_source_id)
);
CREATE INDEX IF NOT EXISTS idx_payer_unmatched_payer ON payer_unmatched_npis(payer_source_id);
COMMENT ON TABLE payer_unmatched_npis IS 'Payer NPIs absent from directory_providers, parked for review — never auto-created as providers.';
