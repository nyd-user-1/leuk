// Clinical domain — reads/writes the HIPAA-enabled project (see lib/db.ts).
import { hasPhiDb as hasDb, sqlPhi as sql } from "@/lib/db";
import { isoDateTime } from "@/lib/format";

// Stripe Connect repo — the local mirror of marketplace state (sql/061).
//
// Stripe is the source of truth for what an account may DO; these rows are a
// cache so a page render doesn't have to call Stripe, plus the two ledgers that
// make the webhook safe: stripe_events (idempotency) and stripe_payment_splits
// (what actually got paid to whom, and what we kept).
//
// Dual-mode per the repo convention. The mock side is a module-local store
// rather than an entry in lib/mock/index.ts on purpose: that file is shared
// across concurrent sessions and Connect is a self-contained surface — nothing
// else in the mock graph references these rows.
//
// NO PHI in any field here or in anything derived from it.

export interface ConnectAccount {
  id: string;
  userId: string | null;
  orgTin: string | null;
  stripeAccountId: string;
  businessType: "individual" | "company" | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** Stripe's requirements object, verbatim (currently_due, past_due, disabled_reason…). */
  requirementsDue: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSplit {
  id: string;
  invoiceId: string | null;
  paymentIntentId: string;
  checkoutSessionId: string | null;
  destinationAccountId: string;
  amountCents: number;
  applicationFeeCents: number;
  currency: string;
  transferId: string | null;
  createdAt: string;
}

/** Owner of a connected account — a practitioner today, a billing TIN later. */
export type AccountOwner = { userId: string; orgTin?: null } | { orgTin: string; userId?: null };

type AccountRow = {
  id: string;
  user_id: string | null;
  org_tin: string | null;
  stripe_account_id: string;
  business_type: "individual" | "company" | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  requirements_due: Record<string, unknown> | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toAccount(r: AccountRow): ConnectAccount {
  return {
    id: r.id,
    userId: r.user_id,
    orgTin: r.org_tin,
    stripeAccountId: r.stripe_account_id,
    businessType: r.business_type,
    chargesEnabled: r.charges_enabled,
    payoutsEnabled: r.payouts_enabled,
    detailsSubmitted: r.details_submitted,
    requirementsDue: r.requirements_due,
    createdAt: isoDateTime(r.created_at)!,
    updatedAt: isoDateTime(r.updated_at)!,
  };
}

// ── mock store (no DB) ───────────────────────────────────────────────────────

interface MockConnectStore {
  accounts: Map<string, ConnectAccount>; // keyed by stripeAccountId
  events: Map<string, { id: string; type: string; processedAt: string | null; error: string | null }>;
  splits: Map<string, PaymentSplit>; // keyed by paymentIntentId
}
let _mock: MockConnectStore | null = null;
function mock(): MockConnectStore {
  if (!_mock) _mock = { accounts: new Map(), events: new Map(), splits: new Map() };
  return _mock;
}
let _mockSeq = 0;
const mockId = () => `mock_${++_mockSeq}`;

// ── accounts ─────────────────────────────────────────────────────────────────

/** The connected account for an owner, or null if they've never created one. */
export async function getConnectAccount(owner: AccountOwner): Promise<ConnectAccount | null> {
  const userId = owner.userId ?? null;
  const orgTin = owner.orgTin ?? null;
  if (hasDb) {
    const rows = (await sql`
      SELECT * FROM stripe_connect_accounts
      WHERE (${userId}::uuid IS NOT NULL AND user_id = ${userId}::uuid)
         OR (${orgTin}::text IS NOT NULL AND org_tin = ${orgTin}::text)
      LIMIT 1
    `) as AccountRow[];
    return rows[0] ? toAccount(rows[0]) : null;
  }
  const found = [...mock().accounts.values()].find((a) =>
    userId ? a.userId === userId : a.orgTin === orgTin,
  );
  return found ?? null;
}

/** Look an account up by its Stripe id — the webhook's entry point. */
export async function getConnectAccountByStripeId(stripeAccountId: string): Promise<ConnectAccount | null> {
  if (hasDb) {
    const rows = (await sql`
      SELECT * FROM stripe_connect_accounts WHERE stripe_account_id = ${stripeAccountId} LIMIT 1
    `) as AccountRow[];
    return rows[0] ? toAccount(rows[0]) : null;
  }
  return mock().accounts.get(stripeAccountId) ?? null;
}

/**
 * Record a freshly created Stripe account. ON CONFLICT on the stripe id makes a
 * double-submit harmless; the partial unique on the owner is what stops a second
 * account being created for the same therapist (the route checks first, this is
 * the backstop).
 */
export async function insertConnectAccount(input: {
  owner: AccountOwner;
  stripeAccountId: string;
  businessType?: "individual" | "company" | null;
}): Promise<ConnectAccount> {
  const userId = input.owner.userId ?? null;
  const orgTin = input.owner.orgTin ?? null;
  if (hasDb) {
    const rows = (await sql`
      INSERT INTO stripe_connect_accounts (user_id, org_tin, stripe_account_id, business_type)
      VALUES (${userId}::uuid, ${orgTin}, ${input.stripeAccountId}, ${input.businessType ?? null})
      ON CONFLICT (stripe_account_id) DO UPDATE SET updated_at = now()
      RETURNING *
    `) as AccountRow[];
    return toAccount(rows[0]);
  }
  const now = new Date().toISOString();
  const acct: ConnectAccount = {
    id: mockId(),
    userId,
    orgTin,
    stripeAccountId: input.stripeAccountId,
    businessType: input.businessType ?? null,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    requirementsDue: null,
    createdAt: now,
    updatedAt: now,
  };
  mock().accounts.set(acct.stripeAccountId, acct);
  return acct;
}

/**
 * Sync the capability mirror from a retrieved/updated Stripe account. Called
 * from both GET /api/connect/status and the account.updated webhook — they must
 * write the same columns the same way, so they share this one function.
 */
export async function syncConnectAccount(
  stripeAccountId: string,
  status: {
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: Record<string, unknown> | null;
    businessType?: "individual" | "company" | null;
  },
): Promise<ConnectAccount | null> {
  if (hasDb) {
    const rows = (await sql`
      UPDATE stripe_connect_accounts SET
        charges_enabled   = ${status.chargesEnabled},
        payouts_enabled   = ${status.payoutsEnabled},
        details_submitted = ${status.detailsSubmitted},
        requirements_due  = ${JSON.stringify(status.requirementsDue ?? null)}::jsonb,
        business_type     = COALESCE(${status.businessType ?? null}, business_type),
        updated_at        = now()
      WHERE stripe_account_id = ${stripeAccountId}
      RETURNING *
    `) as AccountRow[];
    return rows[0] ? toAccount(rows[0]) : null;
  }
  const acct = mock().accounts.get(stripeAccountId);
  if (!acct) return null;
  Object.assign(acct, {
    chargesEnabled: status.chargesEnabled,
    payoutsEnabled: status.payoutsEnabled,
    detailsSubmitted: status.detailsSubmitted,
    requirementsDue: status.requirementsDue,
    businessType: status.businessType ?? acct.businessType,
    updatedAt: new Date().toISOString(),
  });
  return acct;
}

/**
 * Who to notify about a connected account. The webhook knows only acct_…, and
 * "you've been paid" / "a dispute was opened" have to reach a person. Name and
 * email only — never widen this into a general user read.
 */
export async function connectAccountContact(
  stripeAccountId: string,
): Promise<{ userId: string; name: string; email: string } | null> {
  if (hasDb) {
    const rows = (await sql`
      SELECT u.id, u.name, u.email
      FROM stripe_connect_accounts a
      JOIN users u ON u.id = a.user_id
      WHERE a.stripe_account_id = ${stripeAccountId} AND u.deleted_at IS NULL
      LIMIT 1
    `) as Array<{ id: string; name: string; email: string }>;
    return rows[0] ? { userId: rows[0].id, name: rows[0].name, email: rows[0].email } : null;
  }
  return null; // mock mode has no user graph wired to Connect
}

// ── events (idempotency ledger) ──────────────────────────────────────────────

/**
 * Claim a webhook event. Returns true if THIS call won the insert and should do
 * the work; false if the event was already recorded (Stripe redelivery, or two
 * concurrent deliveries racing). The row is written before any side effect, so a
 * crash mid-handler leaves processed_at NULL — visible as unfinished, not lost.
 */
export async function claimStripeEvent(evt: {
  id: string;
  type: string;
  stripeAccountId?: string | null;
  payload: unknown;
}): Promise<boolean> {
  if (hasDb) {
    const rows = (await sql`
      INSERT INTO stripe_events (id, type, stripe_account_id, payload)
      VALUES (${evt.id}, ${evt.type}, ${evt.stripeAccountId ?? null}, ${JSON.stringify(evt.payload)}::jsonb)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `) as Array<{ id: string }>;
    return rows.length > 0;
  }
  if (mock().events.has(evt.id)) return false;
  mock().events.set(evt.id, { id: evt.id, type: evt.type, processedAt: null, error: null });
  return true;
}

/** Mark a claimed event finished (or record why it failed). */
export async function completeStripeEvent(id: string, error?: string): Promise<void> {
  if (hasDb) {
    // On failure, processed_at STAYS NULL — that is the worklist contract
    // (sql/061: `WHERE processed_at IS NULL` finds every unfinished event,
    // whether the handler threw or the process died). error says why.
    if (error) {
      await sql`UPDATE stripe_events SET error = ${error} WHERE id = ${id}`;
    } else {
      await sql`UPDATE stripe_events SET processed_at = now(), error = NULL WHERE id = ${id}`;
    }
    return;
  }
  const e = mock().events.get(id);
  if (!e) return;
  if (error) e.error = error;
  else e.processedAt = new Date().toISOString();
}

// ── payment splits ───────────────────────────────────────────────────────────

/**
 * Record what a marketplace payment actually did: gross, our fee, destination.
 * Keyed on the PaymentIntent so a redelivered settlement is a no-op. Written
 * only from the webhook — the success redirect is a UX convenience, not proof.
 */
export async function recordPaymentSplit(input: {
  invoiceId?: string | null;
  paymentIntentId: string;
  checkoutSessionId?: string | null;
  destinationAccountId: string;
  amountCents: number;
  applicationFeeCents: number;
  currency?: string;
  transferId?: string | null;
}): Promise<void> {
  if (hasDb) {
    await sql`
      INSERT INTO stripe_payment_splits (
        invoice_id, payment_intent_id, checkout_session_id, destination_account_id,
        amount_cents, application_fee_cents, currency, transfer_id
      ) VALUES (
        ${input.invoiceId ?? null}::uuid, ${input.paymentIntentId}, ${input.checkoutSessionId ?? null},
        ${input.destinationAccountId}, ${input.amountCents}, ${input.applicationFeeCents},
        ${input.currency ?? "usd"}, ${input.transferId ?? null}
      )
      ON CONFLICT (payment_intent_id) DO UPDATE SET
        transfer_id = COALESCE(EXCLUDED.transfer_id, stripe_payment_splits.transfer_id)
    `;
    return;
  }
  mock().splits.set(input.paymentIntentId, {
    id: mockId(),
    invoiceId: input.invoiceId ?? null,
    paymentIntentId: input.paymentIntentId,
    checkoutSessionId: input.checkoutSessionId ?? null,
    destinationAccountId: input.destinationAccountId,
    amountCents: input.amountCents,
    applicationFeeCents: input.applicationFeeCents,
    currency: input.currency ?? "usd",
    transferId: input.transferId ?? null,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Backfill the transfer id onto an existing split.
 *
 * For a destination charge the Transfer does NOT exist yet when
 * checkout.session.completed fires — Stripe creates it moments later and
 * announces it as its own `transfer.created` event. So the split is written
 * with transfer_id NULL and stays that way unless something reconciles it,
 * which left the audit record permanently incomplete (measured 2026-07-20).
 *
 * Returns false when no split matches — that is normal for transfers we didn't
 * originate, not an error.
 */
export async function attachTransferToSplit(paymentIntentId: string, transferId: string): Promise<boolean> {
  if (hasDb) {
    const rows = (await sql`
      UPDATE stripe_payment_splits
      SET transfer_id = ${transferId}
      WHERE payment_intent_id = ${paymentIntentId} AND transfer_id IS NULL
      RETURNING id
    `) as Array<{ id: string }>;
    return rows.length > 0;
  }
  const s = mock().splits.get(paymentIntentId);
  if (!s || s.transferId) return false;
  s.transferId = transferId;
  return true;
}

// ── revenue analytics (the /analytics Finance card) ────────────────────────

export interface RevenueSnapshot {
  hasAccount: boolean;
  /** All-time, net — the "Lifetime revenue" stat on both Finance and /analytics. */
  lifetimeNetCents: number;
  lifetimeGrossCents: number;
  monthNetCents: number;
  prevMonthNetCents: number;
  /** Trailing 90 days, net — the input to the financing pre-qualification estimate. */
  trailingQuarterNetCents: number;
  sessionCount: number;
  avgSessionNetCents: number;
  /** Eight weeks of net revenue, oldest first — mirrors PracticeSnapshot.weeklySessions. */
  weeklyRevenue: Array<{ label: string; cents: number }>;
}

const EMPTY_REVENUE: RevenueSnapshot = {
  hasAccount: false,
  lifetimeNetCents: 0,
  lifetimeGrossCents: 0,
  monthNetCents: 0,
  prevMonthNetCents: 0,
  trailingQuarterNetCents: 0,
  sessionCount: 0,
  avgSessionNetCents: 0,
  weeklyRevenue: [],
};

/** Fill the empty weeks the same way dashboard.ts's toWeekly does — a gap is a zero. */
function toWeeklyRevenue(rows: Array<{ wk: string; net: number }>): Array<{ label: string; cents: number }> {
  const byWeek = new Map(rows.map((r) => [r.wk.slice(0, 10), Number(r.net)]));
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() - (7 - i) * 7 + 7);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), cents: byWeek.get(key) ?? 0 };
  });
}

