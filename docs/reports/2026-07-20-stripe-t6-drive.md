# Stripe Connect T6 — end-to-end marketplace drive

Executing `scripts/qa/stripe-e2e.md` against the NYSgpt sandbox (test mode) on
`localhost:3010`. qa-agent, 2026-07-20.

---

## PART 1 — pre-Connect verification (interim; drive pending founder Dashboard action)

**Committed while blocked, on the lead's ruling, for durability** — the
verification below currently exists only in the drive session. PART 2 (the
actual money loop) extends this same file once the founder enables Connect.

### Outcome in one line

The full T6 loop is **blocked at step 1**: no connected account can be created,
because **Connect is not signed up on the sandbox platform account**. Everything
our own code owns up to that boundary is verified working. The one blocker is a
~1-minute founder Dashboard action, escalated by the lead.

### The blocker — measured, not assumed (could NOT reproduce the "Connect enabled" claim)

The T6 environment note stated "Connect is enabled on the sandbox." That is the
one claim I could not reproduce. `stripe.accounts.create(...)` fails from Stripe,
three ways, all identical:

```
POST /api/connect/account  (as brendan, cookie login)
  → HTTP 500  {"error":"Could not create the payout account."}   (our route degrades cleanly)
  underlying Stripe error (dev.log):
    StripeInvalidRequestError 400
    "You can only create new accounts if you've signed up for Connect,
     which you can do at https://dashboard.stripe.com/connect."
    request: req_xdmWO2t6wEbJid   acct_1T1DhaFZHX4S0kX2

Direct Stripe API, bypassing our route entirely:
  accounts.create({controller: <the founder-locked triple>})  → 400  same message
  accounts.create({type:"express"})                            → 400  same message
  accounts.create({type:"standard"})                           → 400  same message
```

So it is **platform-level, not our controller config and not our code** — even
the simplest bare create is rejected. The platform account is otherwise healthy:

```
stripe.accounts.retrieve()  → acct_1T1DhaFZHX4S0kX2  country=US  charges_enabled=true
stripe.accounts.list({limit:1})  → succeeds, returns []   (NOTE: list works even
     when create is blocked, so an empty list is NOT proof Connect is enabled —
     only a successful create is. This is almost certainly the false positive
     behind the original "confirmed via API" note.)
```

**Founder action (~1 min):** Stripe Dashboard → test mode → Connect → sign up /
enable the platform, on `acct_1T1DhaFZHX4S0kX2`. This is the only thing blocking
the whole loop; keys, CLI, and `stripe listen` are all confirmed present.

> **Environment switched after PART 1 was written.** Everything above was
> measured against platform account `acct_1T1DhaFZHX4S0kX2`. The keys were
> re-saved ~03:08 and the environment of record became
> **`acct_1T1DhqFTCTbH09lM`** (NYSgpt sandbox) — a *different* Stripe
> environment, where Connect was then enabled. PART 1's findings stand as
> measured; the account id simply belongs to the prior environment. All of
> PART 2 runs against `acct_1T1DhqFTCTbH09lM`.

### Verified GREEN — everything our code owns short of a connected account

All read-only or degrade-path; no live-DB mutation. Evidence is the actual
response, not an exit code.

**Preflight** (`node --env-file=.env.local scripts/qa/preflight.mjs`): keys
present (`sk_test_…`, `pk_test_…`, `whsec_…`), Stripe CLI `1.43.8`, sql/061
tables present, INV-2026-9003 `sent` $150.00, dev server responding. "Clear to
drive." (The two advisories — CLI login config absent, no connected account yet
— are expected: `stripe listen` is already running detached, and step 1 mints
the account.)

**Auth guards — 401 with no cookie** on every write route:

```
POST /api/connect/account          401
POST /api/connect/account-session  401
POST /api/connect/account-link     401
POST /api/connect/login-link       401
POST /api/checkout/session         401
```

**Graceful degradation — logged-in practitioner, no account yet:**

```
GET  /api/connect/status          200  {"account":null}              (correct "none" state)
POST /api/connect/account-session 404  "No payout account yet. Create one first."
POST /api/connect/account-link    404  "No payout account yet. Create one first."
POST /api/connect/login-link      404  "No payout account yet."
POST /api/connect/account         500  "Could not create the payout account."  (Stripe 400 → clean 500, no partial row written)
```

**Webhook + marketplace gate:**

```
POST /api/stripe/webhook  (unsigned)                → 400  "Missing signature."
POST /api/checkout/session (as Casey, invoice 9003) → 409  "This practitioner hasn't set up payouts yet."
```

The 409 is the marketplace path's `charges_enabled` gate doing its job (it is
read-only — no Checkout Session was created, invoice untouched). This is exactly
the branch the portal Pay button falls back from. **I deliberately did not click
the portal Pay button** — it would fall through to the pre-marketplace mock path
and settle the live invoice, destroying the payable state PART 2 needs.

**Login** works for both roles: `brendan@leuk.demo` → `role=admin` (accepted
by `requireRole("practitioner")` per `lib/auth.ts`), `casey@leuk.demo` →
`role=client`.

**Screenshots (2 of the required set are reachable now):**

- `scratchpad/shot-getpaid-empty.png` — provider Settings › Get paid, the **none**
  state: "Set up payments" empty state, teal CTA, PHI-free copy. Single H1
  "Settings" lives in the TopBar; the page renders none — **canonical layout
  contract holds.**
