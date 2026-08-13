#!/usr/bin/env node
// Seed the ONE unpaid invoice the Stripe Connect T6 drive needs, and take it
// back out again. The live DATABASE_URL is real, so this script is written to
// be the only thing that ever touches the row: a fixed id, an idempotent
// insert, and a --cleanup that removes exactly what it made.
//
//   node --env-file=.env.local scripts/qa/seed-test-invoice.mjs
//   node --env-file=.env.local scripts/qa/seed-test-invoice.mjs --cleanup
//   node --env-file=.env.local scripts/qa/seed-test-invoice.mjs --status
//
// WHY THESE VALUES (all measured against the live db 2026-07-20, not guessed):
//
//  * Client = Casey Morgan (the demo client login casey@leuk.demo). Casey's
//    three existing invoices are ALL `paid`, so before this row there was no
//    payable invoice in the portal at all and T4 had nothing to click.
//
//  * Appointment = the completed 2026-06-15 session, whose practitioner_id is
//    brendan@leuk.demo. That matters: an invoice reaches a therapist only
//    through its appointment, so the destination connected account resolves
//    off this column. Seeding with appointment_id NULL (as the existing demo
//    invoices have it) would leave a marketplace charge with nobody to pay.
//    brendan@leuk.demo is role=admin, which requireRole("practitioner")
//    accepts (lib/auth.ts:241) — so the same login creates the account and
//    owns the session being billed.
//
//  * number = INV-2026-9003. It MUST end in digits. nextInvoiceNumber()
//    (lib/repos/invoices.ts:215) does SUBSTRING(number FROM 10)::int over
//    every 'INV-2026-%' row, so a friendly number like 'INV-2026-QA01' makes
//    that cast throw and breaks invoice creation for the whole app. 9003 is
//    simply the next one after the 9001/9002 demo pair.
//
//  * status = 'sent'. The portal filters drafts out (app/portal/invoices/
//    page.tsx), so a draft is invisible to Casey.
//
//  * $150.00, so the 10% split is unmistakable in the report: gross 15000c,
//    application fee 1500c, therapist 13500c.
//
//  * Line item reads "Therapy session" — generic on purpose. The existing
//    checkout route forwards item descriptions into Stripe's product_data
//    (app/api/stripe/checkout/route.ts:75), and Stripe signs no BAA.

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set — run with `node --env-file=.env.local`.");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// Fixed ids: cleanup never has to guess, and a re-run can't fan out duplicates.
const INVOICE_ID = "00000000-0000-4000-8000-000000009003";
const INVOICE_NUMBER = "INV-2026-9003";
const CLIENT_ID = "00000000-0000-4000-8000-000000002001"; // Casey Morgan
const APPOINTMENT_ID = "33d613d6-2d32-4844-965e-673df96a349b"; // completed 2026-06-15, prac = brendan
const TOTAL_CENTS = 15000;

const mode = process.argv.includes("--cleanup")
  ? "cleanup"
  : process.argv.includes("--status")
    ? "status"
    : "seed";

const money = (c) => `$${(c / 100).toFixed(2)}`;

async function status() {
  const [inv] = await sql`
    SELECT i.number, i.status, i.total_cents, i.appointment_id,
           COALESCE((SELECT sum(amount_cents) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid_cents
    FROM invoices i WHERE i.id = ${INVOICE_ID}::uuid
  `;
  if (!inv) {
    console.log(`absent   ${INVOICE_NUMBER} — not seeded (run without --cleanup to create it)`);
    return null;
  }
  const balance = Math.max(inv.total_cents - Number(inv.paid_cents), 0);
  console.log(
    `present  ${inv.number}  status=${inv.status}  total=${money(inv.total_cents)}  ` +
      `paid=${money(Number(inv.paid_cents))}  balance=${money(balance)}`,
  );

  const splits = await sql`
    SELECT payment_intent_id, amount_cents, application_fee_cents, destination_account_id, transfer_id
    FROM stripe_payment_splits WHERE invoice_id = ${INVOICE_ID}::uuid
  `;
  for (const s of splits) {
    console.log(
      `         split ${s.payment_intent_id}  gross=${money(s.amount_cents)}  ` +
        `fee=${money(s.application_fee_cents)}  →${s.destination_account_id}  transfer=${s.transfer_id ?? "—"}`,
    );
  }
  return inv;
}

