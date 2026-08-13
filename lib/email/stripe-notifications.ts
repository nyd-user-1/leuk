import { appBaseUrl, esc, sendEmail, shell } from "@/lib/email";
import { formatCents } from "@/lib/format";

// Stripe Connect marketplace notifications (TASK-STRIPE-MARKETPLACE T5).
//
// Webhook-driven (checkout.session.completed, charge.dispute.created) plus one
// manual nudge. Everything reuses the branded shell + Resend client in
// lib/email.ts — no second provider, no forked template.
//
// Every function returns Promise<boolean> and never throws, matching
// lib/email.ts: notification is best-effort and must not break the webhook that
// calls it. A `false` means "email not configured", NOT "the payment failed" —
// callers should log it, never surface it to a user or retry the charge.
//
// PHI RULE (brief §Hard guardrails): names and amounts only. No service names,
// no diagnoses, no appointment detail, no clinical context. A payment receipt
// is not a place to leak why someone is in therapy.

export type MoneySplit = {
  /** What the client was charged, in cents. */
  grossCents: number;
  /** Leuk's application fee, in cents. */
  feeCents: number;
  /** What lands in the therapist's connected account, in cents. */
  netCents: number;
};

const MUTED = "#8A8F9E";
const INK = "#212A47";

/** Label/value row used by the payout + dispute breakdowns. */
function row(label: string, value: string, opts?: { strong?: boolean; top?: boolean }): string {
  const weight = opts?.strong ? "700" : "400";
  const border = opts?.top ? `border-top:1px solid #ECEBE7;` : "";
  return `<tr>
    <td style="${border}padding:9px 0;font-size:14px;color:${INK};font-weight:${weight};">${label}</td>
    <td align="right" style="${border}padding:9px 0 9px 16px;font-size:14px;color:${INK};font-weight:${weight};white-space:nowrap;">${value}</td>
  </tr>`;
}

// Stripe dispute reasons arrive as raw enum codes and several are e-commerce
// vocabulary that reads as nonsense against a therapy session ("product not
// received"). Map to plain English; fall back to de-snaking anything new.
const DISPUTE_REASON: Record<string, string> = {
  bank_cannot_process: "The bank could not process the payment",
  check_returned: "Check returned",
  credit_not_processed: "Client says a refund was never issued",
  customer_initiated: "Client disputed the charge",
  debit_not_authorized: "Client says the charge was not authorized",
  duplicate: "Client says they were charged twice",
  fraudulent: "Client says the charge was fraudulent",
  general: "Disputed — no reason given",
  incorrect_account_details: "Incorrect account details",
  insufficient_funds: "Insufficient funds",
  product_not_received: "Client says the session did not happen",
  product_unacceptable: "Client disputed the quality of the session",
  subscription_canceled: "Client says a recurring charge was canceled",
  unrecognized: "Client did not recognize the charge",
};

function disputeReason(code: string): string {
  return DISPUTE_REASON[code] ?? code.replace(/_/g, " ");
}

/**
 * Stripe deadlines are instants; rendering one through the server's local zone
 * shifts a midnight-UTC due date to the previous day (see the "no TZ day shift"
 * note on isoDateOnly). Format in UTC so the date we print is the date Stripe
 * shows in its own dashboard.
 */
function utcDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const table = (rows: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;border-collapse:collapse;">${rows}</table>`;

/**
 * Client-facing receipt after a successful Connect checkout.
 *
 * Deliberately says nothing about the platform fee — the client paid one
 * amount to one practice; the split is our business arrangement with the
 * therapist, not a line on the client's receipt.
 */
export async function sendPaymentReceipt(opts: {
  to: string;
  firstName: string;
  amountCents: number;
  invoiceNumber: string;
  invoiceId: string;
  practitionerName: string;
}): Promise<boolean> {
  return sendEmail({
    to: opts.to,
    subject: `Receipt — ${formatCents(opts.amountCents)} paid on ${opts.invoiceNumber}`,
    html: shell({
      heading: `Payment received, ${esc(opts.firstName)}`,
      bodyHtml:
        `<p style="margin:0;">We received your payment of <strong>${formatCents(opts.amountCents)}</strong> for your session with ${esc(
          opts.practitionerName,
        )} — thank you.</p>` +
        table(row("Invoice", esc(opts.invoiceNumber)) + row("Amount paid", formatCents(opts.amountCents), { strong: true, top: true })) +
        `<p style="margin:18px 0 0;font-size:13px;color:${MUTED};">This invoice is now paid in full. Your card statement will show a charge from Leuk.</p>`,
      cta: { label: "View invoice", href: `${appBaseUrl()}/portal/invoices?invoice=${opts.invoiceId}` },
    }),
  });
}

/**
 * Therapist-facing payout note — gross, fee withheld, net.
 *
 * The fee is stated plainly rather than buried: a therapist who can't see what
 * was withheld can't trust the number, and "know what you'd make" is the whole
 * pitch. clientName is the therapist's OWN client, so it carries no disclosure
 * they don't already have — still optional, omitted rather than guessed.
 */
export async function sendTherapistPaid(opts: {
  to: string;
  practitionerName: string;
  split: MoneySplit;
  invoiceNumber: string;
  clientName?: string | null;
}): Promise<boolean> {
  const { grossCents, feeCents, netCents } = opts.split;
  const forWhom = opts.clientName ? ` for ${esc(opts.clientName)}` : "";
  return sendEmail({
    to: opts.to,
    subject: `You've been paid ${formatCents(netCents)} — ${opts.invoiceNumber}`,
    html: shell({
      heading: `${formatCents(netCents)} is on its way`,
      bodyHtml:
        `<p style="margin:0;">A payment${forWhom} on invoice ${esc(opts.invoiceNumber)} cleared. Here's the breakdown:</p>` +
        table(
          row("Client paid", formatCents(grossCents)) +
            row("Platform fee", `−${formatCents(feeCents)}`) +
            row("Your payout", formatCents(netCents), { strong: true, top: true }),
        ) +
        `<p style="margin:18px 0 0;font-size:13px;color:${MUTED};">Payouts settle to your connected bank account on your Stripe payout schedule. Track them any time from your Stripe dashboard.</p>`,
      cta: { label: "Open payouts", href: `${appBaseUrl()}/settings/payments` },
    }),
  });
}

/**
 * Practice-facing alert when Stripe opens a dispute. Internal ops mail, not
 * patient mail — falls back to LEUK_OPS_EMAIL and no-ops when neither an
 * explicit recipient nor an operator inbox is configured.
 *
 * Disputes are deadline-driven, so the respond-by date leads.
 */
export async function sendDisputeAlert(opts: {
  to?: string | null;
  amountCents: number;
  reason: string;
  disputeId: string;
  /** Stripe's respond-by deadline, ISO string, when present on the event. */
  dueBy?: string | null;
  invoiceNumber?: string | null;
}): Promise<boolean> {
  const to = opts.to ?? process.env.LEUK_OPS_EMAIL;
  if (!to) return false;
  const deadline = opts.dueBy ? utcDateLong(opts.dueBy) : null;
  return sendEmail({
    to,
    subject: `Dispute opened — ${formatCents(opts.amountCents)}${opts.invoiceNumber ? ` on ${opts.invoiceNumber}` : ""}`,
    html: shell({
      heading: "A payment was disputed",
      bodyHtml:
        `<p style="margin:0;">A client's bank opened a dispute. The funds and the dispute fee are held until it resolves${
          deadline ? `, and evidence is due by <strong>${esc(deadline)}</strong>` : ""
        }.</p>` +
        table(
          row("Amount", formatCents(opts.amountCents)) +
            row("Reason", esc(disputeReason(opts.reason))) +
            (opts.invoiceNumber ? row("Invoice", esc(opts.invoiceNumber)) : "") +
            row("Dispute", esc(opts.disputeId)),
        ) +
        `<p style="margin:18px 0 0;font-size:13px;color:${MUTED};">Submit evidence from the Stripe dashboard. Do not include clinical records — attendance and payment history only.</p>`,
      cta: { label: "Open Workspace", href: `${appBaseUrl()}/workspace` },
    }),
  });
}

/**
 * Nudge a therapist whose Connect onboarding is started but not finished.
 *
 * The outstanding list is what Stripe still needs; we send them to the in-app
 * embedded onboarding, never an Account Link — those URLs are single-use and
 * short-lived, so emailing one hands the therapist a dead link (brief
 * §Hard guardrails).
 */
export async function sendOnboardingNudge(opts: {
  to: string;
  practitionerName: string;
  /** Stripe `requirements.currently_due` entries, already human-readable. */
  outstanding: string[];
}): Promise<boolean> {
  const list = opts.outstanding.length
    ? `<ul style="margin:16px 0 0;padding-left:20px;font-size:14px;color:${INK};line-height:1.7;">${opts.outstanding
        .map((o) => `<li>${esc(o)}</li>`)
        .join("")}</ul>`
    : "";
  return sendEmail({
    to: opts.to,
    subject: "Finish setting up payments to get paid",
    html: shell({
      heading: `One more step, ${esc(opts.practitionerName)}`,
      bodyHtml:
        `<p style="margin:0;">Your payment account is started but not finished, so we can't send you money yet. Stripe still needs:</p>` +
        list +
        `<p style="margin:18px 0 0;">It takes about two minutes, and you can do it without leaving your dashboard.</p>`,
      cta: { label: "Finish setup", href: `${appBaseUrl()}/settings/payments` },
    }),
  });
}