- `scratchpad/shot-invoice-payable.png` — Casey's portal, INV-2026-9003 sheet in
  its **payable "before"** state: line item "Therapy session" (generic, PHI-safe),
  Balance due $150.00, "Pay $150.00", and the copy "You'll be redirected to
  Stripe's secure checkout" (confirms the portal detects Stripe is live, i.e.
  `hasStripe()` true). No horizontal scroll on the panel.

(The remaining two — active Get-paid card, paid invoice — need a live account and
land in PART 2.)

**Baseline DB — clean, and unchanged by every probe above:**

```
stripe_events: 0   stripe_payment_splits: 0   stripe_connect_accounts: 0
INV-2026-9003: status=sent  total=$150.00  payments=0  splits=0
```

### Claims from the shipping reports — confirmed vs. could-not-reproduce

- **CONFIRMED** — the prep report's finding #5 ("the webhook does not yet record
  splits") is **fixed** in the shipped code: `app/api/stripe/webhook/route.ts`
  now claims the event, records the payment, records the split via
  `recordPaymentSplit`, and sends both receipts. Both event scopes are handled
  (`checkout.session.completed` platform, `account.updated` connected).
- **CONFIRMED** — keys present, CLI installed, `stripe listen` running on both
  scopes, our route/webhook code correct and degrading cleanly.
- **COULD NOT REPRODUCE** — "Connect is enabled on the sandbox." Connect is not
  signed up; see the blocker above.

### Flags for the lead (no Linear filed — lead-only this tranche; no code defect to file)

1. **T5 Resend-id evidence gap (code observation, lead is logging the fix).**
   `lib/email.ts` `sendEmail()` awaits `resend.emails.send(...)` and discards the
   response, so the Resend message id is never captured or logged. "Capture
   Resend message ids" is therefore not satisfiable from our side — in PART 2 I
   will pull ids from the Resend API post-send. Separately worth watching in
   PART 2: recipients are demo addresses (`casey@`/`brendan@leuk.demo`); if
   the Resend sending domain isn't verified, sends to non-owner addresses may 403
   and be swallowed as `false`. (Lead ruled: do not edit `lib/email.ts` — shared
   file, out of my seam; logging the capture-the-id fix as a polish finding.)

2. **Environment-note accuracy.** The "Connect enabled, confirmed via API" note
   was a false positive from `accounts.list` (see the list-vs-create nuance
   above). Flagging so the check is create-based going forward.

### What I could not reach with my access

- Anything downstream of a created connected account: onboarding, the
  `account.updated` capability sync, `charges_enabled`, the destination charge,
  the split, `verify-split.mjs`, the two emails, `login-link {url}`, and the two
  remaining screenshots. All gated on Connect being enabled.
- **Code-read-only caveat:** the `account-link` HTTPS-return-URL guard (503 when
  origin is plain http) is shadowed by the no-account 404 short-circuit, so it
  cannot be exercised live until an account exists. Confirmed by reading
  `app/api/connect/account-link/route.ts` (checks `getConnectAccount` first);
  will exercise in PART 2 if reachable.

### Drive-doc amendments committed (local only, never pushed)

`scripts/qa/stripe-e2e.md`, four commits: (1) primary test card →
`4000 0000 0000 0077` (funds land in the available balance immediately; 4242 kept
as the pending variant); (2) explicit assertion that BOTH proof events are
recorded in `stripe_events` — `checkout.session.completed` (platform) AND
`account.updated` (connected), loop not proven if either is missing; (3)
`stripe_events` column-name fix (`id`/`stripe_account_id`/`received_at`); (4) the
measured Connect-blocker banner replacing the stale "all cleared" note.

### Cleanup status

Nothing to clean yet — the drive created no DB rows (baseline is still 0/0/0 and
the invoice is untouched). PART 2 cleanup will follow the brief: restore
INV-2026-9003, delete the `stripe_events` + `stripe_payment_splits` rows the
drive creates (counts before/after), and **keep** the `stripe_connect_accounts`
row and the Stripe sandbox account (deleting the row while the `acct_…` exists
creates drift; the onboarded account is reusable). Temp helpers
(`scripts/qa/_tmp-*.mjs`) are untracked and never staged; removed at drive
completion.

### PART 2 plan (unblocks the moment Connect is enabled)

account create → embedded/hosted onboarding with Stripe test data (SSN
`000-00-0000`, DOB `1901-01-01`, bank `000123456789`/`110000000`) → wait for
`account.updated` (connected scope) → `charges_enabled=true`, exercise
`GET /api/connect/status` → Casey pays INV-2026-9003 with `4000 0000 0000 0077` →
`checkout.session.completed` (platform scope) settles via webhook (portal shows
paid via the poll, not the redirect) → `verify-split.mjs` diffs Stripe's
PaymentIntent/charge/fee/transfer against `stripe_payment_splits` (expect gross
$150.00 / fee $15.00 / net $135.00 → `acct_…`) → **assert both events recorded in
`stripe_events`** → Resend ids for the two emails via the Resend API →
`POST /api/connect/login-link` → `{ url }` → screenshots (active Get-paid card,
paid invoice) → cleanup as above. The `pi_…`/`ch_…` ids go to the
earnings-surface agent for its demo deep-link.

---

