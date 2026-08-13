# TASK-PORTAL-NUDGE — patient email becomes a content-free portal nudge

**Date:** 2026-07-21 · **Lead:** fable lead · **Executor:** quality-agent (seam EMAIL-NUDGE)
**Report to:** `docs/reports/2026-07-21-email-nudge.md` · **Linear intent:** file one issue intent in the report (lead files it)

## Mission

Strip PHI out of patient-facing email. Content moves behind portal
authentication; the email becomes a neutral notification with a link. This is
the compliance follow-on to yesterday's Mailgun/Resend split (`3d48e87`).

**Rationale (founder, verbatim in spirit):** Mailgun's BAA explicitly states
they do not encrypt PHI on our behalf. True end-to-end email encryption is
unworkable because the patient's end is Gmail on a phone we don't control. The
portal-nudge pattern is what E2E actually looks like in healthcare — content
stays encrypted at rest in Neon and travels over TLS to an authenticated
session, never through email.

## Ground truth (measured 2026-07-21, do not re-derive)

- `lib/email.ts` has **four** `audience:"phi"` senders, not three:
  `sendBookingConfirmation` (L161), `sendPasswordEmail` (L189),
  `sendInvoiceEmail` (L266), `sendPaymentReceiptEmail` (L299).

- **Subject lines leak the same content as bodies** and travel the same
  channel: `` `You're booked — ${date} at ${time}` ``,
  `` `Invoice ${number} from Leuk Psychiatry — ${amount} due` ``,
  `` `Receipt — ${amount} payment on ${number}` ``. The strip covers
  subjects AND bodies. A content-free body under a content-full subject
  accomplishes nothing.

- `lib/email/stripe-notifications.ts` has **two more** `audience:"phi"`
  senders with amounts + invoice numbers in their subjects:
  `sendPaymentReceipt` (L90, to the client) and `sendTherapistPaid` (L123).
  They are in scope here (T2). The Stripe agents that owned this file are
  parked, not running — no seam collision today.

- Patient-mail branding is **Leuk / Leuk Psychiatry** (the `shell()` header
  and footer). Keep it; do not rename anything to Leuk.

- Mailgun is inert until `mg.nysgpt.com` is verified, so live sends return
  `false`. Verification in this tranche is render-level (T3), not send-level.

- **Update 2026-07-21 (advisor):** `mg.nysgpt.com` is now DNS-verified
  (`state: active`, SPF/DKIM valid) with `require_tls: true` enforced. But the
  Mailgun **account is not SMS-activated**, so live sends still return HTTP 403.
  Net: the T3 render-level verification approach is unchanged and still correct —
  do not attempt live sends.

## T1 — `lib/email.ts`: the four phi senders become nudges

