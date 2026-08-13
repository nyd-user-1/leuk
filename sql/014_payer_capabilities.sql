-- Leuk — 014: payer capability + probe metadata on payer_sources.
--
-- Task 2A harvests many payer Plan-Net directories, each with different auth,
-- pagination, IG version, and bulk-export support. Record what we detect by
-- probe so the ingester picks a strategy per payer instead of assuming Humana's
-- shape, and so a probe run leaves an auditable trail (last_probe_result).
--
-- Allowed values live in comments (not CHECK constraints) to keep this migration
-- idempotent + append-only like 006. Idempotent; safe to re-run.

ALTER TABLE payer_sources
  -- none | oauth2_client_credentials | unknown  (finer than the existing auth_type)
  ADD COLUMN IF NOT EXISTS auth_strategy        TEXT DEFAULT 'unknown',
  -- bundle_next_link | narrow_query_slices | bulk_export | unknown
  ADD COLUMN IF NOT EXISTS pagination_strategy  TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS supports_include     BOOLEAN,   -- _include on PractitionerRole
  ADD COLUMN IF NOT EXISTS supports_lastupdated BOOLEAN,   -- _lastUpdated → incremental sync
  ADD COLUMN IF NOT EXISTS bulk_export_url      TEXT,      -- $export kickoff URL (NDJSON), if any
  ADD COLUMN IF NOT EXISTS ig_version           TEXT,      -- Plan-Net IG version (1.0.0, 1.1.0, …)
  ADD COLUMN IF NOT EXISTS role_cardinality     TEXT,      -- many_loc_many_net | one_loc_one_net | unknown
  -- probing | harvest_now | needs_registration | blocked | unusable | out_of_scope | live | unknown
  ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_probe_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_probe_result    JSONB,
  -- max _lastUpdated seen across a payer's resources → next sync is incremental
  ADD COLUMN IF NOT EXISTS max_last_updated     TIMESTAMPTZ;

COMMENT ON COLUMN payer_sources.status IS 'Probe verdict / lifecycle: probing|harvest_now|needs_registration|blocked|unusable|out_of_scope|live|unknown';
COMMENT ON COLUMN payer_sources.last_probe_result IS 'Raw capability probe output (status, auth, directory?, npi?, $export?, _include?, paginates?, cardinality, ig).';