## PART 2 — Connect enabled; account created; drive halted by a capabilities defect + captcha-gated onboarding

Connect was enabled on `acct_1T1DhqFTCTbH09lM` and the drive resumed at ~03:09
local. Steps 1 and 2 of the drive ran; the loop stops short of `charges_enabled`.

### Step 1 — account creation: PASSED, controller triple verified

`POST /api/connect/account` (practitioner cookie) → **200**, `created: true`.

```
stripe_connect_accounts row:
  id                 42062cf9-ee92-43d2-b428-cf068012ae07
  user_id            00000000-0000-4000-8000-000000001001   (Brendan)
  stripe_account_id  acct_1TvBKiJvfwWFuhCf
  charges_enabled=false  payouts_enabled=false  details_submitted=false
```

Retrieved from Stripe — the founder-locked controller triple landed **exactly**:

```
controller.stripe_dashboard.type = express
controller.fees.payer            = application
controller.losses.payments       = application
controller.requirement_collection = stripe      (Stripe collects — the default, as intended)
controller.type                   = application
business_profile.mcc              = 8099
business_profile.product_description = "Outpatient behavioral health sessions billed through Leuk."
metadata = { leukUserId: … }                 (internal id only — no PHI)
```

**Idempotency confirmed:** a second `POST /api/connect/account` returned
`created: false` with the same `acct_…` — no duplicate account minted. (A
duplicate is not cosmetic: it splits payout history and needs Stripe support to
unwind.)

### DEFECT — T2, HIGH: no capabilities requested, so destination charges can never work

`POST /api/connect/account` calls `stripe.accounts.create` **without a
`capabilities` parameter**, so the connected account holds none. A destination
charge REQUIRES the destination account to hold the **`transfers`** capability.
Ours will never acquire it, and its onboarding only ever collects bank + ToS —
so even a fully completed manual onboarding leaves the money loop dead.

Measured against a throwaway account with the identical controller triple but
`capabilities` requested (created and **deleted immediately**, `acct_1TvBf1FIWRJcO7JG`):

```
OURS (no capabilities param)
  capabilities  {}
  currently_due [external_account, tos_acceptance.date, tos_acceptance.ip]

THROWAWAY (capabilities requested)
  capabilities  { card_payments: "inactive", transfers: "inactive" }
  currently_due [business_type, external_account, representative.dob.day/month/year,
                 representative.email, representative.first_name, representative.last_name,
                 settings.payments.statement_descriptor, tos_acceptance.date, tos_acceptance.ip]
```

Current state of our account: `charges_enabled=false`, `payouts_enabled=false`,
`details_submitted=false`, `capabilities {}`, `disabled_reason
"requirements.past_due"`.

