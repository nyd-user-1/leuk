import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icons";
import { CONDITION_LINKS, PARTNER_LINKS, PROVIDER_LINKS } from "@/lib/site-content";
import { PROGRAM_FAMILIES } from "@/lib/program-taxonomy";

// Public marketing footer — navy brand block: link columns, a crisis-support
// note (a mental-health site should always surface these), practice contact,
// and the data-source line.
//
// Doubles as a running site map while the public pages are still being built:
// every live public route is linked from one of these columns, plus an
// "Other" column for pages that exist in the repo but aren't decided yet
// (ship or delete) — audit surface, remove once the site settles.

type FooterColumn = {
  heading: string;
  href?: string;
  note?: string;
  links: Array<{ label: string; href: string }>;
};

// Row 1 — the care-discovery columns.
const TOP_COLUMNS: FooterColumn[] = [
  {
    heading: "Care",
    href: "/providers",
    links: [
      { label: "Therapists", href: "/therapists" },
      { label: "Psychiatrists", href: "/psychiatrists" },
      { label: "Psychiatric NP", href: "/psychiatric-np" },
      { label: "Book with Leuk", href: "/book/leuk" },
      { label: "Virtual therapy", href: "/providers?type=virtual" },
    ],
  },
  {
    heading: "Specialty",
    href: "/specialty",
    links: [
      ...CONDITION_LINKS.filter((l) => l.label !== "Trauma & PTSD").slice(0, 4),
      { label: "View more", href: "/specialty" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About us", href: "/company/about" },
      { label: "Press", href: "/company/press" },
      { label: "Careers", href: "/company/careers" },
    ],
  },
  {
    heading: "Support",
    links: [
      { label: "Help center", href: "/help" },
      { label: "Contact us", href: "/contact" },
      { label: "For health plans", href: "/for-health-plans" },
      { label: "Sitemap", href: "/sitemap" },
      { label: "FAQs", href: "/faqs" },
    ],
  },
];

// Row 2 — the business/meta columns.
const BOTTOM_COLUMNS: FooterColumn[] = [
  {
    heading: "For providers",
    links: [
      ...PROVIDER_LINKS.map(({ label, href }) => ({ label, href })),
      { label: "Rate data", href: "/pricing-data" },
      { label: "Payer negotiation", href: "/payer-negotiation" },
      { label: "Underpayment disputes", href: "/payer-disputes" },
      { label: "Refer a provider", href: "/join?ref=1" },
      { label: "Provider portal", href: "/sign-in" },
    ],
  },
  {
    heading: "Programs",
    href: "/care/programs",
    links: [
      ...PROGRAM_FAMILIES.slice(0, 5).map((f) => ({ label: f.label, href: `/programs/family/${f.slug}` })),
      { label: "View more", href: "/care/programs" },
    ],
  },
  {
    heading: "Partners",
    links: PARTNER_LINKS,
  },
  {
    heading: "Other",
    note: "Exists — not decided yet",
    links: [{ label: "Home v2 (WIP)", href: "/home-2" }],
  },
];

function FooterColumn({ col }: { col: FooterColumn }) {
  return (
    <div>
      {col.href ? (
        <Link
          href={col.href}
          className={`group -mx-2 flex items-center justify-between rounded-field px-2 py-1.5 text-sm font-semibold transition-colors hover:bg-white/[0.06] hover:text-white ${col.note ? "text-accent" : "text-white"}`}
        >
          {col.heading}
          <span aria-hidden className="text-white opacity-0 transition-opacity group-hover:opacity-100">
            ↗
          </span>
        </Link>
      ) : (
        <h3 className={`text-sm font-semibold ${col.note ? "text-accent" : "text-white"}`}>{col.heading}</h3>
      )}
      {col.note && <p className="mt-0.5 text-xs text-sidebar-text/50">{col.note}</p>}
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {col.links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              className="group -mx-2 flex items-center justify-between rounded-field px-2 py-1.5 text-sidebar-text/80 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {l.label}
              <span aria-hidden className="text-white opacity-0 transition-opacity group-hover:opacity-100">
                ↗
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CrisisLine({ icon, label, detail }: { icon: IconName; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-accent" />
      <span>
        <span className="block font-medium text-white">{label}</span>
        <span className="block text-sidebar-text/70">{detail}</span>
      </span>
    </li>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-dusk-deep text-sidebar-text">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 border-b border-white/10 pb-10 lg:grid-cols-[12rem_1fr]">
          <div>
            <Link href="/" aria-label="Leuk home" className="inline-block">
              {/* Pre-rename blob object name on purpose — a pathname is a
                  storage key, and this object was never re-uploaded under
                  `leuk-`. See app/(app)/design-system/page.tsx. */}
              <img
                src="https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/logos/brand/liminal-light.png"
                alt="Leuk"
                className="h-8 w-auto"
              />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-4">
            {TOP_COLUMNS.map((col) => (
              <FooterColumn key={col.heading} col={col} />
            ))}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
          {BOTTOM_COLUMNS.map((col) => (
            <FooterColumn key={col.heading} col={col} />
          ))}
        </div>

        {/* Crisis + contact */}
        <div className="mt-12 grid gap-8 border-t border-white/10 pt-8 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-white">In crisis? Help is available 24/7.</h3>
            <ul className="mt-3 flex flex-col gap-3 text-sm">
              <CrisisLine icon="phone" label="988 Suicide & Crisis Lifeline" detail="Call or text 988" />
              <CrisisLine icon="message" label="Crisis Text Line" detail="Text HOME to 741741" />
            </ul>
            <p className="mt-3 text-sm text-sidebar-text/70">If this is an emergency, call 911.</p>
          </div>
          <div className="md:text-right">
            <h3 className="text-sm font-semibold text-white">Visit us</h3>
            <address className="mt-3 text-sm not-italic leading-relaxed text-sidebar-text/80">
              108 West 39th St, Ste 1006 · New York, NY 10018
            </address>
            <p className="mt-2 text-sm text-sidebar-text/80">
              Call or text{" "}
              <a href="tel:+13322964649" className="text-white hover:underline">
                (332) 296-4649
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-6 py-5 text-xs text-sidebar-text/60">
          © 2026 Leuk. Provider directory data sourced from NY State (OMH) and NY Medicaid open data.
        </p>
      </div>
    </footer>
  );
}
