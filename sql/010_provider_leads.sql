-- Public "request an appointment" leads captured on off-platform directory
-- provider profiles (/providers/[slug]) — both a patient hand-off and a
-- recruitment signal ("a patient asked for you"). Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS provider_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES directory_providers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  payer       TEXT, -- free-text insurance ("Aetna", "Healthfirst Medicaid", …)
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_leads_provider ON provider_leads(provider_id);

COMMENT ON TABLE provider_leads IS 'Anonymous public appointment requests for directory providers; Leuk follows up and uses demand as a recruitment hook.';