if (mode === "status") {
  await status();
  process.exit(0);
}

if (mode === "cleanup") {
  // Order matters only for the split rows; invoice_items and payments cascade
  // off the invoice delete (sql/001_schema.sql).
  const splits = await sql`
    DELETE FROM stripe_payment_splits WHERE invoice_id = ${INVOICE_ID}::uuid RETURNING payment_intent_id
  `;
  const pays = await sql`DELETE FROM payments WHERE invoice_id = ${INVOICE_ID}::uuid RETURNING id`;
  const inv = await sql`DELETE FROM invoices WHERE id = ${INVOICE_ID}::uuid RETURNING number`;

  console.log(`cleanup: invoices ${inv.length}, payments ${pays.length}, splits ${splits.length}`);
  if (splits.length) {
    console.log("note: the Stripe-side test objects (PaymentIntent, transfer) stay — test mode, harmless.");
  }
  // stripe_events is deliberately NOT swept: it is the idempotency ledger and
  // is keyed by Stripe's event id, not by invoice. Deleting rows there would
  // let a redelivered event re-run its side effects.
  const [evt] = await sql`SELECT count(*)::int AS n FROM stripe_events`;
  console.log(`stripe_events left intact: ${evt.n} row(s) — idempotency ledger, not invoice-scoped.`);
  process.exit(0);
}

// ── seed ─────────────────────────────────────────────────────────────────────

// Guard the assumptions rather than trusting them: if the demo graph has moved
// under us, say so instead of writing a dangling row into a live database.
const [client] = await sql`SELECT id, first_name, last_name, email FROM clients WHERE id = ${CLIENT_ID}::uuid`;
if (!client) {
  console.error(`Client ${CLIENT_ID} (Casey Morgan) not found — demo seed has changed. Aborting.`);
  process.exit(1);
}
const [appt] = await sql`
  SELECT a.id, a.status, a.starts_at, u.email AS practitioner_email, u.name AS practitioner_name
  FROM appointments a JOIN users u ON u.id = a.practitioner_id
  WHERE a.id = ${APPOINTMENT_ID}::uuid AND a.client_id = ${CLIENT_ID}::uuid
`;
if (!appt) {
  console.error(`Appointment ${APPOINTMENT_ID} not found for this client — aborting rather than seeding an orphan.`);
  process.exit(1);
}

const [existing] = await sql`SELECT id, status FROM invoices WHERE id = ${INVOICE_ID}::uuid`;
if (existing) {
  console.log(`${INVOICE_NUMBER} already seeded (status=${existing.status}) — leaving it alone.`);
  await status();
  process.exit(0);
}

// A number collision would mean someone created invoices past 9002 by hand.
const [clash] = await sql`SELECT id FROM invoices WHERE number = ${INVOICE_NUMBER}`;
if (clash) {
  console.error(`${INVOICE_NUMBER} is taken by a different invoice (${clash.id}). Aborting — pick the next number.`);
  process.exit(1);
}

await sql`
  INSERT INTO invoices (id, number, client_id, appointment_id, status, issued_on, due_on,
                        subtotal_cents, tax_cents, total_cents)
  VALUES (${INVOICE_ID}::uuid, ${INVOICE_NUMBER}, ${CLIENT_ID}::uuid, ${APPOINTMENT_ID}::uuid,
          'sent', CURRENT_DATE, CURRENT_DATE + 14, ${TOTAL_CENTS}, 0, ${TOTAL_CENTS})
`;
await sql`
  INSERT INTO invoice_items (invoice_id, description, qty, unit_cents, amount_cents)
  VALUES (${INVOICE_ID}::uuid, 'Therapy session', 1, ${TOTAL_CENTS}, ${TOTAL_CENTS})
`;

console.log(`seeded ${INVOICE_NUMBER}  ${money(TOTAL_CENTS)}  → ${client.first_name} ${client.last_name} <${client.email}>`);
console.log(`  appointment ${appt.id} (${appt.status}) with ${appt.practitioner_name} <${appt.practitioner_email}>`);
console.log(`  expected split at 10%: fee ${money(TOTAL_CENTS * 0.1)} · therapist ${money(TOTAL_CENTS * 0.9)}`);
console.log(`  CLEANUP: node --env-file=.env.local scripts/qa/seed-test-invoice.mjs --cleanup`);
