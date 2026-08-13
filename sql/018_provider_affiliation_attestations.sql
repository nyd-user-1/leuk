-- Leuk — 018: provider_affiliation_attestations (Roster Check write path).
--
-- Insert-only log of a provider's own statement about whether they're still
-- affiliated with a TIN a payer publishes them under. This is our proprietary
-- liveness signal — a rate row proves a contract existed on file_date; this
-- table is the provider telling us, in their own words and their own
-- timestamp, whether that contract still describes them. Never inferred,
-- never guessed — always a written attestation.
--
-- Latest row wins per (npi, normalized tin) — read layer takes DISTINCT ON,
-- newest first. Never UPDATE/DELETE a row; a correction is a new row.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS provider_affiliation_attestations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npi            TEXT NOT NULL,
  tin            TEXT NOT NULL,          -- as published; match on normalized form
  status         TEXT NOT NULL CHECK (status IN ('current','left')),
  attested_month DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paa_npi ON provider_affiliation_attestations (npi, created_at DESC);

COMMENT ON TABLE provider_affiliation_attestations IS
  'Insert-only log of provider-attested affiliation status per (npi, tin). Latest row wins per (npi, normalized tin). Written by lib/repos/rate-signals.ts attestAffiliation() only.';
