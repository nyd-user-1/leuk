import { getUser } from "@/lib/auth";
import { revenueSnapshot } from "@/lib/repos/stripe-connect";
import { PaymentsSettings } from "./payments-client";

// Settings › Finance — Stripe Connect payouts for the practitioner. Auth is
// already handled by app/(app)/layout.tsx (no session → /sign-in, clients →
// /portal). Account state is fetched client-side from /api/connect/status so
// this seam depends on the route contract only, never on the repo module.
//
// The one thing that IS fetched server-side: lifetime revenue. Stripe's own
// embedded Balance/Payouts components never show an all-time total (only
// current balance + a payout list), and that number reads from our own
// stripe_payment_splits ledger, not Stripe's API — no reason to round-trip it
// through a client fetch.

export default async function PaymentsSettingsPage() {
  const user = await getUser();
  const revenue = user ? await revenueSnapshot({ userId: user.id }) : null;
  return (
    <PaymentsSettings
      publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
      lifetimeNetCents={revenue?.lifetimeNetCents ?? 0}
      sessionCount={revenue?.sessionCount ?? 0}
    />
  );
}
