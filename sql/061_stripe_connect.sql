-- Leuk — 061: Stripe Connect marketplace tables (TASK-STRIPE-MARKETPLACE, tranche 1).
--
-- The money model: a client pays Leuk, Leuk pays the therapist's connected
-- account, Leuk keeps an application fee. Tranche 1 uses DESTINATION CHARGES
-- (`transfer_data[destination]` + `application_fee_amount` on a platform Checkout
-- Session), so Stripe moves the money in one hop and these tables only have to
-- record WHO the account is, WHAT Stripe currently allows it to do, and HOW a
-- given payment split.
--
-- Accounts are v1 with CONTROLLER PROPERTIES (not legacy `type=express`):
--   controller[stripe_dashboard][type] = express
--   controller[fees][payer]            = application
--   controller[losses][payments]       = application
-- Requirement collection stays with Stripe; the service agreement stays `full`
-- and is IMMUTABLE per account. Founder-locked 2026-07-20 — see the brief.
--
--   stripe_connect_accounts  one row per payable entity. Today that is a
--                            practitioner (user_id). The group-practice future
--                            is ONE company account per billing TIN, so org_tin
--                            is here now and nullable — a row carries exactly
--                            one owner, enforced below.
--   stripe_events            every webhook event we have accepted, keyed by the
--                            Stripe event id. This IS the idempotency ledger:
--                            the handler inserts first and only does work when
--                            the insert wins, so a redelivered event is a no-op.
--   stripe_payment_splits    the audit-grade record of a marketplace payment —
--                            gross, our application fee, what the therapist got,
--                            and the destination account. Written from the
--                            webhook (the authoritative path), never from the
--                            success redirect.
--
-- NO PHI ANYWHERE IN THESE TABLES OR IN ANYTHING WE SEND STRIPE. Line items say
-- "Therapy session"; metadata carries internal ids only. Stripe signs no BAA.

CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner scope. Exactly one of these is set (see the CHECK below).
  user_id           UUID REFERENCES users(id),
  org_tin           TEXT,                         -- normalized billing TIN, group-practice future
  stripe_account_id TEXT UNIQUE NOT NULL,         -- acct_…
  business_type     TEXT CHECK (business_type IN ('individual','company')),
  -- Mirrors of Stripe's capability flags, synced from account.updated + status
  -- polls. `charges_enabled` is the ONLY gate for offering checkout against an
  -- account — details_submitted is NOT sufficient (a submitted account can still
  -- be blocked). Default false so a fresh row can never accidentally take money.
  charges_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  -- requirements.currently_due / past_due / disabled_reason, verbatim from
  -- Stripe. Rendered as the therapist's "what's left" list; never hand-authored.
  requirements_due  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stripe_connect_accounts_one_owner
    CHECK ((user_id IS NOT NULL) <> (org_tin IS NOT NULL))
);

-- One connected account per owner, whichever kind of owner it is. Partial
-- uniques rather than a plain UNIQUE so the NULL side never blocks a second row.
CREATE UNIQUE INDEX IF NOT EXISTS stripe_connect_accounts_user_uq
  ON stripe_connect_accounts (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stripe_connect_accounts_org_uq
  ON stripe_connect_accounts (org_tin) WHERE org_tin IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_events (
  -- Stripe's own event id (evt_…). PRIMARY KEY is the idempotency mechanism:
  -- INSERT … ON CONFLICT DO NOTHING RETURNING id — no row back means we already
  -- processed this event and the handler exits without repeating side effects.
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  -- Which scope delivered it. Payment events (checkout.session.completed,
  -- charge.dispute.created) arrive on the PLATFORM scope with account NULL;
  -- account.updated arrives on the CONNECTED scope carrying acct_…. `stripe
  -- listen` must subscribe to both or half of these never show up.
  stripe_account_id TEXT,
  payload           JSONB NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when the handler finished its work. A row with received_at but no
  -- processed_at is an event that arrived and then threw — that is the
  -- worklist, not a silent success.
  processed_at      TIMESTAMPTZ,
  error             TEXT
);

CREATE INDEX IF NOT EXISTS stripe_events_type_idx ON stripe_events (type, received_at DESC);
CREATE INDEX IF NOT EXISTS stripe_events_unprocessed_idx
  ON stripe_events (received_at DESC) WHERE processed_at IS NULL;

CREATE TABLE IF NOT EXISTS stripe_payment_splits (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id             UUID REFERENCES invoices(id),
  -- pi_… — unique so a redelivered/duplicated settlement can't double-record.
  payment_intent_id      TEXT UNIQUE NOT NULL,
  checkout_session_id    TEXT,
  -- acct_… of the therapist paid by this charge (destination charge target).
  destination_account_id TEXT NOT NULL,
  amount_cents           INTEGER NOT NULL,   -- gross the client paid
  application_fee_cents  INTEGER NOT NULL,   -- what Leuk kept
  currency               TEXT NOT NULL DEFAULT 'usd',
  transfer_id            TEXT,               -- tr_… once Stripe reports it
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_payment_splits_invoice_idx ON stripe_payment_splits (invoice_id);
CREATE INDEX IF NOT EXISTS stripe_payment_splits_account_idx
  ON stripe_payment_splits (destination_account_id, created_at DESC);
