# Stripe Connect — T6 end-to-end drive

The exact drive that proves TASK-STRIPE-MARKETPLACE tranche 1 works: a client
pays Leuk, Leuk keeps 10%, the therapist's connected account gets the
rest — and Stripe's own API confirms it, not our logs.

Written 2026-07-20 by qa-agent against the live tree. Everything below the
"measured" marker was run; everything else is the drive to run once the
blockers clear. **Test mode only. The DATABASE_URL is live.**

---

## Status — 3 of 4 blockers cleared; Connect signup still MISSING (T6 run 2026-07-20)

> **Update (T6 execution, 2026-07-20):** Three of the four prep blockers are
> resolved: `.env.local` holds `STRIPE_SECRET_KEY`,
> `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and `STRIPE_WEBHOOK_SECRET` (NYSgpt
> sandbox, test mode; quoted — strip quotes in shell); the Stripe CLI is
> installed (`1.43.8`) and `stripe listen` is running detached on both scopes.
>
> **The Connect platform is NOT signed up on the sandbox** — measured, not
> assumed. `stripe.accounts.create(...)` returns `400 invalid_request_error:
> "You can only create new accounts if you've signed up for Connect"` for the
> controller triple AND for bare `type:express`/`type:standard` alike, so it is
> platform-level, not a config problem. Our `POST /api/connect/account` degrades
> cleanly to a 500 with a friendly message. Platform account
> `acct_1T1DhaFZHX4S0kX2` is otherwise healthy (US, `charges_enabled=true`).
> **Founder action, ~1 min:** Stripe Dashboard → test mode → Connect → sign up /
> enable the platform. This is the ONLY thing blocking the whole T6 loop.
>
> The block below is the historical record from the prep session.

### Status at time of writing — 4 blockers, all founder-side

`node --env-file=.env.local scripts/qa/preflight.mjs` (measured 2026-07-20):

```
FAIL  STRIPE_SECRET_KEY                   absent
FAIL  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  absent
FAIL  STRIPE_WEBHOOK_SECRET               absent
FAIL  stripe CLI                          not installed
PASS  sql/061 tables                      stripe_connect_accounts, stripe_events, stripe_payment_splits
WARN  test invoice                        (now seeded — see below)
WARN  connected account                   none yet
PASS  dev server                          localhost:3010 responding
```

**The brief's assumption that Stripe keys already exist is wrong.** It reasoned
"existing invoice checkout implies they exist" — but `.env.local` has no
`STRIPE_*` key at all. The existing checkout has been running on the *mock*
path this whole time: `getStripe()` returns null (`lib/stripe.ts:17`) and
`app/api/stripe/checkout/route.ts:43` hands back a fake success redirect. It
has never talked to Stripe. Nothing about T6 can run until real test keys land.

Clearing all four is ~10 minutes:

```bash
brew install stripe/stripe-cli/stripe && stripe login
# Dashboard → test mode → Developers → API keys → copy both into .env.local:
#   STRIPE_SECRET_KEY=sk_test_…
#   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
node scripts/qa/capture-whsec.mjs        # writes STRIPE_WEBHOOK_SECRET surgically
# Dashboard → Connect → enable the platform (test mode)
npm run dev                              # restart: Next reads .env.local at boot
```

Then re-run preflight until it says **Clear to drive**.

---

## Test data (Stripe's designated test values)

| Field | Value | Notes |
|---|---|---|
| SSN (full) | `000-00-0000` | Passes verification |
| SSN (last 4) | `0000` | |
| Date of birth | `1901-01-01` | Triggers *immediate successful* verification |
| — failure variant | `1902-01-01` | Immediate failure, for the unhappy path |
| Address line 1 | `address_full_match` | Literal string; forces a verified address |
| Phone | `000-000-0000` | |
| Bank routing | `110000000` | |
| Bank account | `000123456789` | Success |
| — failure variant | `000111111116` | Account-number failure, for the unhappy path |
| Card (primary) | `4000 0000 0000 0077` | Funds land in the **available** balance immediately — payout verification is instant. Any future expiry, any CVC, any ZIP. |
| Card (pending variant) | `4242 4242 4242 4242` | Succeeds but funds sit in the **pending** balance; use only when you want to exercise the pending→available path. |
| ID document | upload any file | Test mode accepts anything |

In test mode Stripe renders a **"Use test data"** control inside the onboarding
component that fills these for you — prefer it over typing. If it prompts for
an SMS code and the fill control doesn't cover it, that step is skippable in
test mode; don't invent a code. (Stripe's testing reference:
`https://docs.stripe.com/connect/testing`.)

---

## The seeded test invoice — MEASURED, and it needs cleanup

Casey Morgan's three existing invoices are **all `paid`**, so the portal had
nothing payable and T4 had nothing to click. Seeded exactly one row:

```
INV-2026-9003   $150.00   status=sent   → Casey Morgan <casey@leuk.demo>
  invoice id   00000000-0000-4000-8000-000000009003
  appointment  33d613d6-2d32-4844-965e-673df96a349b (completed 2026-06-15)
  therapist    Brendan Stanton <brendan@leuk.demo>
  expected 10% split: fee $15.00 · therapist $135.00
```

Verified rendering with a real cookie login (not assumed): `POST
/api/auth/login` as Casey → 200, `GET /portal/invoices` → 200 containing
`INV-2026-9003`, `$150.00`, and exactly one **Pay now** button.

> **CLEANUP — live database.** When the tranche is done:
> `node --env-file=.env.local scripts/qa/seed-test-invoice.mjs --cleanup`
> Removes the invoice, its items and payments (cascade), and its
> `stripe_payment_splits` rows. It deliberately leaves `stripe_events` alone —
> that's the idempotency ledger keyed by Stripe's event id, and deleting rows
> there would let a redelivered event re-run its side effects. Stripe-side test
> objects can stay.

Three choices in that row are load-bearing; don't "tidy" them:

- **The invoice number must end in digits.** `nextInvoiceNumber()`
  (`lib/repos/invoices.ts:215`) runs `SUBSTRING(number FROM 10)::int` over every
  `INV-2026-%` row. A friendly number like `INV-2026-QA01` makes that cast throw
  and **breaks invoice creation for the whole app**. `9003` is simply next after
  the existing 9001/9002 demo pair.
- **`appointment_id` must be set.** An invoice reaches a therapist only through
  its appointment — that's how the destination account resolves. The existing
  demo invoices all have it NULL, which would leave a marketplace charge with
  nobody to pay.
- **`status` must be `sent`.** The portal filters drafts out
  (`app/portal/invoices/page.tsx`), so a draft is invisible to Casey.

`brendan@leuk.demo` is `role=admin`, which `requireRole("practitioner")`
accepts (`lib/auth.ts:241`) — so the same login both creates the connected
account and owns the session being billed. That's what makes the demo coherent.

---

## The drive

Two terminals: `npm run dev` in one, `stripe listen` in the other.

### 0 — Forward both event scopes

```bash
stripe listen --forward-to localhost:3010/api/stripe/webhook \
              --forward-connect-to localhost:3010/api/stripe/webhook
```

This is the step people get wrong. Payment events (`checkout.session.completed`,
`charge.dispute.created`) arrive on the **platform** scope;
`account.updated` arrives on the **connected** scope. A plain `stripe listen`
subscribes to the platform only, so the therapist's onboarding status never
syncs and the "Get paid" card sits at pending forever while everything looks
fine. If your CLI version rejects `--forward-connect-to`, run a second
`stripe listen --events account.updated --forward-connect-to …` alongside.

### 1 — Provider creates the account

Sign in `brendan@leuk.demo` / `demo` → Settings → **Get paid** → create.

Expect: `POST /api/connect/account` 200; a row in `stripe_connect_accounts`
with `charges_enabled=false`; the card moves to the embedded onboarding state.

```bash
psql "$DATABASE_URL" -c "select stripe_account_id, business_type, charges_enabled, details_submitted from stripe_connect_accounts;"
```

Confirm the controller triple actually landed the way the founder locked it —
this is the one thing that is painful to change later:

```bash
stripe accounts retrieve acct_… | \
  jq '{controller, business_type, mcc: .business_profile.mcc, capabilities}'
```

Want: `controller.stripe_dashboard.type = "express"`,
`controller.fees.payer = "application"`,
`controller.losses.payments = "application"`, and the service agreement left at
default (`full` — **immutable per account**).

### 2 — Complete onboarding with the test data

Work through the embedded component using the table above. Watch the
`stripe listen` terminal: `account.updated` should arrive on the connected
scope each time a requirement clears.

Expect at the end: `charges_enabled=true`, `payouts_enabled=true`,
`details_submitted=true`, `requirements_due` empty.

```bash
node --env-file=.env.local scripts/qa/preflight.mjs   # connected account → PASS
```

**`charges_enabled` is the gate, not `details_submitted`.** A submitted account
can still be blocked. Do not offer checkout until it is true.

### 3 — Client pays

Sign in `casey@leuk.demo` / `demo` → `/portal/invoices` → `INV-2026-9003`
→ **Pay now** → card `4000 0000 0000 0077` (primary — funds land in the
available balance immediately, so the transfer/payout side verifies without a
pending wait), any future expiry / CVC / ZIP.

Expect: redirect to Stripe, then back to the portal; `stripe listen` shows
`checkout.session.completed`; the invoice flips to **paid** — *via the webhook,
not the redirect*.

### 4 — Prove the split

```bash
node --env-file=.env.local scripts/qa/verify-split.mjs
```

This is the evidence step, so it deliberately does not trust our own database.
It finds the PaymentIntent, retrieves it **from Stripe**, and prints:

