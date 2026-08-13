"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { SidePanel } from "@/components/ui/side-panel";
import { TextLink } from "@/components/ui/text-link";
import { useToast } from "@/components/ui/toast";
import { formatCents, formatDate, formatDateTime } from "@/lib/format";
import type { InvoiceStatus } from "@/lib/types";

// Portal invoice sheet — the client's whole billing flow in one surface
// (bottom sheet on phones, right panel on desktop): the invoice document,
// a Pay footer, and an in-place success state once the payment lands.
//
// Pay tries the MARKETPLACE path first (/api/checkout/session — a destination
// charge that pays the therapist and takes our application fee). That route
// answers 409 when the therapist has no active connected account and 503 when
// the environment has no Stripe key; both fall back to the pre-marketplace
// /portal/invoices/[id]/pay, which settles in mock mode and does a
// platform-only checkout when a key is present. So the portal keeps working
// through every stage of Connect onboarding, and upgrades itself the moment a
// therapist goes live — no flag to flip.

/** Survives the Stripe redirect so the return leg knows which invoice to watch. */
export const PAYING_INVOICE_KEY = "leuk:paying-invoice";

export interface PortalInvoice {
  id: string;
  number: string;
  status: InvoiceStatus;
  issuedOn: string | null;
  dueOn: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  items: Array<{ id: string; description: string; qty: number; unitCents: number; amountCents: number }>;
  payments: Array<{ id: string; method: string; amountCents: number; paidAt: string }>;
}

