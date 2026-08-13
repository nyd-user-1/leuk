# Stripe marketplace — provider Earnings page (tranche 2, item 4)

ui-agent (EARNINGS seam), 2026-07-20. Brief: `docs/TASK-STRIPE-MARKETPLACE.md`
(tranche-2 item 4) + the lead's kickoff. Companion: T3 report
`docs/reports/2026-07-20-stripe-t3.md`. One commit, local. **Not pushed.**

## Outcome

New practitioner-only route **`/earnings`** — the money view over the Stripe
connected account. Built, type-checked, and verified headless in **every** state:
the gated/empty state, the practitioner-only gate, and — since the T6 drive
landed — the live money views against a real settled charge.

**The founder's shot exists and the fee split rendered:** Transactions shows the
$150.00 charge with Amount $150.00 / Processing fees −$15.00 / **Net $135.00**,
and Overview shows the therapist's balance holding the $135.00. Details and
screenshots under "The demo" below.

## Commits

| | |
|---|---|
| `e33b29a` | The Earnings page — Overview / Transactions / Payouts, gated on `charges_enabled`; route-title + sidebar nav |
| `b772df8` | Fix — render `payment_details` bare; it brings its own modal chrome (caught by the live capture) |

## What shipped

Three embedded surfaces under one pinned notification banner, chosen via a
`SegmentedControl` (the T3 pattern):

- **Overview** — `ConnectBalances` + a muted next-payout framing line.

- **Transactions** — `ConnectPayments` (the list; the built-in per-charge detail
  is powered by `payment_details` being enabled in the AccountSession). A
  `?payment=<id>` deep-link opens `ConnectPaymentDetails` in a kit `SidePanel`
  flyover — the one place the **application-fee split** is shown, and the target
  of a future "view this payment" link in a payout email. This is also the
  deterministic path for the demo screenshot (no clicking into a cross-origin
  Stripe iframe).

- **Payouts** — `ConnectPayouts` + `ConnectPayoutsList`.

- **Notification banner** pinned across all three views, height-clipped to zero
  until Stripe reports a notice (kept mounted so the iframe still loads and fires
  `onNotificationsChange` — height-clip rather than `display:none` so a hidden
  frame can't fail to report).

- **Express Dashboard** demoted to a quiet `TextLink` (variant `underline`),
  calling `POST /api/connect/login-link` → `{ url }` — a muted fallback, not a
  primary action.

- **`disputes_list` omitted by design** — destination charges put disputes on the
  PLATFORM, so a connected account's dispute list is empty and would read as
  broken.

- **Gating** — nothing money-related mounts unless the account is `active`
  (`charges_enabled` true). Any earlier stage (no account, mid-onboarding, or
  verification pending) collapses to one `EmptyState` — "Set up payments first" —
  pointing at `/settings/payments`. The brief's rule: never mount money
  components for an account that can't take charges.

### Files

New, all under `app/(app)/earnings/`:

- `page.tsx` — thin server shell; passes the publishable key, wraps the client in
  `<Suspense>` (it reads `?view=` / `?payment=` search params). Auth is inherited
  from `app/(app)/layout.tsx` (no session → `/sign-in`, client → `/portal`), so
  the route is practitioner-only by construction.

- `earnings-client.tsx` — the state machine + the three views.

**Reused, not edited** (as the brief required — "import, don't edit"): the
settings seam's `connect-embed.tsx` (the `ConnectComponentsProvider` runtime +
kit theming) and `connect-api.ts` (the five-call route contract). The Earnings
client imports both by relative path; it never touches `lib/repos/stripe-connect.ts`
or `app/api/**`.

**Kit primitives only** — SegmentedControl, Card, EmptyState, Banner, Button,
Spinner, TextLink, SidePanel, plus the reused ConnectEmbed. **No new primitives,
no feature-component duplication.** The one composition worth naming is the
`payment_details` flyover: `ConnectPaymentDetails` rendered inside a `SidePanel`.
The panel portals to `document.body`, but React context propagates through
portals, so the Stripe Connect context still reaches it — provided the panel is
rendered within the `ConnectEmbed` subtree, which it is.

Canonical layout respected: no page-level H1 — the route H1 ("Earnings") is
derived from the route-title map and rendered by ContentHeader; the page renders
none of its own.

## Nav insertions (the only edits to existing files)

The brief authorized exactly two: "topbar.tsx ROUTE_TITLES + sidebar." Both have
since moved from where the brief names them — flagging so nobody re-litigates:

- `components/shell/route-title.ts` — the `ROUTE_TITLES` map (moved out of
  `topbar.tsx` into its own module). Added `["/earnings", "credit-card", "Earnings"]`.

