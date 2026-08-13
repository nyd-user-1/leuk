# TASK-STRIPE-MARKETPLACE — Connect marketplace, tranche 1 (test-mode, full loop)

Written 2026-07-20 ~01:30 by the lead from a live founder session. This file is
both the **decision record** and the **build brief** — a fresh lead executes
from this file cold. Companion references, all in-repo:

- `docs/reference/stripe-connect-digest.md` — sourced digest of the Connect
  account-management docs (five decision lenses; every claim has a URL).
- `stripe-sample-code/` — Stripe's official v1 onboarding sample (untracked,
  reference only, NEVER stage it). Placeholder keys, no secrets.
- The founder pasted the full marketplace guide + essential tasks + charge
  types + embedded/Managed-Risk docs into the lead session 2026-07-20; the
  digest §refs cover the same ground.

## Mission

Leuk becomes the Headway/Alma money model with a moat they don't have:
**clients pay Leuk, Leuk pays the therapist (connected account), Leuk
keeps an application fee — and our 14.5M-row attested-rate corpus prices it.**
Proof point already measured (NPI 1588146039, Padgett): payers pay the SAME
clinician differently under Headway's TIN vs Orenda's TIN (Empire 90791:
$199.14 vs ≤$122.22; Aetna 90837: up to $196.24 vs $160.89) — "know what
you'd make direct" is a sales weapon no competitor can print.

## Decisions LOCKED by the founder (2026-07-20, do not re-litigate)

1. **Accounts v1, not v2.** v2 is preview-gated; v1 is GA and the sample uses
   it. Stripe supports v2 endpoints against v1 accounts later — nothing is
   throwaway. SDK: `stripe` v20 (per the sample).
2. **Controller properties, not legacy `type=express`:**
   `controller[stripe_dashboard][type]=express` ·
   `controller[fees][payer]=application` ·
   `controller[losses][payments]=application` ·
   requirement collection stays with Stripe (default). Service agreement stays
   default (`full`) — it is IMMUTABLE per account.
3. **Destination charges tonight** (`transfer_data[destination]` +
   `application_fee_amount` on a platform Checkout Session). **Migration
   target** (NOT tonight): separate charges & transfers with
   `source_transaction`, releasing the transfer on appointment completion
   (no-show/cancel logic lives in that gap).
4. **Application fee = 10% hardcoded placeholder.** Test-mode only. Real
   pricing (%, flat, subscription, or mix) is an OPEN business decision.
5. **Account model:** solo therapist = `business_type=individual` account;
   group practice = ONE `business_type=company` account per billing TIN with
   clinicians as Persons. Networked onboarding is NOT a KYC-sharing mechanism
   across clinicians (digest §2) — don't design around it.
6. **Embedded components ARE tonight's UI** (they work on Express-config
   accounts): account_onboarding + notification_banner + account_management
   (+ balances/payouts where trivial) rendered inside Leuk via
   AccountSession + `@stripe/connect-js`. Account Links kept as fallback path.
7. **Resend emails are in scope tonight** — webhook-driven, reusing the
   existing Resend wiring.
8. **Managed Risk / Embedded Support / `losses=stripe` / `dashboard=none` are
   PARKED** — irreversible per-account liability config, anti-recommended for
   destination charges (digest §3/§5). Morning-after fork, founder decides.

## Hard guardrails

- **No PHI to Stripe, ever.** Line items say "Therapy session" (or similarly
  generic); metadata carries internal ids only (invoice id, appointment id);
  statement descriptors carry no clinical context. Stripe signs no BAA.
- **Test mode only this tranche.** No live keys, no live charges. The live
  DATABASE_URL is real — clean up test rows you create in OUR db; Stripe test
  objects can stay.
- `charges_enabled` must be checked true before offering checkout against a
  connected account (`details_submitted` is NOT sufficient).
- Account Link URLs: single-use, short-lived, HTTPS-only (even localhost) —
  never emailed; render/redirect in-app only.
- `logEvent` audit on every route that reads/writes payment state.

## Founder checklist (Dashboard, ~10 min, test mode — BLOCKS T2 onward)

