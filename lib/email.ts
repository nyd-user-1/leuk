import { Resend } from "resend";
import { formatCents, formatDateLong, formatTime } from "@/lib/format";

// Transactional email via Resend. Lazy singleton keyed on LEUK_RESEND_API_KEY
// (the "LEUK_" prefix avoids clobbering any host-level RESEND_API_KEY) so
// importing this module never throws when the key is absent — sendEmail
// no-ops (returns false) and the app keeps working without email.
//
// Emails carry scheduling logistics + portal links only — never clinical
// content (message bodies, form answers, notes).
//
// From-address: LEUK_EMAIL_FROM. Until a domain is verified in Resend the
// default is Resend's shared dev sender, which only delivers to the account
// owner's inbox — fine for development, set the env var in production.

export const EMAIL_FROM = process.env.LEUK_EMAIL_FROM ?? "Leuk <onboarding@resend.dev>";

let client: Resend | null = null;
export function resend(): Resend | null {
  const key = process.env.LEUK_RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

/** Absolute origin for links in emails (env override → Vercel prod URL → dev). */
export function appBaseUrl(): string {
  if (process.env.LEUK_BASE_URL) return process.env.LEUK_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3010";
}

/** Send an email; returns false (silently) when email is not configured. */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const r = resend();
  if (!r) return false;
  try {
    await r.emails.send({ from: EMAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html });
    return true;
  } catch (e) {
    console.error("sendEmail failed", e);
    return false; // email is best-effort; never break the calling flow
  }
}

// ── branded shell ─────────────────────────────────────────────────────────────
// Navy band + warm-paper body + teal button, table-based + inline styles for
// email-client compatibility.

const NAVY = "#1C2440";
const TEAL = "#3F8290";
const INK = "#212A47";
const PAPER = "#FAF7F1";