- `components/shell/app-shell.tsx` — `WORKSPACE_NAV`, the **practitioner-only**
  section list (the generic `Sidebar` in `sidebar.tsx` just renders whatever
  sections it's handed; the workspace list lives here). Added Earnings to the
  **Practice** group, beside Billing.

`credit-card` (not `dollar`) for the icon: Billing already owns `dollar` and sits
directly above Earnings in the same group — two identical adjacent icons scan
poorly. `credit-card` also ties Earnings to the "Get paid" settings card, which
uses it.

**Deliberately NOT touched** (would be a third+ edit, out of the authorized two):
the TopBar `SWITCH_DESTINATIONS` list and the `⌘K` command-palette destinations.
Earnings is reachable via the sidebar + direct URL + route-title today; adding it
to those two secondary lists is a trivial follow-up if wanted.

## Verification (evidence, not exit codes)

- `tsc --noEmit` — clean at every commit.

- **Gated / empty state — VERIFIED headless.** Real cookie login as
  `brendan@leuk.demo` against the running dev server. `/earnings` → HTTP 200;
  TopBar H1 "Earnings"; sidebar shows Earnings active in the Practice section
  between Billing and Catalog; the "Set up payments first" EmptyState + CTA
  render; **zero console errors, zero page errors**. Captured *before* the T6
  drive, while the account still had `charges_enabled` false — which is precisely
  why the gate showed, and why this screenshot is the honest record of that state.
  Screenshot: `docs/reports/assets/2026-07-20-stripe-earnings/earnings-gated.png`.

- **Practitioner-only gate — VERIFIED headless.** Login as `casey@leuk.demo`
  (role `client`) → `GET /earnings` redirects to `/portal`. Clients never see the
  page.

- **Unauthenticated gate — VERIFIED.** `GET /earnings` with no session → 307 to
  `/sign-in`.

## The demo — driven against the live sandbox (T6 complete)

The T6 drive landed, so the active money views are now **visually verified**
against a real settled charge. Driven headless as `brendan@leuk.demo` against
connected account `acct_1TvBKiJvfwWFuhCf` (`charges_enabled` + `payouts_enabled`
true, `card_payments`/`transfers` ACTIVE), payment `py_1TvC5yJvfwWFuhCfDyGRZhFx`.

### Did the fee split render? YES — exactly as NYS-173's evidence predicted.

`ConnectPaymentDetails`, on the **connected account's own session**, renders the
full split with no `on_behalf_of` required:

| | |
|---|---|
| Amount | **$150.00** |
| Processing fees | **−$15.00** |
| Net | **$135.00** |
| Status | Succeeded (Jul 20, 3:58 AM) |

`docs/reports/assets/2026-07-20-stripe-earnings/earnings-transactions-split.png`
— Transactions, the payments list showing the Jul 20 / $150.00 USD row, with
payment_details open over it showing the $150 → −$15 → $135 breakdown and the
payment timeline. **This is the founder's shot.**

`docs/reports/assets/2026-07-20-stripe-earnings/earnings-overview.png` —
Overview: **Total balance $135.00**, next upcoming payout (estimated) $135.00
expected to arrive July 21. The therapist's balance holds the net, which is the
split proven a second way, from the balance side.

No surprises against the prediction — the numbers match the Stripe-side evidence
on all three figures. Flag 3 below is therefore **resolved**: the Transactions
view needed no rework, and `on_behalf_of` (which would have required an active
per-therapist `card_payments` capability — a heavier onboarding bar) is not
needed.

### One defect the capture exposed, found and fixed

The first capture showed **two stacked overlays**: my kit `SidePanel` flyover on
the right with an empty body, and Stripe's own centered dialog carrying the
actual content. `ConnectPaymentDetails` is **self-presenting** — it renders its
own modal chrome, which is why `onClose` is a required prop on that component and
on no other in the set. Wrapping it in a SidePanel was my error.

Fixed in `b772df8`: the component is now rendered bare and Stripe owns the
overlay; `?payment=` still opens it and `onClose` still clears the param. The
committed screenshot is the corrected single-overlay render. The kit lost nothing
here — this was a composition mistake, not a missing primitive.

## Flags for the lead

1. **Brief's nav filenames are stale.** `ROUTE_TITLES` now lives in
   `components/shell/route-title.ts` (not `topbar.tsx`), and the practitioner
   sidebar list is `WORKSPACE_NAV` in `components/shell/app-shell.tsx` (not
   `sidebar.tsx`). I edited the real homes; both are within the two authorized
   nav insertions. Worth correcting in the brief for the next builder.

2. **Earnings not in the ⌘K palette or the TopBar section-switcher.** Left out on
   purpose to stay within the two authorized edits. Trivial to add; your call.

3. **RESOLVED — the connected account does see the destination charge, split and
   all.** I raised this as an open risk (that a plain destination charge might
   surface to the connected account as a Transfer rather than a Payment, leaving
   `ConnectPayments` / `ConnectPaymentDetails` empty). The drive's Stripe-side
   evidence and my own render both say no: the payments list shows the charge and
   payment_details shows $150.00 / −$15.00 / $135.00. No `on_behalf_of`, no
   per-therapist `card_payments` capability needed. Nothing to change.

4. **Stripe labels our application fee "Processing fees" to the therapist.** In
   the connected account's payment_details view the $15.00 line reads *Processing
   fees*, not "platform fee" — Stripe's own copy, inside the iframe, not
   something the appearance API can rename. So the therapist sees Leuk's
   revenue conflated with card-processing cost. That is a **pricing-and-copy
   decision, not a UI bug** (it feeds open fork #1): if we want the therapist to
   understand what Leuk charges versus what Stripe charges, it has to be said
   in OUR chrome around the component, since we cannot relabel theirs. Worth a
   founder ruling before this is shown to real therapists.

5. **Three `429`s (rate limiting) during the capture, non-blocking.** Every view
   rendered correctly; the 429s appear when several Connect components mount in
   quick succession. Not investigated — flagging as an observation, not a
   diagnosis. If it recurs under normal use it is worth a look at how many
   AccountSessions a page load mints.

6. **Shared runtime untouched, as instructed.** `connect-embed.tsx` and
   `connect-api.ts` needed no change for this page — the existing contract and
   theming covered it. Nothing to flag there.

## Not pushed

Two local commits (`e33b29a`, `b772df8`) plus this report and its three
screenshots. Push is deploy; the founder gates it.
