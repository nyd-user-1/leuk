// The product brand — one brand, no toggle.
//
// This module used to carry a live A/B switch between Leuk and the earlier
// candidate name (context + localStorage + a hidden footer link) so the two
// could be compared during the naming decision. The name settled on Leuk, so
// the switch was removed 2026-08-05: a visitor who had toggled to the retired
// name would otherwise have stayed pinned to it forever via localStorage.
//
// Deliberately NOT a "use client" module — it holds no hooks, so server
// components can import BRAND directly without getting a stub back.

const LOGO = "https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com";

export const BRAND = {
  name: "Leuk",
  full: "Leuk Psychiatry",
  logoDark: `${LOGO}/leuk.png`,
  logoLight: `${LOGO}/leuk.png`,
};

/** The short brand name, e.g. "Leuk". */
export function BrandName() {
  return <>{BRAND.name}</>;
}

/** The full brand name, e.g. "Leuk Psychiatry". */
export function BrandFull() {
  return <>{BRAND.full}</>;
}
