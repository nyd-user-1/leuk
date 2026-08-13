import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/audit";
import { AuthError, requireRole } from "@/lib/auth";
import { getConnectAccount, insertConnectAccount } from "@/lib/repos/stripe-connect";
import { BEHAVIORAL_HEALTH_MCC, CONNECT_CONTROLLER, getStripe } from "@/lib/stripe";

/**
 * Create the practitioner's Stripe connected account (v1 + controller
 * properties — see CONNECT_CONTROLLER). Idempotent by design: if the caller
 * already has an account we return it rather than minting a second one. A
 * duplicate connected account is not a cosmetic bug — it splits a therapist's
 * payout history and requires Stripe support to unwind.
 *
 * We deliberately do NOT pass a country/email/business_type the user hasn't
 * given us. Stripe collects what it needs during onboarding; pre-filling from
 * our records would put us in the position of having asserted identity facts we
 * never verified.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  void req;
  try {
    const user = await requireRole("practitioner");

    const existing = await getConnectAccount({ userId: user.id });
    if (existing) {
      return NextResponse.json({ account: existing, created: false });
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Payments are not configured on this environment (STRIPE_SECRET_KEY missing)." },
        { status: 503 },
      );
    }

    const account = await stripe.accounts.create({
      controller: CONNECT_CONTROLLER,
      // WITHOUT THIS THE MONEY LOOP IS DEAD. A destination charge can only pay
      // an account that holds an active `transfers` capability, and capabilities
      // are never granted implicitly — an account created without requesting
      // them reports `capabilities: {}` forever and its onboarding collects the
      // WRONG requirement set (bank + ToS only, no identity/representative), so
      // even a fully "completed" onboarding leaves the account unable to be
      // paid. Measured 2026-07-20 against a live sandbox pair. card_payments is
      // requested alongside so the account can also be a settlement merchant if
      // we ever move off destination charges (separate charges & transfers).
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_profile: {
        mcc: BEHAVIORAL_HEALTH_MCC,
        // Most solo therapists have no website; Stripe requires SOME description
        // of what is being sold. Generic on purpose — no PHI, no client detail.
        product_description: "Outpatient behavioral health sessions billed through Leuk.",
      },
      // Internal id only. Never put PHI or client data in Stripe metadata.
      metadata: { leukUserId: user.id },
    });

    const row = await insertConnectAccount({
      owner: { userId: user.id },
      stripeAccountId: account.id,
      businessType: (account.business_type as "individual" | "company" | null) ?? null,
    });

    await logEvent({
      actorId: user.id,
      action: "connect.account_create",
      entity: "stripe_connect_account",
      entityId: row.id,
      meta: { stripeAccount: account.id },
    });

    return NextResponse.json({ account: row, created: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[connect] account create error:", err);
    return NextResponse.json({ error: "Could not create the payout account." }, { status: 500 });
  }
}
