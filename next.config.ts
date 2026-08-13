import type { NextConfig } from "next";

// Content Security Policy — REPORT-ONLY on purpose.
//
// The Stripe Connect work (docs/TASK-STRIPE-MARKETPLACE.md T3) called for "CSP
// updated for Stripe frames/scripts", but the app had no CSP at all, so nothing
// was blocking Stripe in the first place. Introducing an *enforcing* policy is a
// much larger change than it looks: it has to cover Photon's e-prescribing
// runtime (api/app/clinical-api across the photon, neutron and boson domains,
// plus Auth0), Vercel Blob assets, and Next's own inline bootstrap/hydration
// scripts — which need either 'unsafe-inline' or a nonce issued from middleware
// this app doesn't have. Getting any of that wrong fails silently in the
// browser, and e-prescribing would be the surface that breaks.
//
// So the policy ships in report-only mode: violations print in the browser
// console and block nothing. TO ENFORCE, in this order:
//   1. Drive every surface (portal, medications/Photon, calls, marketing, this
//      Settings tab) and empty the console of CSP reports.
//   2. Replace 'unsafe-inline' in script-src with a nonce from middleware, or
//      accept it as a documented weakening.
//   3. Rename the header key below to "Content-Security-Policy".
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline'/'unsafe-eval' are Next's hydration bootstrap, not ours.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://connect-js.stripe.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://*.stripe.com",
  "font-src 'self' data:",
  // Stripe's embedded Connect components render inside these frames.
  "frame-src 'self' https://js.stripe.com https://*.js.stripe.com https://connect-js.stripe.com https://hooks.stripe.com",
  "connect-src 'self' https://api.stripe.com https://connect-js.stripe.com https://*.stripe.com https://*.photon.health https://*.neutron.health https://*.boson.health https://*.auth0.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  // Bundle the admin-only Operations PDFs (served off-disk by the
  // /api/library/operations route) into that function's trace on Vercel.
  outputFileTracingIncludes: {
    "/api/library/operations/[slug]": ["./assets/operations/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy-Report-Only", value: CSP }] }];
  },
  async redirects() {
    return [
      // /find-care moved to /providers (now the provider search page); fully
      // vacated, so a plain redirect is safe. Query strings pass through
      // automatically (Next.js default).
      { source: "/find-care", destination: "/providers", permanent: true },
      // The clinician-facing marketing pages moved from /providers to
      // /for-providers. Only these two exact sub-paths redirect — bare
      // /providers is deliberately NOT redirected, since that path now
      // serves the provider search page above, not the old marketing
      // landing. ("therapists"/"prescribers" won't collide with a real
      // provider slug at /providers/[slug].)
      { source: "/providers/therapists", destination: "/for-providers/therapists", permanent: true },
      { source: "/providers/prescribers", destination: "/for-providers/prescribers", permanent: true },
    ];
  },
};

export default nextConfig;
