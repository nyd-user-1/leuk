// Public-site navigation model — the audience map shared by SiteNav and
// SiteFooter so both stay in sync from one source. NEW (public marketing site).
// This is MY nav/footer data; it deliberately does not touch the existing
// components/marketing/{nav,marketing-footer}.tsx (owned by the home redesign).

import { CONDITION_TOPICS } from "./topics";

export interface NavLink {
  label: string;
  href: string;
  note?: string;
}

export interface NavGroup {
  label: string;
  href?: string;
  links?: NavLink[];
}

// Care — care types first, then the full directory.
export const CARE_LINKS: NavLink[] = [
  { label: "Therapy", href: "/care/therapy", note: "Talk therapy, virtual or in person" },
  { label: "Medication management", href: "/care/medication", note: "Psychiatric prescribing & follow-up" },
  { label: "Therapy + medication", href: "/care/both", note: "Both, coordinated in one place" },
  { label: "Browse the full directory", href: "/providers", note: "Search every provider in New York" },
];

// Conditions — derived from the topic content so they never drift.
export const CONDITION_LINKS: NavLink[] = CONDITION_TOPICS.map((t) => ({
  label: t.label,
  href: `/care/${t.slug}`,
}));

// Providers — the clinician-facing paths.
export const PROVIDER_LINKS: NavLink[] = [
  { label: "Why Leuk", href: "/for-providers", note: "Be present, not buried in paperwork" },
  { label: "For prescribers", href: "/for-providers/prescribers", note: "Psychiatrists & PMHNPs" },
  { label: "For therapists", href: "/for-providers/therapists", note: "Counselors & clinical social workers" },
  { label: "Join Leuk", href: "/join", note: "Apply or book a walkthrough" },
];

// Partners — the three secondary audiences that get a real page but no
// homepage real estate.
export const PARTNER_LINKS: NavLink[] = [
  { label: "For health plans", href: "/for-health-plans", note: "Network quality & outcomes" },
  { label: "For physicians", href: "/for-physicians", note: "Refer with confidence" },
  { label: "For employers", href: "/for-employers", note: "Access & outcomes for your people" },
];

// Primary nav groups for SiteNav.
export const NAV_GROUPS: NavGroup[] = [
  { label: "Get care", links: CARE_LINKS },
  { label: "For providers", links: PROVIDER_LINKS },
  { label: "Partners", links: PARTNER_LINKS },
];

// Footer columns (mirrors the nav; crisis block is rendered separately).
export const FOOTER_COLUMNS: NavGroup[] = [
  {
    label: "Get care",
    links: [
      { label: "Find a provider", href: "/providers" },
      { label: "Therapy", href: "/care/therapy" },
      { label: "Medication management", href: "/care/medication" },
      { label: "Therapy + medication", href: "/care/both" },
      { label: "Book with Leuk", href: "/book/leuk" },
    ],
  },
  {
    label: "For providers",
    links: PROVIDER_LINKS.map(({ label, href }) => ({ label, href })),
  },
  {
    label: "Partners",
    links: PARTNER_LINKS.map(({ label, href }) => ({ label, href })),
  },
];

// Crisis resources — permanent, on every page. Mirrors the copy already in
// components/marketing/marketing-footer.tsx so both footers agree.
export const CRISIS_LINES: Array<{ icon: "phone" | "message"; label: string; detail: string }> = [
  { icon: "phone", label: "988 Suicide & Crisis Lifeline", detail: "Call or text 988" },
  { icon: "message", label: "Crisis Text Line", detail: "Text HOME to 741741" },
];
