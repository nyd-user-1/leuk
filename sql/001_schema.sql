-- Leuk — schema (001). Matches BUILD_SPEC.md "Entity model (canonical)" exactly.
-- uuid PKs via gen_random_uuid(), TIMESTAMPTZ, CHECK-constrained enums, snake_case.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role          TEXT NOT NULL CHECK (role IN ('admin','practitioner','client')),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_hue    TEXT NOT NULL DEFAULT 'teal' CHECK (avatar_hue IN ('teal','amber','pink','blue')),
  phone         TEXT,
  timezone      TEXT NOT NULL DEFAULT 'America/New_York',
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS 'Login accounts: staff (admin/practitioner) and client portal users; soft-deleted via deleted_at.';

-- ── sessions ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
COMMENT ON TABLE sessions IS 'Cookie session tokens (leuk_session); rows die with their user.';

-- ── clients ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID REFERENCES users(id) ON DELETE SET NULL,
  first_name                TEXT NOT NULL,
  last_name                 TEXT NOT NULL,
  dob                       DATE,
  email                     TEXT,
  phone                     TEXT,
  address                   TEXT,
  gender                    TEXT,
  pronouns                  TEXT,
  status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('lead','active','archived')),
  tags                      TEXT[] NOT NULL DEFAULT '{}',
  primary_practitioner_id   UUID REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_practitioner ON clients(primary_practitioner_id);
CREATE INDEX IF NOT EXISTS idx_clients_last_name ON clients(lower(last_name));
COMMENT ON TABLE clients IS 'Patient/client records; user_id links an optional portal login.';

-- ── services ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price_cents  INTEGER NOT NULL,
  color        TEXT NOT NULL DEFAULT 'teal',
  telehealth   BOOLEAN NOT NULL DEFAULT false,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE services IS 'Bookable service types (duration, price, calendar slot color).';

-- ── locations ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  address    TEXT,
  kind       TEXT NOT NULL CHECK (kind IN ('office','telehealth')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE locations IS 'Places of service: physical offices and the telehealth pseudo-location.';

-- ── availability ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday         INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_availability_practitioner ON availability(practitioner_id);
COMMENT ON TABLE availability IS 'Weekly recurring bookable windows per practitioner (weekday 0=Sun).';

-- ── appointments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id),
  practitioner_id  UUID NOT NULL REFERENCES users(id),
  service_id       UUID NOT NULL REFERENCES services(id),
  location_id      UUID REFERENCES locations(id),
  starts_at        TIMESTAMPTZ NOT NULL,
  ends_at          TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','confirmed','arrived','completed','cancelled','no_show')),
  video_room       TEXT,
  booked_via       TEXT NOT NULL DEFAULT 'staff' CHECK (booked_via IN ('staff','portal','link')),
  notes_brief      TEXT,
  cancelled_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_practitioner_starts ON appointments(practitioner_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
COMMENT ON TABLE appointments IS 'Calendar events tying client + practitioner + service + location with a status lifecycle.';

-- ── note_templates ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  template   TEXT NOT NULL CHECK (template IN ('soap','dap','progress','intake','free')),
  body_md    TEXT NOT NULL,
  is_builtin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE note_templates IS 'Markdown skeletons (SOAP/DAP/Progress/...) used to pre-fill new clinical notes.';

-- ── notes ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id),
  appointment_id UUID REFERENCES appointments(id),
  author_id      UUID NOT NULL REFERENCES users(id),
  template       TEXT NOT NULL DEFAULT 'free' CHECK (template IN ('soap','dap','progress','intake','free')),
  title          TEXT NOT NULL,
  body_md        TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','locked')),
  signed_at      TIMESTAMPTZ,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_client ON notes(client_id);
CREATE INDEX IF NOT EXISTS idx_notes_appointment ON notes(appointment_id);
COMMENT ON TABLE notes IS 'Clinical documentation (soft-deleted, sign-and-lock lifecycle); PHI.';

