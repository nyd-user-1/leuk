-- Leuk — 004: NPPES as a second provider directory source.
--
-- The Medicaid feed (keti-qx5t) only lists Medicaid-enrolled providers and
-- can't isolate psychiatrists / psychiatric NPs. NPPES (the national NPI
-- registry) fills the gap: statewide, all-payer, taxonomy-classified. Ingested
-- from the monthly data-dissemination file, filtered to NY practice location +
-- mental-health taxonomy codes (see scripts/ingest-directory.mjs).
--
-- This migration only widens the source enum; rows land via the ingest script.

ALTER TABLE directory_providers DROP CONSTRAINT IF EXISTS directory_providers_source_check;
ALTER TABLE directory_providers
  ADD CONSTRAINT directory_providers_source_check CHECK (source IN ('medicaid', 'nppes'));

COMMENT ON COLUMN directory_providers.source IS 'medicaid (keti-qx5t Socrata feed) | nppes (national NPI registry file). UNIQUE(source, source_id) for idempotent upsert; source_id = NPI for nppes.';