- `PaymentIntent` status + amount
- `Charge` — amount, `application_fee_amount`, `transfer_data.destination`, `transfer`
- `ApplicationFee` object — what Leuk actually kept
- `Transfer` object — amount and destination account
- the arithmetic: `charge.amount − application_fee = transfer.amount`, and the
  fee as a percentage (must be 10.00%)
- the connected account's own balance (the therapist's view)
- **a diff of Stripe against our `stripe_payment_splits` row**, field by field
- the `stripe_events` ledger, flagging any event claimed but never completed

**Both proof events must be present in `stripe_events` — assert this explicitly.**
The loop is only proven when the ledger holds a *recorded* row (`processed_at`
set, `error` NULL) for BOTH:

- `checkout.session.completed` — arrives on the **platform** scope; this is what
  flips the invoice to paid and writes the split.
- `account.updated` — arrives on the **connected** scope; this is what synced the
  therapist's `charges_enabled` to true so checkout was allowed at all.

If either is absent — or present but stuck with `processed_at` NULL / `error` set
— the loop is **not proven**, regardless of what the invoice or the split row
say. A paid invoice with no recorded `account.updated` means the status sync
never happened and the "active" gate was crossed on stale data. Capture the
ledger rows verbatim in the report.

```bash
psql "$DATABASE_URL" -c "select id, type, stripe_account_id, processed_at, error from stripe_events order by received_at;"
```

(`stripe_account_id` is NULL for platform-scope events and the `acct_…` for
connected-scope events, so it doubles as the scope check — one row with it NULL
`checkout.session.completed`, one with it set `account.updated`.)

For `INV-2026-9003` the expected result is:

```
client paid        150.00 USD
Leuk fee         15.00 USD   (10.00% of gross)
therapist receives 135.00 USD   → acct_…
✓ 15000 − 1500 = 13500
VERDICT: split verified end to end — Stripe and our ledger agree.
```

It exits non-zero and lists every problem otherwise. **Read the output, not the
exit code** — the problem list is the finding. A green `stripe_payment_splits`
row with no matching Stripe transfer is precisely the failure this catches: our
row is a claim written by the same code under test, so it can never be its own
evidence.

Equivalent raw calls, if you want them by hand:

```bash
stripe payment_intents retrieve pi_… --expand latest_charge
stripe charges retrieve ch_…                       # application_fee_amount, transfer_data.destination
stripe application_fees list --charge ch_…
stripe transfers retrieve tr_…                     # amount + destination
stripe balance retrieve --stripe-account acct_…    # the therapist's side
```

### 5 — Emails (T5)

Confirm a client receipt and a "you've been paid $135.00 (fee $15.00 withheld)"
went out; capture the Resend message ids. Names and amounts only — no PHI.

### 6 — Screenshots

Provider "Get paid" card in each state (no account → onboarding → pending →
active), and the paid invoice in Casey's portal.

---

## Findings worth carrying into the report

1. **No Stripe keys existed** — the brief's premise was wrong, and the existing
   checkout has been mock-only since it was written. Blocks T6 entirely.

2. **The Stripe CLI is not installed**, so `stripe listen` — the only route to
   localhost and the only way to see connected-scope events — is unavailable.

3. **PHI leak risk in the *existing* checkout route.**
   `app/api/stripe/checkout/route.ts:74-76` sends
   `"${invoice.number} — Leuk Psychiatry"` as the Stripe product name and joins
   every invoice item description into `product_data.description`. Stripe signs
   no BAA, and the brief's guardrail is "line items say *Therapy session*". Our
   seeded item is generic so the drive itself is clean, but the code path will
   forward whatever an item description happens to say. The new marketplace
   route must not copy this, and the existing one should be narrowed. Flagged
   for the route owner — QA owns `scripts/qa/` only.

4. **The invoice-number cast is a live footgun** for anyone seeding data:
   any `INV-2026-*` row with a non-numeric suffix breaks invoice creation
   app-wide. Documented above; worth a guard in the repo eventually.

5. **The webhook does not yet record splits.** As of this writing
   `app/api/stripe/webhook/route.ts` handles only `checkout.session.completed`
   and calls neither `claimStripeEvent` nor `recordPaymentSplit` from
   `lib/repos/stripe-connect.ts`. Until T2 wires those in, `verify-split.mjs`
   will report the missing split row rather than a pass — which is the correct
   reading, not a script bug.

---

## Files

| Path | What it does |
|---|---|
| `scripts/qa/preflight.mjs` | Every precondition in one pass, each with its fix |
| `scripts/qa/seed-test-invoice.mjs` | Seeds / inspects / removes the one test invoice |
| `scripts/qa/capture-whsec.mjs` | Writes `STRIPE_WEBHOOK_SECRET` into `.env.local` surgically, with a backup |
| `scripts/qa/verify-split.mjs` | Retrieves the split from Stripe and diffs it against our ledger |