/**
 * Net marketplace revenue behind the /analytics Finance card — scoped the same
 * way practiceSnapshot() is (admin = every connected account, practitioner =
 * their own). Reads stripe_payment_splits only; never calls Stripe, so this is
 * one cheap query alongside the rest of the board, not a per-render API hop.
 */
export async function revenueSnapshot(scope: { userId: string | null }): Promise<RevenueSnapshot> {
  if (!hasDb) return EMPTY_REVENUE;

  const totals = (await sql`
    WITH acct AS (
      SELECT stripe_account_id FROM stripe_connect_accounts
      WHERE ${scope.userId}::uuid IS NULL OR user_id = ${scope.userId}::uuid
    ), scope AS (
      SELECT sp.amount_cents, sp.application_fee_cents, sp.created_at
      FROM stripe_payment_splits sp
      JOIN acct a ON a.stripe_account_id = sp.destination_account_id
    )
    SELECT
      (SELECT count(*) FROM acct) AS account_count,
      COALESCE(SUM(amount_cents - application_fee_cents), 0) AS lifetime_net,
      COALESCE(SUM(amount_cents), 0) AS lifetime_gross,
      COALESCE(SUM(amount_cents - application_fee_cents)
        FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_net,
      COALESCE(SUM(amount_cents - application_fee_cents)
        FILTER (WHERE created_at >= date_trunc('month', now() - interval '1 month')
                  AND created_at < date_trunc('month', now())), 0) AS prev_month_net,
      COALESCE(SUM(amount_cents - application_fee_cents)
        FILTER (WHERE created_at >= now() - interval '90 days'), 0) AS trailing_quarter_net,
      COUNT(*) AS session_count,
      COALESCE(AVG(amount_cents - application_fee_cents), 0) AS avg_session_net
    FROM scope
  `) as Array<{
    account_count: number;
    lifetime_net: number;
    lifetime_gross: number;
    month_net: number;
    prev_month_net: number;
    trailing_quarter_net: number;
    session_count: number;
    avg_session_net: number;
  }>;

  const t = totals[0];
  if (!t || Number(t.account_count) === 0) return EMPTY_REVENUE;

  const weekly = (await sql`
    WITH acct AS (
      SELECT stripe_account_id FROM stripe_connect_accounts
      WHERE ${scope.userId}::uuid IS NULL OR user_id = ${scope.userId}::uuid
    )
    SELECT to_char(date_trunc('week', sp.created_at), 'YYYY-MM-DD') AS wk,
           SUM(sp.amount_cents - sp.application_fee_cents)::bigint AS net
    FROM stripe_payment_splits sp
    JOIN acct a ON a.stripe_account_id = sp.destination_account_id
    WHERE sp.created_at >= date_trunc('week', now()) - interval '7 weeks'
    GROUP BY wk ORDER BY wk
  `) as Array<{ wk: string; net: number }>;

  return {
    hasAccount: true,
    lifetimeNetCents: Number(t.lifetime_net),
    lifetimeGrossCents: Number(t.lifetime_gross),
    monthNetCents: Number(t.month_net),
    prevMonthNetCents: Number(t.prev_month_net),
    trailingQuarterNetCents: Number(t.trailing_quarter_net),
    sessionCount: Number(t.session_count),
    avgSessionNetCents: Math.round(Number(t.avg_session_net)),
    weeklyRevenue: toWeeklyRevenue(weekly),
  };
}

/** Splits for one connected account, newest first — the "you've been paid" feed. */
export async function listPaymentSplits(
  destinationAccountId: string,
  limit = 50,
): Promise<PaymentSplit[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT * FROM stripe_payment_splits
      WHERE destination_account_id = ${destinationAccountId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: r.id as string,
      invoiceId: (r.invoice_id as string) ?? null,
      paymentIntentId: r.payment_intent_id as string,
      checkoutSessionId: (r.checkout_session_id as string) ?? null,
      destinationAccountId: r.destination_account_id as string,
      amountCents: r.amount_cents as number,
      applicationFeeCents: r.application_fee_cents as number,
      currency: r.currency as string,
      transferId: (r.transfer_id as string) ?? null,
      createdAt: isoDateTime(r.created_at as Date | string)!,
    }));
  }
  return [...mock().splits.values()]
    .filter((s) => s.destinationAccountId === destinationAccountId)
    .slice(0, limit);
}