**Fix (worker A's seam — I have not touched app/lib code):** add
`capabilities: { transfers: { requested: true }, card_payments: { requested: true } }`
to the `accounts.create` call.

**Ordering matters:** this must be fixed *before* anyone hand-completes
onboarding, or the manual pass collects the wrong requirement set and has to be
redone.

### BLOCKER — Stripe onboarding is captcha/anti-automation protected; it needs a human

Onboarding cannot be completed headlessly, on either surface. This is Stripe
protecting its own flow by design, not a defect in our code:

- **Hosted Account Link** (`connect.stripe.com/setup/e/acct_…`): the first step
  offers "Use test phone number", which fills correctly
  (`phone_number = +10000000000`), but an **invisible hCaptcha challenge iframe
  intercepts pointer events** on the Submit control (an `<a role="button">`):
  `<iframe title="hCaptcha challenge" …> from <div>…</div> subtree intercepts
  pointer events`. After retries the page degrades to "Having trouble signing
  up? Contact Support".
- **Embedded `ConnectAccountOnboarding`** in our own app: renders correctly (3
  Stripe iframes, `embeddedComponent=stripe-connect-account-onboarding`, themed
  to our brand), but the "Add information" entry click does not advance — no new
  frame, no state change.

**I did not attempt to solve or bypass the captcha, and will not** —
circumventing anti-automation is out of bounds. **A human must complete
onboarding once** (~2 min in a real browser). Everything downstream of
`charges_enabled` is fully automatable and will be driven end to end.

### Webhook pipeline — PROVEN HEALTHY (real signed event, end to end)

A genuine Stripe-signed `account.updated` arrived through the forwarder and was
recorded green:

```
id           evt_1TvBZ8FTCTbH09lMIXZ7DW2w
type         account.updated
stripe_account_id  NULL          ← PLATFORM scope (this event is about the platform acct)
received_at  2026-07-20T07:24:42.584Z
processed_at 2026-07-20T07:24:42.774Z
error        NULL
```

So signature verification against the current `whsec`, the `claimStripeEvent`
idempotency path, the handler, and `completeStripeEvent` all work. `handleAccountUpdated`
correctly no-op'd for an account it has no row for (documented behavior).

This is **not** the connected-scope event the both-events assertion needs — that
one carries `stripe_account_id = acct_1TvBKiJvfwWFuhCf` and fires when a human
completes onboarding. **Both-events assertion remains UNPROVEN.**

### PART 1's code-read-only caveat — now CLOSED with live evidence

With an account in place, the previously-shadowed guard is reachable:

```
POST /api/connect/account-link  (http origin)  → 503
  "Hosted onboarding needs an HTTPS return URL. Set CONNECT_RETURN_BASE_URL to a tunnel or the deployed domain."
POST /api/connect/login-link    (pre-onboarding) → 500 "Could not create a dashboard link."
```

The `login-link` 500 is **expected** and matches the route's own documented
comment: Stripe rejects login links for accounts that haven't finished
onboarding; the UI only shows that button in the active state. It will be
re-tested for `{ url }` after onboarding.

### Screenshot added

- `scratchpad/shot-getpaid-onboarding.png` — provider Get-paid in the
  **onboarding** state: "Finish setting up payments" card, the "Open on Stripe
  instead" fallback, and the embedded Stripe component rendering "Add
  information to start accepting money". Two `429` console errors were observed
  from Stripe resource loads (rate limiting; benign, noted not diagnosed).

### Additional flag — secret hygiene

The `stripe listen` forwarder (pid 34143) is invoked with `--api-key sk_test_…`
on the command line, so the secret key is visible in `ps` output to any local
process. Test-mode key, so low severity, but the pattern shouldn't carry to
anything live — prefer `stripe login` / `STRIPE_API_KEY` in the environment.

### Infra note — a whsec false alarm worth recording

An initial check reported a `whsec` MISMATCH between the forwarder log and
`.env.local`. That was a stale artifact: `stripe-listen.log` is the *old*
pre-rebuild forwarder (`whsec_…[redacted]`, process dead). The live forwarder
(pid 34143, both `--forward-to` and `--forward-connect-to`) logs to
`stripe-listen2.log` and its `whsec_…[redacted]` **matches** `.env.local`.
Anyone re-checking this should read `stripe-listen2.log`.

### State at halt

```
stripe_events: 1 (the platform-scope account.updated above)
stripe_payment_splits: 0
stripe_connect_accounts: 1 (acct_1TvBKiJvfwWFuhCf — KEEP per the drift guardrail)
INV-2026-9003: status=sent  $150.00  payments=0     (untouched, still payable)
```

Nothing needs restoring yet: no payment was attempted, and the Pay button was
never clicked (clicking it would fall through to the pre-marketplace mock path
and destroy the payable state the drive needs).

### Still UNPROVEN — the entire money loop

`charges_enabled` · the connected-scope `account.updated` · the destination
charge · the $150/$15/$135 split · `verify-split.mjs` · the both-events
assertion · the two Resend emails · `login-link { url }` · the active-card and
paid-invoice screenshots · and the NYS-173 question (whether the connected
account sees the fee split or only the net). All are gated on: fix the
capabilities defect → a human completes onboarding once → I drive the rest.

---

## NYS-173 ANSWERED — the connected account DOES see the fee split (no `on_behalf_of` needed)

The lead's high-value question: on a destination charge, does the connected
account see the gross + application fee, or only the net? If only the net, the
Earnings Transactions view has nothing to render.

**Answer: the connected account sees the FULL split — gross, fee, and net — on a
plain destination charge with NO `on_behalf_of`.** The Earnings Transactions view
has real data to render; `on_behalf_of` is not required for it.

### Method (isolated — no product code, no DB writes)

A throwaway connected account was created, completed via API, charged, read from
its own perspective, and **deleted**. It could not use our locked controller
shape: Stripe refuses `requirement_collection=application` alongside an express
dashboard — *"When controlling requirement collection, the Connect application
must also control losses, fees, and specify a dashboard type of `none`."* So the
throwaway used `stripe_dashboard.type=none`. Charge mechanics (destination
charge / application fee / transfer) are identical, which is all this question
turns on. Card used: `pm_card_visa` (4242-class), so balances land pending.

### Observed — $150.00 charge, $15.00 application fee (10%)

```
PLATFORM view
  charge ch_3TvBm3FTCTbH09lM1NUNFP8u   amount=150.00 USD  app_fee=15.00 USD
  transfer_data.destination = acct_… (the throwaway)

CONNECTED ACCOUNT view  (Stripe-Account: acct_…)
  charges.list → 1
     py_1TvBm6FbX2CmbctPNx5hjK9Y   amount=150.00 USD   application_fee_amount=1500
  balance_transactions → 1
     payment   amount=150.00 USD   fee=15.00 USD   net=135.00 USD   src=py_1TvBm6…
  balance → pending $135.00   available $0.00
```

The connected account holds its own `py_…` payment object carrying the **gross
$150.00** and the **`application_fee_amount` 1500**, and its balance transaction
decomposes it as **amount 150.00 / fee 15.00 / net 135.00**. Nothing is hidden
from the therapist's side.

### Second finding — `on_behalf_of` carries a real cost

The `on_behalf_of` variant was **rejected**:

```
StripeInvalidRequestError: Your account cannot currently make charges.
  (connected acct capabilities: card_payments "inactive", transfers "active")
```

`on_behalf_of` makes the CONNECTED account the merchant of record, so it requires
an **active `card_payments`** capability — a materially heavier onboarding bar
than `transfers` alone (the throwaway reached `transfers: active` easily but
`card_payments` stayed inactive behind a `settings.payments.statement_descriptor`
requirement that did not clear even once set). Since the plain destination charge
already exposes the full split, **`on_behalf_of` buys nothing here and costs
onboarding completeness** — recommend the own-data Transactions approach.

> Caveat, stated plainly: this is Stripe-side evidence from a throwaway account,
> not a charge driven through our `/api/checkout/session` route. It answers the
> data-model question (which is what the fork turns on); it does NOT substitute
> for the real end-to-end drive, which remains blocked on the human onboarding.

### Housekeeping

Both throwaway accounts created for this experiment were deleted
(`acct_1TvBf1FIWRJcO7JG`, `acct_1TvBjN2ZvyOBBWDX`, `acct_1TvBlNFbX2CmbctP`).
Remaining connected accounts on the sandbox: `acct_1TvBKiJvfwWFuhCf` (our drive
account — KEEP) and **`acct_1TvAliFTCTVBltm7`, which is not mine** — flagged to
the lead rather than deleted, since it isn't this drive's to remove.

---

## PART 2b — capabilities fix applied to the live account; webhook robustness proven

### The drive account was repaired in place — no recreation needed

The capabilities defect was fixed in the route (`96a5f7f`, adds
`transfers` + `card_payments`), and the capabilities were **also applied to the
existing account** `acct_1TvBKiJvfwWFuhCf` (visible as two `capability.updated`
events on the connected scope). It now reports:

```
capabilities   { card_payments: "inactive", transfers: "inactive" }   ← requested, pending requirements
currently_due  [business_type, external_account,
                representative.dob.day/month/year, representative.email,
                representative.first_name, representative.last_name,
                settings.payments.statement_descriptor,
                tos_acceptance.date, tos_acceptance.ip]
```

That is exactly the fuller requirement set the A/B predicted, so **a human
onboarding this account now WILL be productive** — no delete-and-recreate is
required, and the drift guardrail (keep the row + the account) stays intact.

### Webhook robustness — 47 real signed events, zero failures

The NYS-173 experiment incidentally produced a substantial webhook load test.
Across **47 real Stripe-signed events spanning ~15 types** — including many the
handler does not explicitly handle (`capability.updated`, `person.created`,
`person.updated`, `transfer.created`, `application_fee.created`,
`account.application.authorized`/`deauthorized`, `account.external_account.created`,
`payment_intent.*`, `charge.*`) — the ledger recorded:

```
unprocessed: 0        errored: 0
```

Every event was signature-verified, claimed, handled (explicitly or via the
`default: break` fall-through), and completed. Unhandled types are recorded
without side effects exactly as designed, and nothing was left half-done. This
is meaningful evidence for the worklist semantics fix (`1919a3f`): under real
volume, `processed_at` is set and `error` stays NULL on success.

**Connected-scope delivery is proven for the real account too** — the ledger
holds an `account.updated` carrying `stripe_account_id = acct_1TvBKiJvfwWFuhCf`,
processed green. The both-events assertion still needs the *post-onboarding*
`account.updated` (the one that flips `charges_enabled` true), but the connected
scope itself is no longer in doubt.

### Event-ledger cleanup (experiment noise removed)

The experiment's events referenced now-deleted throwaway accounts and deleted
test charges, and would have made the final two-event assertion unreadable.
Removed, with counts:

```
stripe_events BEFORE: 47
  deleted, belonged to deleted throwaway accounts:      29
  deleted, platform-scope charges from the experiment:  14
stripe_events AFTER:  4
stripe_payment_splits: 0   (unchanged — no marketplace charge has settled)
```

Remaining rows are the real drive's own lifecycle records only:

```
account.updated     platform                processed  error=none
account.updated     acct_1TvBKiJvfwWFuhCf   processed  error=none
capability.updated  acct_1TvBKiJvfwWFuhCf   processed  error=none
capability.updated  acct_1TvBKiJvfwWFuhCf   processed  error=none
```

Deleting these was safe despite the ledger's redelivery caution: every deleted
row referenced a Stripe object that no longer exists, so a redelivery could only
no-op. `INV-2026-9003` remains `sent` / $150.00 / 0 payments — untouched and
still payable.

### Remaining blocker — one human step

Everything is now staged for the loop. The **only** thing outstanding is the
captcha-gated onboarding, which needs a human for ~2 minutes in a real browser
on `acct_1TvBKiJvfwWFuhCf`. The moment `charges_enabled` flips, the rest —
payment, the split, `verify-split.mjs`, the both-events assertion, the Resend
ids, `login-link { url }`, and the final two screenshots — is fully automated
and ready to run.

---

# PART 3 — THE LOOP IS PROVEN (end to end, on the real route)

The founder completed onboarding at ~07:52. Everything below was then driven
unattended. **A client paid Leuk, Leuk kept 10%, the therapist's connected
account got the rest, and Stripe's own API confirms it.**

## The ids (prominent — the earnings agent needs the `py_`)

```
PLATFORM side   PaymentIntent  pi_3TvC5uFTCTbH09lM0lMpLyII
                Charge         ch_3TvC5uFTCTbH09lM0E4g9P2B
                ApplicationFee fee_1TvC5yJvfwWFuhCfC7lXfk1J
                Transfer       tr_3TvC5uFTCTbH09lM0WDv60If
                Checkout sess  cs_test_a1vGDKcQiuFMmgVBjDSWMvkF2i

CONNECTED side  Payment        py_1TvC5yJvfwWFuhCfDyGRZhFx      ← Earnings deep-link id
                BalanceTxn     txn_1TvC5yJvfwWFuhCfQP5NE7nK
                Account        acct_1TvBKiJvfwWFuhCf
```

`/earnings?view=transactions&payment=py_1TvC5yJvfwWFuhCfDyGRZhFx`

## Onboarding completed (the human step)

Watched `currently_due` drain in real time as the founder worked: 11 → 16
(expanded when business_type was chosen) → 4 → 3 → 2 → **0**.

```
07:52:01  charges=true  payouts=true  details=true
          capabilities {card_payments:"active", transfers:"active"}  due=0
```

`GET /api/connect/status` then synced our row: `chargesEnabled=true`,
`payoutsEnabled=true`, `detailsSubmitted=true`, `businessType="individual"`,
`requirementsDue` all-empty. The capabilities fix is vindicated — both
capabilities went **active**, which is exactly what a pre-fix account could
never have reached.

## The payment (driven as Casey, card 4000 0000 0000 0077)

Portal → Unpaid → INV-2026-9003 → **Pay $150.00** → redirect to
`checkout.stripe.com`. Checkout rendered the amount `$150.00` and the generic
line item **"Therapy session"** (PHI-safe — confirmed on Stripe's own page).
Paid, then redirected back to
`localhost:3010/portal/invoices?paid=1&session_id=cs_test_a1vGDK…`.

> **Drive gotcha worth keeping:** Stripe Checkout renders the payment-method
> list with **nothing selected** ("PAYMENT METHOD REQUIRED") and the card fields
> do not exist until *Card* is chosen — a naive `fill('cardNumber')` silently
> no-ops and the payment never submits. Also uncheck "Save my information",
> which forces a phone number. Both are now handled in the driver.

## Settlement — via the webhook, not the redirect

```
invoice INV-2026-9003 → paid
payment  $150.00 card  pi_3TvC5uFTCTbH09lM0lMpLyII  paid_at 07:58:36.130Z
split    pi_3TvC5u… → acct_1TvBKiJvfwWFuhCf  amount 15000  fee 1500  transfer_id NULL
```

## THE BOTH-EVENTS ASSERTION — PASS

```
PASS  checkout.session.completed (platform scope): 1 matching, 1 recorded green
        evt_1TvC5vFTCTbH09lMpGtdobQN  acct=NULL (platform)  processed_at=07:58:37.326Z  error=NULL
PASS  account.updated (connected scope): 7 matching, 7 recorded green
        evt_1TvBgWJvfwWFuhCfHfSt73sB  acct=acct_1TvBKiJvfwWFuhCf  processed_at=07:32:21.292Z  error=NULL

unprocessed-or-errored events: 0
BOTH PROOF EVENTS PRESENT AND GREEN — the loop is proven.
```

## The split, from Stripe's own API (`verify-split.mjs`)

```
Charge ch_3TvC5u…   amount 150.00 USD   app fee 15.00 USD   destination acct_1TvBKiJvfwWFuhCf
ApplicationFee fee_1TvC5y…   amount 15.00 USD   refunded false
Transfer tr_3TvC5u…          amount 150.00 USD  → acct_1TvBKiJvfwWFuhCf

SPLIT
  client paid        150.00 USD
  Leuk fee         15.00 USD   (10.00% of gross)
  transfer moved     150.00 USD   → acct_1TvBKiJvfwWFuhCf
  therapist KEEPS    135.00 USD   (connected bt txn_1TvC5y…: amount 150.00 − fee 15.00)
  ✓ transfer = full gross 15000
  ✓ 15000 − 1500 = 13500 net to the therapist

Connected account acct_1TvBKiJvfwWFuhCf
  charges_enabled true   payouts_enabled true   details_submitted true
  pending 0.00 USD   available 135.00 USD
  connected payment py_1TvC5y…  amount 150.00 USD  application_fee_amount 1500
```

**The `0077` card behaved exactly as the amendment promised** — funds landed in
**available $135.00** with **pending $0.00**, so the payout side verified with no
waiting. That validates drive-doc amendment #1 on real money movement.

### Correction to the expected model (and two real bugs fixed in `verify-split.mjs`)

The drive doc predicted `charge − fee = transfer` (150 − 15 = 135). **That is
wrong**, and measurement proved it: for a destination charge with
`application_fee_amount`, the transfer moves the **full gross ($150)** and the
fee is deducted on the **connected side**. The therapist's real take is the
connected balance transaction's `net`:

```
transfer.amount        = 15000   (the whole 150.00 — NOT 135.00)
connected bt.amount    = 15000
connected bt.fee       =  1500   ← our application fee lands here
connected bt.net       = 13500   ← what the therapist actually keeps
```

The economics are exactly right ($135 to the therapist, 10% to Leuk); only
the script's model was wrong. Two bugs fixed in `scripts/qa/verify-split.mjs`
(my seam):

1. It asserted `gross − fee === transfer.amount`, which would have **failed a
   perfectly correct split forever**. Now asserts the measured model and reports
   the therapist's true net from the connected balance transaction.
2. `stripe.balance.retrieve({ stripeAccount })` passed the account as a *query
   param* → `400 "Received unknown parameter: stripeAccount"`, which crashed the
   script before it could print the ledger diff. Correct signature is
   `retrieve({}, { stripeAccount })`. It also now prints the connected `py_…` id.

## DEFECT — `stripe_payment_splits.transfer_id` is never populated

The one problem `verify-split.mjs` reports:

```
OUR RECORD vs STRIPE
  ✓ amount_cents           ours=15000  stripe=15000
  ✓ application_fee_cents  ours=1500   stripe=1500
  ✓ destination_account_id ours=acct_1TvBKiJvfwWFuhCf  stripe=acct_1TvBKiJvfwWFuhCf
  ✗ transfer_id            ours=—      stripe=tr_3TvC5uFTCTbH09lM0WDv60If
```

**Cause:** `handleCheckoutCompleted` reads `charge.transfer` at
`checkout.session.completed` time, but for a destination charge the transfer
does not exist yet at that instant — `transfer.created` arrives afterwards as
its own event (visible in the ledger, immediately after
`checkout.session.completed`). So the column is written NULL and **never
reconciled**, permanently.

Severity: MEDIUM. Money moved correctly and every other field agrees; the gap is
in our audit record, which is precisely the thing `stripe_payment_splits` exists
to be. Reconciling a payout to a Stripe transfer later means joining by
PaymentIntent instead of the column built for it.

**Fix (route owner's seam — not mine, untouched):** handle `transfer.created`
(or `charge.updated`) and backfill `transfer_id` by `payment_intent_id`. The
event is already being delivered and recorded green; the handler just falls
through to `default`.

## T5 emails — both sent, with ids, and both BOUNCED

Pulled from the Resend API (our `sendEmail` discards the response, so the ids are
not in our logs — the PART 1 flag stands):

```
e45bdde7-447a-4c34-b0ac-b9540eca75d8  → brendan@leuk.demo
    "You've been paid $135.00 — INV-2026-9003"     created 07:58:37.399Z  last_event: bounced
8f223edf-8665-4b2e-910c-8fe5158ccf4a  → casey@leuk.demo
    "Receipt — $150.00 paid on INV-2026-9003"      created 07:58:37.239Z  last_event: bounced
```

Both fired from the webhook within ~1s of settlement, from
`Leuk Psychiatry <billing@nysgpt.com>`. **The subject lines prove the split
math independently**: the therapist is told **$135.00** (net) and the client
**$150.00** (gross), with the client receipt correctly omitting the fee per the
lead's ruling.

**But `last_event: bounced` on both** — `@leuk.demo` is not a real domain, so
nothing was delivered. Exactly the risk flagged in PART 1. For a demo
environment this is expected and harmless; it is recorded so nobody later reads
"emails sent" as "emails received". Real delivery is unverified and cannot be
verified against demo addresses.

## `POST /api/connect/login-link` — PASS

```
HTTP 200   { url: … }   host connect.stripe.com
```

Returns a valid single-use Express Dashboard URL now that onboarding is
complete. **URL deliberately not printed** (single-use, short-lived). Its
pre-onboarding 500 (PART 2) was correct behavior, not a bug.

## Screenshots

- `scratchpad/shot-getpaid-active.png` — provider Get-paid **active**: "Accepting
  payments" + "Payouts on" badges, the `acct_…` id, and the "Stripe dashboard"
  button.
- `scratchpad/shot-invoice-paid.png` — Casey's portal, INV-2026-9003 with the
  green **Paid** badge, `Total $150.00 / Paid −$150.00 / Balance due $0.00`,
  "Payments received — Card · Jul 20, 2026 · $150.00", and **no Pay button**.
  Tabs now read **Unpaid 0 / Paid 4**; the Overview shows Outstanding balance
  $0.00 and the payment in history.
- `scratchpad/shot-checkout.png` — Stripe Checkout showing "Therapy session
  $150.00" (PHI-safe line item on Stripe's own page).
- Earlier states: `shot-getpaid-empty.png` (none), `shot-getpaid-onboarding.png`
  (onboarding), `shot-invoice-payable.png` (payable "before").

All four provider card states — none → onboarding → active — plus payable → paid
on the client side are captured.

## NYS-173 — confirmed a second time, on the REAL charge

The throwaway experiment's answer holds on the production path: the connected
account's own `py_1TvC5y…` carries `amount=150.00` **and**
`application_fee_amount=1500`, and its balance transaction decomposes
`150.00 / 15.00 / 135.00`. **The Earnings Transactions view has real data**, with
no `on_behalf_of`.

---

## Cleanup — live DB returned to its pre-drive baseline

```
                         BEFORE            AFTER
stripe_events              35                0     (pre-drive baseline: 0) ✓
stripe_payment_splits       1                0     (pre-drive baseline: 0) ✓
INV-2026-9003          paid, 1 payment    removed  (it was seeded for this drive) ✓
stripe_connect_accounts     1                1     ← KEPT, deliberately
```

- `seed-test-invoice.mjs --cleanup` → `invoices 1, payments 1, splits 1` removed.
- `stripe_events` deleted 35 → 0. Safe: the drive is finished, and a redelivery
  of any of these would only re-run against an invoice that no longer exists.
- **`stripe_connect_accounts` row KEPT** (`acct_1TvBKiJvfwWFuhCf`,
  `charges_enabled=true`, `payouts_enabled=true`) — the documented exception.
  Deleting the row while the Stripe account exists creates drift, and the
  onboarded account is reusable, which matters because re-onboarding costs
  another human captcha pass.
- **Stripe-side test objects stay** per the brief: the PaymentIntent, charge,
  application fee, transfer, and the connected account's `py_…` all still exist,
  so the earnings agent's deep-link resolves. All three of my *throwaway*
  accounts were deleted.
- Temp drivers (`scripts/qa/_tmp-*.mjs`) removed; never staged, never committed.

## Final verdict

**T6 PASSES.** A client paid Leuk $150.00, Leuk kept $15.00 (10.00%), and
$135.00 landed in the therapist's connected account — confirmed against Stripe's
own API, not our logs. Both proof events arrived on their correct scopes and were
recorded green, with zero unprocessed and zero errored events across the drive.

### Open items for the lead

1. **DEFECT (MEDIUM) — `stripe_payment_splits.transfer_id` never populated.**
   Route owner's seam. Fix by backfilling from `transfer.created`.

2. **T5 emails bounce on demo addresses.** Both send correctly with right
   amounts; `@leuk.demo` isn't real, so `last_event: bounced`. Real
   deliverability remains unverified and can't be verified against demo
   addresses.

3. **`sendEmail` still discards the Resend message id** (PART 1 flag) — ids had
   to be pulled from the Resend API.

4. **Secret hygiene** — the forwarder passes `--api-key` on the command line,
   visible in `ps`.

5. **Stray sandbox account `acct_1TvAliFTCTVBltm7`** — not mine, untouched.

### What I could not verify

- **Real email delivery** — bounced by design on demo addresses.
- **Payout to a real bank** — test-mode bank; `payouts_enabled=true` and
  available balance $135.00 are as far as this goes.
- **The onboarding UX itself** — completed by a human because it is captcha-gated;
  I verified its start and end states, not the middle.
- `on_behalf_of` behavior end-to-end — rejected in the probe for lack of an
  active `card_payments` capability; reported as a constraint, not a measurement.

---

## NYS-174 — the post-submit transition on the Get-paid card

**Asked for, and I must be straight about it: I did NOT observe the moment.** The
founder completed onboarding in their own browser; my instrumentation was
API-side polling, not a view of their screen. So I have no measurement of what
the card rendered immediately after "Agree and submit". What follows is a
code-read hypothesis plus the one relevant timing fact I do have.

**Structural finding (read from `app/(app)/settings/payments/payments-client.tsx`):
the card has no polling.** `refresh()` — the only thing that re-reads status — is
called from exactly four places: mount, the manual **Refresh** button, the error
banner's "Try again", and `ConnectAccountOnboarding`'s `onExit`. There is no
`setInterval`, no webhook-driven push to the client.

So after submit, the card updates only if BOTH hold:

1. Stripe's embedded component actually fires `onExit`, and
2. at that instant Stripe has already flipped `charges_enabled`.

Condition 2 is a genuine race: capabilities activate **asynchronously** after
submission. If `onExit` fires promptly, `refresh()` can legitimately read
`chargesEnabled=false` with `detailsSubmitted=true` — and `connectStage()` maps
exactly that to **`"pending"`**, i.e. the "Verification in progress" card. Nothing
then re-checks. The surface would sit on "Verification in progress" until the
user clicks Refresh, which is very likely what the founder experienced (it would
present as "stuck", not as a spinner — there is no spinner in that state).

**The timing fact I do have, which partly cuts against the severity:** my 5-second
API polling showed `details_submitted` and `charges_enabled` flipping inside the
*same* 5s sample:

```
07:51:39  charges=false payouts=false details=false due=2
07:52:01  charges=true  payouts=true  details=true  due=0
```

So the async gap was under ~5s here, and I have no evidence of a prolonged
pending state. The race is real but may be narrow — it would widen for any
account Stripe actually queues for review.

**Suggested fix (UI seam, not mine — not touched):** poll `GET /api/connect/status`
on a short interval while `stage !== "active"` and stop once active, so the card
self-corrects instead of depending on a single `onExit` landing after an
asynchronous capability flip. Cheap, and it removes the dependency on Stripe's
callback firing at all.

---

## Cross-surface fee labelling — our email says "Platform fee", Stripe's component says "Processing fees"

Raised by the earnings agent from its screenshots and worth recording here,
because the two surfaces a therapist sees now disagree about what our $15 is.

**Chrome we control — the payout email — is correct** (`lib/email/stripe-notifications.ts`):

```
subject  "You've been paid $135.00 — INV-2026-9003"
         Client paid    $150.00
         Platform fee   −$15.00
         Your payout    $135.00     (bold)
```

"Platform fee" is the honest label: it names the money as Leuk's, not as a
cost of moving the card. The client receipt correctly shows only
`Invoice` + `Amount paid $150.00` with no fee line, per the lead's ruling.

**Chrome we do NOT control — Stripe's embedded `payment_details` — calls the
same $15 "Processing fees"**, and that string is Stripe's own copy inside the
iframe, not reachable via the appearance API. So on the Earnings page a therapist
sees Leuk's revenue presented as if it were card-processing cost.

Both numbers are right; only the naming conflicts. Two observations for the
pricing/copy fork rather than a defect to fix:

- The inconsistency is *between* surfaces — a therapist reading the email learns
  we take a platform fee, then sees the same amount described on the Earnings
  page as a processing cost. Whichever framing is chosen, they should match.

- The email is the surface where the distinction can actually be drawn, so it is
  the right place to carry the honest wording — which it already does. If the
  Earnings page needs to correct the record, it can only do so in *our* copy
  around the Stripe component, not inside it.

No change made — labelling is a founder pricing/copy decision (fork 1), and the
email currently reads honestly.
