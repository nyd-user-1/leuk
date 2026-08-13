import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/audit";
import { AuthError, requireUser } from "@/lib/auth";
import { getAppointment } from "@/lib/repos/appointments";
import { getInvoice } from "@/lib/repos/invoices";
import { getConnectAccount } from "@/lib/repos/stripe-connect";
import { clientForUser } from "@/lib/repos/threads";
import { GENERIC_LINE_ITEM_NAME, applicationFeeCents, getStripe } from "@/lib/stripe";

/**
 * Marketplace checkout — the money path this whole tranche exists for.
 *
 * A DESTINATION CHARGE: the client pays Leuk, Stripe moves the balance to the
 * therapist's connected account, and `application_fee_amount` is what we keep.
 * The charge lives on the platform, so the platform is the merchant of record
 * and disputes land on us (controller.losses.payments = application).
 *
 * This is separate from /api/stripe/checkout and /portal/invoices/[id]/pay,
 * which are the pre-marketplace "money lands in the platform account" paths.
 * Those still work; this one is chosen when the invoice's therapist has a
 * connected account that Stripe says can actually take charges.
 *
 * MIGRATION NOTE (not tonight): the target is separate charges & transfers with
 * `source_transaction`, releasing the transfer when the appointment completes.
 * The no-show / late-cancel policy lives in that gap, which is why the split is
 * recorded as its own row rather than inferred from the charge later.
 *
 * PHI: the line item is generic and metadata carries internal ids only.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // Either side may start a marketplace checkout: the client paying their own
    // invoice from the portal, or the practitioner collecting. Authorization is
    // enforced per-role below — a client may only pay an invoice that is theirs.
    const user = await requireUser();
    const body = await req.json().catch(() => null);
    const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : null;
    if (!invoiceId) return NextResponse.json({ error: "invoiceId is required." }, { status: 400 });

    const invoice = await getInvoice(invoiceId);
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

    if (user.role === "client") {
      const client = await clientForUser(user.id);
      if (!client || invoice.clientId !== client.id) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
    } else if (user.role !== "practitioner" && user.role !== "admin") {
      return NextResponse.json({ error: "Not permitted." }, { status: 403 });
    }

    if (invoice.status === "void" || invoice.status === "paid" || invoice.balanceCents <= 0) {
      return NextResponse.json({ error: "This invoice has no balance to pay." }, { status: 400 });
    }

    // Who gets paid: the appointment's practitioner when the invoice is tied to
    // one, otherwise the client's primary practitioner. If we can't name the
    // payee we stop — sending money to a guessed therapist is worse than an error.
    let practitionerId: string | null = null;
    if (invoice.appointmentId) {
      const appt = await getAppointment(invoice.appointmentId);
      practitionerId = appt?.practitionerId ?? null;
    }
    practitionerId ??= invoice.client?.primaryPractitionerId ?? null;
    if (!practitionerId) {
      return NextResponse.json(
        { error: "This invoice isn't linked to a practitioner, so we can't route the payment." },
        { status: 409 },
      );
    }

    const payee = await getConnectAccount({ userId: practitionerId });
    if (!payee) {
      return NextResponse.json({ error: "This practitioner hasn't set up payouts yet." }, { status: 409 });
    }
    // charges_enabled is THE gate. details_submitted is not sufficient — an
    // account can have finished onboarding and still be blocked by Stripe.
    if (!payee.chargesEnabled) {
      return NextResponse.json(
        { error: "This practitioner's payout account isn't active yet.", requiresOnboarding: true },
        { status: 409 },
      );
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ error: "Payments are not configured on this environment." }, { status: 503 });
    }

    const amountCents = invoice.balanceCents;
    const feeCents = applicationFeeCents(amountCents);
    const origin = req.headers.get("origin") ?? req.nextUrl.origin;
    const backTo = user.role === "client" ? "/portal/invoices" : `/billing/${invoiceId}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            // Generic on purpose. Stripe signs no BAA — the line item may not
            // name the service, the diagnosis, or anything clinical.
            product_data: { name: GENERIC_LINE_ITEM_NAME },
          },
        },
      ],
      customer_email: invoice.client?.email ?? undefined,
      client_reference_id: invoiceId,
      metadata: { invoiceId, number: invoice.number, connectAccount: payee.stripeAccountId },
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: payee.stripeAccountId },
        // Repeated on the PaymentIntent because the webhook reads the intent,
        // not the session, when reconciling the split.
        metadata: { invoiceId, number: invoice.number },
      },
      success_url: `${origin}${backTo}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${backTo}?canceled=1`,
    });

    await logEvent({
      actorId: user.id,
      action: "invoice.marketplace_checkout_started",
      entity: "invoice",
      entityId: invoiceId,
      meta: {
        number: invoice.number,
        session: session.id,
        destination: payee.stripeAccountId,
        amount_cents: amountCents,
        application_fee_cents: feeCents,
      },
    });

    return NextResponse.json({
      url: session.url,
      // Surfaced so the caller can show the split honestly rather than
      // recomputing the fee somewhere else and drifting from the helper.
      amountCents,
      applicationFeeCents: feeCents,
      destination: payee.stripeAccountId,
    });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[checkout] marketplace session error:", err);
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
