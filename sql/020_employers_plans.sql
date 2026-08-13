-- Leuk — 020: employers + plans (the demand-side entity the payer ToCs revealed).
--
-- Every other payer source gave us network→rate. Aetna's per-employer ToC gives
-- employer → plan → network → the rate file that prices it — the "plan ↔ network
-- mapping" flagged missing in the data-model index (NYS-31/36). Backbone for:
--   * "Find my plan" (NYS-37) — member enters employer → their plan → rate;
--   * "Plans" catalog (NYS-39) — browse any sponsor → network → rate;
--   * Employer Signals / Intelligence (NYS-35) — self-funded prospecting.
--
-- Keys: employer = EIN (stable); plan = (employer, plan_name, source_file). The
-- employer NAME is derived from the filed plan name (payer concatenates it with
-- the network product) so it's approximate — the EIN is the real identity.
-- plans.source_file (basename) joins provider_rate_signals.source_file, so a
-- plan resolves to its actual negotiated rows.
--
-- Populated by scripts/mrf/ingest-plans.mjs from payer ToC metadata (Aetna
-- first; UHC/Cigna ToCs carry the same layer — a later source). Idempotent.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS employers (
  ein          TEXT PRIMARY KEY,          -- plan sponsor EIN
  name         TEXT NOT NULL,             -- derived from filed plan name (approx)
  market_type  TEXT,                      -- group | individual
  state        TEXT,                      -- NULL until EIN→state enrichment (NYS-35)
  self_funded  BOOLEAN,                   -- ASO: reporting entity is a Third-Party Administrator
  plan_count   INT NOT NULL DEFAULT 0,
  source       TEXT NOT NULL DEFAULT 'aetna-mrf',
  first_seen   DATE NOT NULL DEFAULT CURRENT_DATE,
  last_seen    DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX IF NOT EXISTS idx_employers_name_lower ON employers (lower(name) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_employers_state ON employers (state);

CREATE TABLE IF NOT EXISTS plans (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_ein      TEXT NOT NULL REFERENCES employers(ein) ON DELETE CASCADE,
  plan_name         TEXT NOT NULL,        -- as filed (employer + network product)
  network_product   TEXT,                 -- Aetna Choice POS II | Open Access | PPO | HMO | …
  reporting_entity  TEXT,                 -- e.g. Aetna Life Insurance Company
  self_funded       BOOLEAN,
  file_schema       TEXT,                 -- IN_NETWORK_RATES | ALLOWED_AMOUNTS | …
  source_file       TEXT,                 -- basename — joins provider_rate_signals.source_file
  file_date         DATE,
  source            TEXT NOT NULL DEFAULT 'aetna-mrf',
  first_seen        DATE NOT NULL DEFAULT CURRENT_DATE,
  last_seen         DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (employer_ein, plan_name, source_file)
);
CREATE INDEX IF NOT EXISTS idx_plans_employer ON plans (employer_ein);
CREATE INDEX IF NOT EXISTS idx_plans_source_file ON plans (source_file);
CREATE INDEX IF NOT EXISTS idx_plans_network ON plans (network_product);

COMMENT ON TABLE employers IS 'Plan sponsors (self-funded employers) from payer ToC metadata. EIN-keyed; name derived from filed plan name. The demand side of the graph.';
COMMENT ON TABLE plans IS 'An employer plan → network product → the rate file that prices it. source_file joins provider_rate_signals for resolved rates.';