After this change, no phi-audience email — subject or body — may carry:
appointment dates/times, service names, practitioner names, telehealth or
location detail, dollar amounts, invoice numbers, line items, balances, or any
clinical detail. The patient's first name in a greeting is acceptable (the
recipient's own mailbox already knows their name). "Leuk" as sender branding
stays (the treatment relationship is inherent in receiving the mail at all;
that exposure is accepted and BAA-covered — content is what we're removing).

- **`sendBookingConfirmation`** — body becomes a neutral prompt in the model
  of: "You have an update in your Leuk portal. Sign in to view." Subject
  equally neutral (e.g. "Your Leuk portal has an update"). Drop
  `appointmentLines()` from the output (delete the helper if nothing else
  uses it). KEEP the two-state CTA: `setPasswordUrl` present → "Set your
  password" link (functional, see T1 exception below); otherwise → portal
  link to `/portal/appointments`.

- **`sendPasswordEmail`** — the exception. A set-password/reset link is
  functional, not informational, and the recipient already knows why they got
  it. Keep the link and the set/reset distinction. Strip any surrounding copy
  that names services, practitioners, or scheduling. The current subjects
  ("Set up your Leuk client portal" / "Reset your Leuk password") are already
  clean — keep.

- **`sendInvoiceEmail`** — nudge + deep link to
  `/portal/invoices?invoice=<id>`. The opaque invoice UUID in the URL is
  acceptable (meaningless without an authenticated session); the invoice
  NUMBER, amounts, line items (`itemsTable`), and due date are not — remove
  them from subject and body. Delete `itemsTable()` if nothing else uses it.

- **`sendPaymentReceiptEmail`** — same treatment: neutral subject, neutral
  body, deep link to the invoice sheet. No amount, no balance, no number.

- **Signatures stay unchanged.** Callers keep passing the detail params; the
  senders just stop interpolating them. This keeps the diff out of
  `app/api/**`. Note in the report which params became unused per sender.

- **Header comment** (L22–24) currently promises "scheduling logistics +
  portal links only" — rewrite it to state the nudge rule: phi-audience mail
  carries no appointment, billing, or clinical detail in subject or body;
  content lives behind portal auth; functional links (password set/reset,
  opaque deep links) are the only exception.

## T2 — `lib/email/stripe-notifications.ts`: the two phi senders

- **`sendPaymentReceipt`** (client-facing) — same nudge treatment as T1:
  neutral subject/body, keep its portal deep link if it has one (add the
  `/portal/invoices?invoice=<id>` link if the id is available in its params;
  if not, flag rather than re-plumb).

- **`sendTherapistPaid`** — recipient is the practitioner, but the payout is
  tied to an invoice number (→ a patient encounter) in a Gmail inbox we don't
  control. Conservative position: nudge it too — neutral subject, body points
  at the `/earnings` page. If its body currently names the client, say so
  explicitly in the report.

- Do NOT touch the `audience:"ops"` senders in either file
  (`sendOpsAlertEmail`, `sendDisputeAlert`, `sendOnboardingNudge`) — internal
  recipients, no patient identity.

## T3 — verification (acceptance criteria)

1. **Sentinel render test.** A throwaway script in the session scratchpad
   (NOT committed): call each of the six changed senders' HTML-building path
   with distinctive fixture strings (`SENTINEL_SERVICE`,
   `SENTINEL_PRACTITIONER`, a sentinel amount like `$1,234,567.89`, sentinel
   invoice number, a fixed date) and assert none of them appear in the
   rendered subject or html. Paste the assertion output into the report. If
   the send path can't be exercised without network, render via `shell()` +
   the body-builders directly — the assertion is on the strings, not the
   transport.

2. **Every nudge points somewhere that shows what was removed.** A nudge
   pointing nowhere useful is worse than the status quo. Drive the portal
   headless (dev server port 3010, sign in as `casey@leuk.demo` / `demo`)
   and confirm: `/portal/appointments` shows upcoming-appointment detail
   (time, practitioner, service); `/portal/invoices?invoice=<id>` opens the
   invoice with items, totals, balance, and payment/receipt state; `/earnings`
   shows payout detail for the therapist case (sign in as
   `brendan@leuk.demo` for that one). If any destination does NOT surface
   the removed information, FLAG it in the report with what's missing — do
   not build portal surfaces in this tranche.

3. `npx tsc --noEmit` clean.

4. No database writes are needed in this tranche; if any test row does get
   created, account for it and delete it (LIVE database).

## Commit + report protocol

- Commit early, per task, with explicit pathspecs and a staged-list check
  first: `git diff --cached --name-only`, then
  `git commit -m "…" -- lib/email.ts` (etc.). NEVER a bare `git commit` —
  concurrent sessions share this tree.

- The T1 commit message must note the open legal question (flag, not
  resolve): whether appointment logistics may sit in a plaintext body is a
  healthcare-privacy-attorney question; this change takes the conservative
  position so the decision is revisitable.

- Do NOT push. Push = deploy; founder gates it.

- Report to `docs/reports/2026-07-21-email-nudge.md`: what changed per
  sender (subject before → after), unused-param inventory, sentinel test
  output, portal-destination verification with what was actually seen,
  flags, Linear intents. Then STOP.

## Seams

- **OWNS:** `lib/email.ts`, `lib/email/stripe-notifications.ts` — content
  and comments only.

- **DO NOT TOUCH:** `app/api/**`, `app/portal/**`, `components/**`,
  `lib/repos/**`, `sql/**`, anything Stripe beyond the two named senders.
  Portal gaps are flagged, not fixed. No migrations, no new files outside
  the report.

## Open question (flagged, not resolved here)

Whether appointment logistics may sit in a plaintext email body is a
healthcare-privacy-attorney question. This tranche takes the conservative
position (strip everything). Revisitable ruling — recorded in the T1 commit
message and this brief.
