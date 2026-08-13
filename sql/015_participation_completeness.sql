-- Leuk — 015: data-completeness + coarse-directory support.
--
-- Some payer directories publish the full Plan-Net signal (network + accepting-
-- new-patients), others are bare. Healthfirst's PractitionerRole carries NO
-- network-reference and NO newpatients extension — only that a provider is in
-- their directory. We must never dress that up as a network/accepting claim, so:
--   * data_completeness marks each row: 'full' (Cigna, Humana) vs 'coarse'
--     (Healthfirst — presence only).
--   * coarse rows have network_id NULL (we claim no specific network) and
--     accepting_new_patients 'unknown' (we never guess).
-- network_id becomes nullable; coarse rows get their own partial unique index so
-- re-runs stay idempotent (the existing UNIQUE covers full, network-bearing rows).
--
-- Additive + idempotent; safe to run while a harvest is in progress.

ALTER TABLE provider_network_participation
  ADD COLUMN IF NOT EXISTS data_completeness TEXT NOT NULL DEFAULT 'full';
COMMENT ON COLUMN provider_network_participation.data_completeness IS
  'full = network + accepting captured (Cigna, Humana); coarse = directory-presence only, no network/accepting (Healthfirst).';

-- Allow coarse (no-network) rows.
ALTER TABLE provider_network_participation ALTER COLUMN network_id DROP NOT NULL;

-- Idempotency for coarse rows (network_id IS NULL): one row per (npi, payer, location).
-- CONCURRENTLY so it never blocks the running Humana upserts.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_pnp_coarse
  ON provider_network_participation (npi, payer_source_id, location_ref)
  WHERE network_id IS NULL;