export const PORTAL_STATUS: Record<
  InvoiceStatus,
  { label: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  draft: { label: "Draft", variant: "neutral" },
  sent: { label: "Due", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  overdue: { label: "Overdue", variant: "danger" },
  void: { label: "Void", variant: "neutral" },
};

const METHOD_LABEL: Record<string, string> = {
  card: "Card",
  cash: "Cash",
  insurance: "Insurance",
  other: "Other",
};

const dateOnly = (d: string) => formatDate(`${d}T00:00:00`);

export function PortalInvoiceSheet({
  invoice,
  onClose,
  stripeLive,
  clientEmail,
}: {
  invoice: PortalInvoice | null;
  onClose: () => void;
  stripeLive: boolean;
  clientEmail: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [paying, setPaying] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number | null>(null); // non-null = success state

  // A fresh selection resets the success state.
  useEffect(() => {
    setPaidAmount(null);
  }, [invoice?.id]);

  const payable =
    !!invoice &&
    paidAmount === null &&
    invoice.balanceCents > 0 &&
    (invoice.status === "sent" || invoice.status === "overdue");

  /** Hand off to Stripe, leaving a breadcrumb the return leg can pick up. */
  const handoff = (invoiceId: string, url: string) => {
    try {
      sessionStorage.setItem(PAYING_INVOICE_KEY, invoiceId);
    } catch {
      // Private-mode / storage-disabled: the return leg degrades to a generic
      // "we're confirming" message instead of watching this invoice. Not worth
      // failing a payment over.
    }
    window.location.assign(url);
  };

  const pay = async () => {
    if (!invoice) return;
    setPaying(true);
    try {
      // 1. Marketplace: destination charge, therapist paid, fee taken.
      const mk = await fetch("/api/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: invoice.id }),
      });
      if (mk.ok) {
        const data = await mk.json().catch(() => null);
        if (data?.url) {
          handoff(invoice.id, data.url);
          return;
        }
      } else if (mk.status !== 409 && mk.status !== 503) {
        // 409 = therapist not payout-ready, 503 = no Stripe key. Anything else
        // (no balance, not your invoice) is a real error the fallback would
        // only repeat, so surface it instead of retrying.
        const data = await mk.json().catch(() => null);
        throw new Error(data?.error ?? "Could not start the payment.");
      }

      // 2. Pre-marketplace fallback: mock settle, or platform-only checkout.
      const res = await fetch(`/portal/invoices/${invoice.id}/pay`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Could not start the payment.");
      if (data?.url) {
        handoff(invoice.id, data.url); // returns via /api/stripe/confirm
        return;
      }
      // Mock mode only: this route recorded the payment synchronously, so
      // claiming success here is honest. The live paths never reach this line.
      setPaidAmount(invoice.balanceCents);
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not start the payment.", "danger");
    } finally {
      setPaying(false);
    }
  };

  const openPdf = () => invoice && window.open(`/billing/${invoice.id}/print`, "_blank");

  const s = invoice ? PORTAL_STATUS[invoice.status] : null;

  return (
    <SidePanel
      open={!!invoice}
      onClose={onClose}
      title={invoice?.number ?? ""}
      // The header is the LETTERHEAD, not a label: it carries the practice's
      // mark, the way the top of a paper invoice does. The document identifies
      // itself in the body below (the number sits where this mark used to), so
      // the two aren't saying the same thing twice. `title` still names the
      // dialog for screen readers.
      titleNode={<Logo size="sm" />}
      mobileSheet
      footer={
        payable ? (
          <div className="w-full space-y-2">
            <Button className="w-full" leftIcon="credit-card" loading={paying} onClick={pay}>
              Pay {formatCents(invoice.balanceCents)}
            </Button>
            <p className="text-center text-[12px] text-text-muted">
              {stripeLive
                ? "You'll be redirected to Stripe's secure checkout."
                : "Payments are simulated in this demo environment."}
            </p>
          </div>
        ) : paidAmount !== null ? (
          <Button className="w-full" variant="secondary" onClick={onClose}>
            Done
          </Button>
        ) : undefined
      }
    >
      {invoice &&
        (paidAmount !== null ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success-tint text-success">
              <Icon name="circle-check" size={28} />
            </span>
            <p className="text-[19px] font-semibold text-text">Payment received</p>
            <p className="max-w-[340px] text-[15px] text-text-body">
              {formatCents(paidAmount)} paid on {invoice.number} — thank you.
              {clientEmail ? ` A receipt is on its way to ${clientEmail}.` : ""}
            </p>
            <Button variant="secondary" leftIcon="download" onClick={openPdf}>
              View receipt (PDF)
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Document identity — the number leads, the practice names itself
                under it. The brand mark moved up to the sheet header. */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-[22px] font-semibold tracking-[-0.01em] text-text">{invoice.number}</p>
                <p className="mt-1 text-[13px] text-text-muted">Leuk Psychiatry · hello@leuk.demo</p>
              </div>
              {s && <Badge variant={s.variant}>{s.label}</Badge>}
            </div>

            {/* Dates */}
            <dl className="flex gap-8">
              {invoice.issuedOn && (
                <div>
                  <dt className="text-[12px] font-medium uppercase tracking-wide text-text-muted">Issued</dt>
                  <dd className="text-[14px] text-text">{dateOnly(invoice.issuedOn)}</dd>
                </div>
              )}
              {invoice.dueOn && (
                <div>
                  <dt className="text-[12px] font-medium uppercase tracking-wide text-text-muted">Due</dt>
                  <dd
                    className={`text-[14px] ${invoice.status === "overdue" ? "font-medium text-danger" : "text-text"}`}
                  >
                    {dateOnly(invoice.dueOn)}
                  </dd>
                </div>
              )}
            </dl>

            {/* Line items */}
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-text/80">
                  <th className="py-2 pr-4 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                    Description
                  </th>
                  <th className="py-2 text-right text-[12px] font-semibold uppercase tracking-wide text-text-muted">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((it) => (
                  <tr key={it.id} className="border-b border-border text-[15px] text-text-body">
                    <td className="py-2.5 pr-4">
                      {it.description}
                      {it.qty > 1 && (
                        <span className="ml-1.5 text-[13px] text-text-muted">
                          × {it.qty} at {formatCents(it.unitCents)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right font-medium text-text">
                      {formatCents(it.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end">
              <dl className="w-full max-w-[250px] space-y-1.5 text-[15px]">
                <div className="flex justify-between text-text-body">
                  <dt>Subtotal</dt>
                  <dd>{formatCents(invoice.subtotalCents)}</dd>
                </div>
                {invoice.taxCents > 0 && (
                  <div className="flex justify-between text-text-body">
                    <dt>Tax</dt>
                    <dd>{formatCents(invoice.taxCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 font-semibold text-text">
                  <dt>Total</dt>
                  <dd>{formatCents(invoice.totalCents)}</dd>
                </div>
                {invoice.paidCents > 0 && (
                  <div className="flex justify-between text-text-body">
                    <dt>Paid</dt>
                    <dd>−{formatCents(invoice.paidCents)}</dd>
                  </div>
                )}
                <div className="flex justify-between font-semibold">
                  <dt className="text-text">Balance due</dt>
                  <dd className={payable ? "text-danger" : "text-success"}>{formatCents(invoice.balanceCents)}</dd>
                </div>
              </dl>
            </div>

            {/* Payments */}
            {invoice.payments.length > 0 && (
              <div>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-text-muted">
                  Payments received
                </p>
                <ul className="space-y-1.5 text-[14px] text-text-body">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {METHOD_LABEL[p.method] ?? p.method} · {formatDateTime(p.paidAt)}
                      </span>
                      <span className="shrink-0 font-medium text-text">{formatCents(p.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <TextLink icon="download" onClick={openPdf}>
              Download PDF
            </TextLink>
          </div>
        ))}
    </SidePanel>
  );
}