- [ ] Enable the Connect platform on the Stripe account (test mode).
- [ ] Confirm `STRIPE_SECRET_KEY` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test
      keys) are in `.env.local` (existing invoice checkout implies they exist —
      verify they're TEST keys).
- [ ] `stripe login` for the CLI so `stripe listen --forward-to
      localhost:3010/api/stripe/webhook` works; put the printed `whsec_…` in
      `.env.local` as `STRIPE_WEBHOOK_SECRET`.
- [ ] Optional polish: Connect branding (name/icon/color) for the onboarding
      + Express surfaces.
- Live-mode gates (NOT tonight, listed so nobody is surprised): platform
  profile, business verification, Site Links for embedded components,
  responsibilities acknowledgment, **and set the three Stripe env vars in
  Vercel** (verified 2026-07-20: `vercel env ls` shows zero Stripe vars have
  ever been deployed — which also closed the historical-PHI-exposure question;
  the founder's Dashboard UI attempt that night didn't save).

## Build tasks (tranche 1)

### T1 — Schema (sql/061 range; check `ls sql/` for collisions first)
`stripe_connect_accounts`: id, owner scope (practitioner user id now; org/TIN
column nullable for the group-practice future), `stripe_account_id` unique,
business_type, charges_enabled, payouts_enabled, details_submitted,
requirements_due jsonb, timestamps. `stripe_events`: event id (unique, for
idempotency), type, account scope, payload jsonb, processed_at. Repo module
`lib/repos/stripe-connect.ts` with the `hasDb ? sql : mock` convention; dates
out as ISO strings.

### T2 — API routes (all `requireUser`/`requireRole`, AuthError→status)
- `POST /api/connect/account` — create v1 account with the controller triple
  (+ `business_profile.mcc` 8049 "podiatrists/psychologists" family — pick the
  behavioral-health MCC deliberately, document choice; `business_profile.
  product_description` for URL-less therapists), persist row.
- `POST /api/connect/account-session` — AccountSession with the component set
  enabled (onboarding, notification banner, account management, balances,
  payouts).
- `POST /api/connect/account-link` — fallback hosted onboarding (return/refresh
  URLs on an HTTPS base; use the deployed domain or tunnel for the redirect
  targets in dev).
- `GET /api/connect/status` — retrieve account, sync the enabled/dues columns.
- `POST /api/stripe/webhook` — signature-verified; idempotent via
  `stripe_events`; handle `account.updated` (sync status),
  `checkout.session.completed` (mark invoice paid, record split),
  `payout.paid`/`payout.failed`, `charge.dispute.created` (flag + email).
  Mind the two event scopes: payment events arrive on the platform scope,
  `account.updated` on the connected scope (`stripe listen` needs both).
- `POST /api/checkout/session` — for a given (test) invoice/appointment:
  Checkout Session, `mode=payment`, generic line item from the invoice amount,
  `payment_intent_data[transfer_data][destination]` = therapist's acct,
  `application_fee_amount` = 10% (one shared helper so the number lives in ONE
  place), success/cancel URLs back into the portal.

### T3 — Provider UI: "Get paid" (ui seam, kit primitives only)
Card/section in the provider Settings area: state machine
(no account → create; created → embedded onboarding component; pending → dues
from status; active → notification banner + account management + balances/
payouts components + "open Express Dashboard" link). `@stripe/connect-js` +
`@stripe/react-connect-js`; CSP updated for Stripe frames/scripts. Follow the
canonical layout rules (no new H1s; TopBar owns the title).

### T4 — Client payment surface
On a (seeded/test) unpaid invoice in the client portal: "Pay" → checkout
session → Stripe-hosted page → success back to portal with paid state
reflected (via webhook, not the redirect). Demo logins per CLAUDE.md.

### T5 — Resend notifications (reuse existing wiring; no new provider)
Webhook-driven: client receipt on payment success; "you've been paid X (fee Y
withheld)" to the therapist; onboarding-incomplete nudge (manual trigger is
fine tonight); dispute-created alert to the practice. Plain, honest copy; no
PHI in emails beyond names/amounts.

### T6 — End-to-end verification (the tranche isn't done until this passes)
Scripted drive, output captured in the report: create account → embedded
onboarding completed with Stripe test data (SSN 000-00-0000, test bank
000123456789/110000000) → status active → client pays with 4242… → webhook
rows present → retrieve the PaymentIntent/charge and SHOW the split (charge
$X, application fee $X×0.10, transfer to acct_…) → Resend messages sent (log
ids). Screenshots of the provider card states + the paid invoice.

## Seams

- OWNS: `app/api/connect/**`, `app/api/stripe/**`, `app/api/checkout/**`,
  `lib/repos/stripe-connect.ts`, `lib/stripe.ts` (new server helper),
  sql/061+, the Settings "Get paid" surface, portal pay surface, email
  templates. Package adds: `stripe`, `@stripe/connect-js`,
  `@stripe/react-connect-js` (+ `@stripe/stripe-js` if needed).
- DO-NOT-TOUCH: `components/rates/**`, `app/(app)/workspace/**` (NYS-161/162
  parked), `components/site/**`, `stripe-sample-code/` (reference only),
  `docs/QUEUE.md` (lead's), existing invoice code paths beyond the minimal
  hook-in (extend, don't rewrite).
- House rules: explicit staging only, local commits, **NO push** (push=deploy;
  founder gates), report per protocol (evidence, flags, Linear intents —
  Linear stays lead-only).

## Open forks for the morning (decision list, founder + lead)

1. Real pricing model (fee %, flat, SaaS subscription via platform-Customer
   card in v1; v2 balance-debit later — digest §4).
2. Managed Risk / Embedded Support liability triple (irreversible; digest §3).
3. Separate charges & transfers migration + cancellation/no-show policy.
4. Group-practice (TIN) onboarding of a real org; 1099 stack (WE file
   1099-NEC; $600 threshold; tax capability freezes payouts if enabled before
   tax-info collection — digest §5).
5. Go-live checklist (site links, platform profile, restricted keys, Radar).
6. Product: the direct-vs-aggregator cohort query (NPIs holding both own-TIN
   and aggregator-TIN rates) as a recruiting/marketplace surface.