export function shell(opts: { heading: string; bodyHtml: string; cta?: { label: string; href: string } }): string {
  const cta = opts.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 0;"><tr><td style="border-radius:8px;background:${TEAL};">
         <a href="${opts.cta.href}" style="display:inline-block;padding:12px 28px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${opts.cta.label}</a>
       </td></tr></table>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:${PAPER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER};padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
      <tr><td style="background:${NAVY};border-radius:12px 12px 0 0;padding:20px 32px;">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:.3px;">Leuk</span>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:0 0 12px 12px;padding:32px;">
        <h1 style="margin:0 0 14px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${INK};">${opts.heading}</h1>
        <div style="font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK};">${opts.bodyHtml}</div>
        ${cta}
      </td></tr>
      <tr><td style="padding:18px 8px 0;text-align:center;font-family:Inter,Helvetica,Arial,sans-serif;font-size:12px;color:#8A8F9E;">
        Leuk · 31 E 17th St, Suite 402, New York, NY
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function appointmentLines(a: {
  serviceName: string;
  practitionerName: string;
  startsAt: string;
  endsAt: string;
  locationLabel?: string | null;
  telehealth?: boolean;
}): string {
  const where = a.telehealth ? "Telehealth (join from your portal)" : a.locationLabel;
  return `<p style="margin:0 0 6px;"><strong>${esc(a.serviceName)}</strong> with ${esc(a.practitionerName)}</p>
    <p style="margin:0 0 6px;">${formatDateLong(a.startsAt)} · ${formatTime(a.startsAt)}–${formatTime(a.endsAt)}</p>
    ${where ? `<p style="margin:0;">${esc(where)}</p>` : ""}`;
}

// ── the emails ────────────────────────────────────────────────────────────────

export async function sendBookingConfirmation(opts: {
  to: string;
  firstName: string;
  serviceName: string;
  practitionerName: string;
  startsAt: string;
  endsAt: string;
  locationLabel?: string | null;
  telehealth?: boolean;
  setPasswordUrl?: string | null;
}): Promise<boolean> {
  const newAccount = opts.setPasswordUrl
    ? `<p style="margin:18px 0 0;">We've created a client portal account for you — set a password to manage your appointment, complete forms, and message us.</p>`
    : `<p style="margin:18px 0 0;">You can manage this appointment any time from your client portal.</p>`;
  return sendEmail({
    to: opts.to,
    subject: `You're booked — ${formatDateLong(opts.startsAt)} at ${formatTime(opts.startsAt)}`,
    html: shell({
      heading: `You're booked, ${esc(opts.firstName)}`,
      bodyHtml: appointmentLines(opts) + newAccount,
      cta: opts.setPasswordUrl
        ? { label: "Set your password", href: opts.setPasswordUrl }
        : { label: "Open your portal", href: `${appBaseUrl()}/portal/appointments` },
    }),
  });
}

export async function sendPasswordEmail(opts: {
  to: string;
  firstName: string;
  url: string;
  purpose: "set" | "reset";
}): Promise<boolean> {
  const isNew = opts.purpose === "set";
  return sendEmail({
    to: opts.to,
    subject: isNew ? "Set up your Leuk client portal" : "Reset your Leuk password",
    html: shell({
      heading: isNew ? `Welcome, ${esc(opts.firstName)}` : `Reset your password`,
      bodyHtml: isNew
        ? `<p style="margin:0;">Set a password to activate your client portal — appointments, secure messages, forms, and invoices in one place.</p>`
        : `<p style="margin:0;">We received a request to reset your password. If this wasn't you, you can safely ignore this email.</p>`,
      cta: { label: isNew ? "Set your password" : "Choose a new password", href: opts.url },
    }),
  });
}

// ── ops alerts ────────────────────────────────────────────────────────────────
// Internal plumbing alerts (failed nightly sync), not patient mail. Gated on
// LEUK_OPS_EMAIL so nothing fires unless an operator inbox is configured;
// carries table/step names only — no PHI lives anywhere near these jobs.

export async function sendOpsAlertEmail(opts: {
  subject: string;
  intro: string;
  failures: Array<{ step: string; error: string }>;
}): Promise<boolean> {
  const to = process.env.LEUK_OPS_EMAIL;
  if (!to) return false;
  const rows = opts.failures
    .map(
      (f) => `<p style="margin:0 0 8px;"><strong>${esc(f.step)}</strong><br/>
        <span style="font-size:13px;color:#8A8F9E;">${esc(f.error)}</span></p>`,
    )
    .join("");
  return sendEmail({
    to,
    subject: opts.subject,
    html: shell({
      heading: opts.subject,
      bodyHtml: `<p style="margin:0 0 14px;">${esc(opts.intro)}</p>${rows}`,
      cta: { label: "Open Workspace", href: `${appBaseUrl()}/workspace` },
    }),
  });
}

// ── billing emails ────────────────────────────────────────────────────────────
// Mini version of the /billing/[id]/print document: line items + totals in
// the branded shell, CTA deep-links to the portal pay sheet
// (/portal/invoices?invoice=…). Amounts + descriptions only — no clinical
// content.

function itemsTable(items: Array<{ description: string; qty: number; amountCents: number }>): string {
  const rows = items
    .map(
      (it) => `<tr>
        <td style="padding:9px 0;border-bottom:1px solid #ECEBE7;font-size:14px;color:${INK};">${esc(it.description)}${
          it.qty > 1 ? ` <span style="color:#8A8F9E;">&times; ${it.qty}</span>` : ""
        }</td>
        <td align="right" style="padding:9px 0 9px 16px;border-bottom:1px solid #ECEBE7;font-size:14px;color:${INK};white-space:nowrap;">${formatCents(it.amountCents)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;border-collapse:collapse;">
    <tr>
      <td style="padding:0 0 6px;border-bottom:2px solid ${INK};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#8A8F9E;">Description</td>
      <td align="right" style="padding:0 0 6px 16px;border-bottom:2px solid ${INK};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#8A8F9E;">Amount</td>
    </tr>
    ${rows}
  </table>`;
}

export async function sendInvoiceEmail(opts: {
  to: string;
  firstName: string;
  number: string;
  items: Array<{ description: string; qty: number; amountCents: number }>;
  totalCents: number;
  balanceCents: number;
  dueOn: string | null; // YYYY-MM-DD
  invoiceId: string;
}): Promise<boolean> {
  const due = opts.dueOn ? `Due by ${formatDateLong(`${opts.dueOn}T00:00:00`)}` : "Due on receipt";
  const totals = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 0;">
    <tr>
      <td style="padding:10px 0 0;font-size:15px;font-weight:700;color:${INK};">Amount due</td>
      <td align="right" style="padding:10px 0 0;font-size:18px;font-weight:700;color:${INK};white-space:nowrap;">${formatCents(opts.balanceCents)}</td>
    </tr>
    <tr><td colspan="2" style="padding:2px 0 0;font-size:13px;color:#8A8F9E;">${esc(due)} · Invoice ${esc(opts.number)}</td></tr>
  </table>`;
  return sendEmail({
    to: opts.to,
    subject: `Invoice ${opts.number} from Leuk Psychiatry — ${formatCents(opts.balanceCents)} due`,
    html: shell({
      heading: `Your invoice, ${esc(opts.firstName)}`,
      bodyHtml:
        `<p style="margin:0;">Here's your invoice from Leuk Psychiatry. You can review it and pay securely from your client portal.</p>` +
        itemsTable(opts.items) +
        totals,
      cta: { label: "View & pay invoice", href: `${appBaseUrl()}/portal/invoices?invoice=${opts.invoiceId}` },
    }),
  });
}

export async function sendPaymentReceiptEmail(opts: {
  to: string;
  firstName: string;
  number: string;
  amountCents: number;
  balanceCents: number;
  invoiceId: string;
}): Promise<boolean> {
  const settled = opts.balanceCents <= 0;
  return sendEmail({
    to: opts.to,
    subject: `Receipt — ${formatCents(opts.amountCents)} payment on ${opts.number}`,
    html: shell({
      heading: `Payment received, ${esc(opts.firstName)}`,
      bodyHtml:
        `<p style="margin:0;">We received your payment of <strong>${formatCents(opts.amountCents)}</strong> on invoice ${esc(opts.number)} — thank you.</p>` +
        (settled
          ? `<p style="margin:12px 0 0;">This invoice is now paid in full.</p>`
          : `<p style="margin:12px 0 0;">Remaining balance: <strong>${formatCents(opts.balanceCents)}</strong>.</p>`),
      cta: { label: "View invoice", href: `${appBaseUrl()}/portal/invoices?invoice=${opts.invoiceId}` },
    }),
  });
}