-- ── transcripts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcripts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  segments       JSONB NOT NULL DEFAULT '[]',
  summary_md     TEXT,
  status         TEXT NOT NULL DEFAULT 'recording' CHECK (status IN ('recording','processing','ready')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transcripts_appointment ON transcripts(appointment_id);
COMMENT ON TABLE transcripts IS 'AI-scribe session transcripts: segments [{t0,t1,speaker,text}] + generated summary.';

-- ── forms ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS forms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  schema      JSONB NOT NULL DEFAULT '{"blocks":[]}',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE forms IS 'Intake/assessment form definitions; schema.blocks = [{id,type,label,options,required}].';

-- ── form_responses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS form_responses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id      UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL REFERENCES clients(id),
  answers      JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','in_progress','submitted')),
  submitted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_form_responses_form ON form_responses(form_id);
CREATE INDEX IF NOT EXISTS idx_form_responses_client ON form_responses(client_id);
COMMENT ON TABLE form_responses IS 'A form sent to a client and their answers keyed by block id.';

-- ── payers / insurance_policies ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  payer_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE payers IS 'Insurance companies (name + clearinghouse payer code).';

CREATE TABLE IF NOT EXISTS insurance_policies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  payer_id   UUID NOT NULL REFERENCES payers(id),
  member_id  TEXT NOT NULL,
  group_id   TEXT,
  kind       TEXT NOT NULL DEFAULT 'primary' CHECK (kind IN ('primary','secondary')),
  status     TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('unverified','verified','inactive')),
  copay_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_client ON insurance_policies(client_id);
COMMENT ON TABLE insurance_policies IS 'A client''s coverage with a payer (member/group ids, verification status, copay).';

-- ── invoices / invoice_items / payments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number             TEXT UNIQUE NOT NULL,
  client_id          UUID NOT NULL REFERENCES clients(id),
  appointment_id     UUID REFERENCES appointments(id),
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue','void')),
  issued_on          DATE,
  due_on             DATE,
  subtotal_cents     INTEGER NOT NULL DEFAULT 0,
  tax_cents          INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL DEFAULT 0,
  stripe_checkout_id TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
COMMENT ON TABLE invoices IS 'Client invoices with human numbers (INV-2026-0001) and a draft→sent→paid/overdue/void lifecycle.';

CREATE TABLE IF NOT EXISTS invoice_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 1,
  unit_cents   INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
COMMENT ON TABLE invoice_items IS 'Line items; meaningless without their invoice, so they cascade.';

CREATE TABLE IF NOT EXISTS payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount_cents          INTEGER NOT NULL,
  method                TEXT NOT NULL CHECK (method IN ('card','cash','insurance','other')),
  stripe_payment_intent TEXT,
  paid_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
COMMENT ON TABLE payments IS 'Money received against an invoice (Stripe card, cash, insurance, other).';

-- ── threads / messages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_threads_client ON threads(client_id);
COMMENT ON TABLE threads IS 'Secure-message conversations between the practice and one client.';

CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON messages(thread_id, created_at);
COMMENT ON TABLE messages IS 'Individual secure messages within a thread; read_at marks recipient receipt.';

-- ── files ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  uploader_id UUID REFERENCES users(id),
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  url         TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'upload' CHECK (kind IN ('upload','form_pdf','superbill')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_client ON files(client_id);
COMMENT ON TABLE files IS 'Client documents: portal uploads, rendered form PDFs, generated superbills.';

-- ── audit_events (append-only) ────────────────────────────────────────────────
-- APPEND-ONLY: never UPDATE or DELETE rows. actor_id has no FK on purpose so the
-- trail survives hard user removal (NULL actor = system). Enforce at the role level:
--   REVOKE UPDATE, DELETE ON audit_events FROM <app_role>;
CREATE TABLE IF NOT EXISTS audit_events (
  id        BIGSERIAL PRIMARY KEY,
  actor_id  UUID,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT,
  meta      JSONB NOT NULL DEFAULT '{}',
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_at ON audit_events(at);
COMMENT ON TABLE audit_events IS 'Append-only PHI access/change log (HIPAA); no UPDATE/DELETE ever.';

-- ── updated_at trigger on mutable tables ──────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','clients','services','locations','availability','appointments',
    'note_templates','notes','transcripts','forms','form_responses',
    'payers','insurance_policies','invoices','invoice_items','payments',
    'threads','messages','files'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
