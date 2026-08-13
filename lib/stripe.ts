import Stripe from "stripe";

/**
 * Lazy Stripe client (same guarded pattern as lib/db.ts; adapted from
 * tariffs/src/lib/stripe.ts). Reads STRIPE_SECRET_KEY; returns null when it's
 * absent so callers DEGRADE GRACEFULLY to the mock checkout path instead of
 * throwing. The whole invoice-collection flow is demoable with zero env vars —
 * when a real key lands, the same code does a real Stripe Checkout redirect.
 *
 *   const stripe = getStripe();
 *   if (!stripe) { ...mock checkout... } else { ...real Checkout session... }
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}

/** True when a live Stripe key is configured. */
export function hasStripe(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// ── Connect marketplace (TASK-STRIPE-MARKETPLACE) ────────────────────────────

/**
 * Leuk's application fee, in basis points. 10% is a TEST-MODE PLACEHOLDER —
 * the real pricing model (%, flat, subscription, or a mix) is an open business
 * decision. It lives here, once, so that when the number changes it changes in
 * exactly one place and no route can disagree with another about what we charge.
 */
export const APPLICATION_FEE_BPS = 1000;

/**
 * Our cut of a gross amount, in cents. Floored, so rounding always favors the
 * therapist rather than the platform — a half-cent should never be something we
 * quietly keep.
 */
export function applicationFeeCents(grossCents: number): number {
  return Math.floor((grossCents * APPLICATION_FEE_BPS) / 10000);
}

/** What the therapist actually receives after our fee. */
export function therapistNetCents(grossCents: number): number {
  return grossCents - applicationFeeCents(grossCents);
}

/**
 * Merchant category code for the connected accounts we create.
 *
 * DELIBERATE CHOICE — 8099 "Medical Services and Health Practitioners (Not
 * Elsewhere Classified)". The brief floated 8049, but 8049 is specifically
 * "Podiatrists and Chiropodists"; 8011 is "Doctors and Physicians". Neither
 * describes an LCSW / LMHC / psychologist, and MCC drives card-network
 * categorization and some issuers' HSA/FSA eligibility logic — it is a claim
 * about what the business IS, not a formality. 8099 is the standard code for
 * non-physician licensed health practitioners, which is what most of our
 * therapists are. A psychiatrist (MD) billing under their own account would
 * more accurately be 8011; revisit when we onboard one.
 */
export const BEHAVIORAL_HEALTH_MCC = "8099";

/**
 * The controller triple, founder-locked 2026-07-20. This is what makes an
 * account "Express-like" WITHOUT the legacy `type: "express"` field:
 *   - stripe_dashboard.type = express  → therapist gets the Express dashboard
 *   - fees.payer = application         → the platform pays Stripe's fees
 *   - losses.payments = application    → the platform eats disputes/negative bal
 * Requirement collection stays with Stripe (omitted = Stripe's default), and the
 * service agreement stays `full` and is IMMUTABLE once the account exists.
 *
 * Changing losses/fees after creation is not freely reversible — treat this
 * object as a schema, not a config knob.
 */
export const CONNECT_CONTROLLER = {
  stripe_dashboard: { type: "express" },
  fees: { payer: "application" },
  losses: { payments: "application" },
} as const;

/**
 * Generic, PHI-free product name for anything we bill through Stripe. Stripe
 * signs no BAA, so a line item may never carry a service name, a diagnosis, or
 * anything else that says WHY someone is in care.
 */
export const GENERIC_LINE_ITEM_NAME = "Therapy session";
