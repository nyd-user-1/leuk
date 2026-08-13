import { notFound, redirect } from "next/navigation";
import { PrintActions } from "@/components/billing/print-actions";
import { Logo } from "@/components/ui/logo";
import { logEvent } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { formatCents, formatDate } from "@/lib/format";
import { getInvoice } from "@/lib/repos/invoices";
import { policiesForClient } from "@/lib/repos/payers";
import { clientForUser } from "@/lib/repos/threads";

// Print-ready invoice / superbill — deliberately OUTSIDE the (app) route
// group so the workspace shell never renders around the document. On screen:
// a paper-style sheet + a Print toolbar; in print: just the branded document
// (@media print hides the toolbar and flattens the sheet). When the client
// has insurance policies on file, an insurance section turns the invoice
// into a superbill the client can submit to their payer.

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const METHOD_LABEL: Record<string, string> = {
  card: "Card",
  cash: "Cash",
  insurance: "Insurance",
  other: "Other",
};

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;
  const invoice = await getInvoice(id);
  if (!invoice) notFound();

  // Clients can print their own invoices (receipt/superbill from the portal
  // pay sheet); anyone else's bounce back to the portal.
  if (user.role === "client") {
    const client = await clientForUser(user.id);
    if (!client || client.id !== invoice.clientId) redirect("/portal");
  }

  const policies = await policiesForClient(invoice.clientId);
  await logEvent({ actorId: user.id, action: "invoice.print", entity: "invoice", entityId: id });

  const dateRow = (label: string, value: string | null) =>
    value && (
      <div>
        <dt className="text-[13px] font-medium uppercase tracking-wide text-text-muted">{label}</dt>
        <dd className="text-[15px] text-text">{formatDate(`${value}T00:00:00`)}</dd>
      </div>
    );

  return (
    <div className="print-page min-h-screen bg-canvas py-8">
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          .print-page { background: white !important; padding: 0 !important; }
          .print-sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
          @page { margin: 18mm; }
        }
      `}</style>

      <PrintActions />

      <div className="print-sheet mx-auto max-w-[820px] rounded-card border border-border bg-surface p-10 shadow-card">
        {/* Letterhead */}
        <div className="flex items-start justify-between">
          <div>
            <Logo size="md" />
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Leuk Psychiatry
              <br />
              hello@leuk.demo · (555) 010-3010
            </p>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold tracking-wide text-text">
              {policies.length > 0 ? "SUPERBILL / INVOICE" : "INVOICE"}
            </p>
            <p className="text-[15px] font-semibold text-text-body">{invoice.number}</p>
            <p className="mt-1 text-sm text-text-muted">{STATUS_LABEL[invoice.status] ?? invoice.status}</p>
          </div>
        </div>

        {/* Bill to + dates */}
        <div className="mt-8 flex items-start justify-between gap-8">
          <div>
            <p className="text-[13px] font-medium uppercase tracking-wide text-text-muted">Bill to</p>
            <p className="mt-1 text-[15px] font-semibold text-text">{invoice.clientName}</p>
            {invoice.client?.address && <p className="text-[15px] text-text-body">{invoice.client.address}</p>}
            {invoice.client?.email && <p className="text-[15px] text-text-body">{invoice.client.email}</p>}
          </div>
          <dl className="flex gap-8 text-right">
            {dateRow("Issued", invoice.issuedOn)}
            {dateRow("Due", invoice.dueOn)}
          </dl>
        </div>

        {/* Line items */}
        <table className="mt-8 w-full border-collapse text-left">
          <thead>
            <tr className="border-b-2 border-text/80 text-[13px] font-semibold uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4 text-right">Qty</th>
              <th className="py-2 pr-4 text-right">Unit</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((it) => (
              <tr key={it.id} className="border-b border-border text-[15px] text-text-body">
                <td className="py-2.5 pr-4">{it.description}</td>
                <td className="py-2.5 pr-4 text-right">{it.qty}</td>
                <td className="py-2.5 pr-4 text-right">{formatCents(it.unitCents)}</td>
                <td className="py-2.5 text-right font-medium text-text">{formatCents(it.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <dl className="w-64 space-y-1.5 text-[15px]">
            <div className="flex justify-between text-text-body">
              <dt>Subtotal</dt>
              <dd>{formatCents(invoice.subtotalCents)}</dd>
            </div>
            <div className="flex justify-between text-text-body">
              <dt>Tax</dt>
              <dd>{formatCents(invoice.taxCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-text">
              <dt>Total</dt>
              <dd>{formatCents(invoice.totalCents)}</dd>
            </div>
            <div className="flex justify-between text-text-body">
              <dt>Paid</dt>
              <dd>{formatCents(invoice.paidCents)}</dd>
            </div>
            <div className="flex justify-between font-semibold text-text">
              <dt>Balance due</dt>
              <dd>{formatCents(invoice.balanceCents)}</dd>
            </div>
          </dl>
        </div>

        {/* Payments */}
        {invoice.payments.length > 0 && (
          <div className="mt-8">
            <p className="text-[13px] font-medium uppercase tracking-wide text-text-muted">Payments received</p>
            <ul className="mt-2 space-y-1 text-[15px] text-text-body">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>
                    {formatDate(p.paidAt)} · {METHOD_LABEL[p.method] ?? p.method}
                  </span>
                  <span className="font-medium text-text">{formatCents(p.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Insurance / superbill section */}
        {policies.length > 0 && (
          <div className="mt-8 rounded-card border border-border p-5">
            <p className="text-[13px] font-medium uppercase tracking-wide text-text-muted">Insurance on file</p>
            <div className="mt-2 space-y-3">
              {policies.map((p) => (
                <div key={p.id} className="text-[15px]">
                  <p className="font-semibold text-text">
                    {p.payerName} <span className="font-normal text-text-muted">({p.payerCode})</span>
                    <span className="ml-2 text-[13px] font-medium uppercase tracking-wide text-text-muted">
                      {p.kind}
                    </span>
                  </p>
                  <p className="text-text-body">
                    Member ID {p.memberId}
                    {p.groupId ? ` · Group ${p.groupId}` : ""}
                    {p.copayCents != null ? ` · Copay ${formatCents(p.copayCents)}` : ""}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
              This statement may be submitted to your insurance payer for reimbursement. Leuk Psychiatry does not
              guarantee coverage; contact your payer with questions about your benefits.
            </p>
          </div>
        )}

        <p className="mt-10 border-t border-border pt-4 text-center text-[13px] text-text-muted">
          Thank you — {invoice.number} · Leuk Psychiatry · hello@leuk.demo
        </p>
      </div>
    </div>
  );
}
