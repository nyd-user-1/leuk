-- Leuk — 006: enrich directory_providers with the NPPES fields we skipped.
--
-- The first NPPES pass captured ~30% of the file. This adds the high-value
-- columns the field catalog flagged (docs-nppes-field-catalog.md): real primary
-- specialty + subspecialty (from the primary-taxonomy switch, not first-match),
-- the full taxonomy array, credential, gender, license state, tenure/freshness/
-- deactivation dates, solo-vs-group, parent-org affiliation, and the Medicaid
-- cross-link. Populated by the enrichment re-ingest (--source=nppes). Medicaid
-- rows leave these NULL. Idempotent add-if-not-exists.

ALTER TABLE directory_providers
  ADD COLUMN IF NOT EXISTS entity_type        TEXT,      -- 1=individual, 2=organization
  ADD COLUMN IF NOT EXISTS primary_taxonomy   TEXT,      -- NUCC code flagged primary
  ADD COLUMN IF NOT EXISTS subspecialty       TEXT,      -- NUCC specialization of the MH taxonomy
  ADD COLUMN IF NOT EXISTS taxonomies         TEXT[],    -- all taxonomy codes the provider holds
  ADD COLUMN IF NOT EXISTS credential         TEXT,      -- MD / PhD / PsyD / LCSW / NP …
  ADD COLUMN IF NOT EXISTS gender             TEXT,      -- M / F (NPPES "Provider Sex Code")
  ADD COLUMN IF NOT EXISTS license_state      TEXT,      -- state that issued the license
  ADD COLUMN IF NOT EXISTS enumeration_date   DATE,      -- when the NPI was first issued (tenure)
  ADD COLUMN IF NOT EXISTS last_update_date   DATE,      -- last NPPES record update (freshness)
  ADD COLUMN IF NOT EXISTS deactivated_at     DATE,      -- NPI deactivation date (NULL = active)
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT,     -- DT=death DB=disbanded FR=fraud OT=other
  ADD COLUMN IF NOT EXISTS reactivated_at     DATE,      -- reactivation after a deactivation
  ADD COLUMN IF NOT EXISTS is_sole_proprietor BOOLEAN,   -- solo vs group practice
  ADD COLUMN IF NOT EXISTS parent_org         TEXT,      -- parent organization legal name
  ADD COLUMN IF NOT EXISTS medicaid_id        TEXT;      -- Other Identifier type 05 (Medicaid cross-link)

-- Filter on active prescribers/specialty quickly.
CREATE INDEX IF NOT EXISTS idx_dir_providers_primary_taxonomy ON directory_providers(primary_taxonomy);
CREATE INDEX IF NOT EXISTS idx_dir_providers_subspecialty ON directory_providers(subspecialty);
-- Partial index: the common "active only" predicate.
CREATE INDEX IF NOT EXISTS idx_dir_providers_active ON directory_providers(source) WHERE deactivated_at IS NULL;
