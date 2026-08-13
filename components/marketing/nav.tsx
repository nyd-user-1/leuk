"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccordionSection } from "@/components/ui/accordion-section";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Icon, type IconName } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { SearchInput } from "@/components/ui/search-input";
import { Tag } from "@/components/ui/tag";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { BRAND } from "@/lib/brand";
import type { PublicResult } from "@/app/api/directory/public-search/route";
import { titleCase } from "@/lib/format";

// Public marketing nav (Headway pattern, Leuk brand). One shared dropdown
// panel whose caret + width morph under the active trigger — Search lives in
// the panel too (live directory results). "My portal" is the secondary Button
// + a left-aligned menu. Below md, the centered links collapse into a
// full-screen MobileMenu.
//
// Icon hover treatment: navy line + hero-pastel (primary-wash) fill on hover.

// Dark mode is built (theme-toggle.tsx, globals.css `:root.dark`) and staying
// — just no trigger for it right now. Flip this back to true to restore it.
const SHOW_THEME_TOGGLE = false;

type MenuKey = "book" | "search" | "find" | "providers" | "company";
const WIDTHS: Record<MenuKey, number> = { book: 700, search: 636, find: 636, providers: 320, company: 300 };

// ── content data ─────────────────────────────────────────────────────────────

const BOROUGHS: Array<[label: string, county: string]> = [
  ["Manhattan", "New York"],
  ["Brooklyn", "Kings"],
  ["Queens", "Queens"],
  ["Bronx", "Bronx"],
  ["Staten Island", "Richmond"],
];
// The 10 largest non-borough cities by provider volume in the live directory
// (`directory_providers.city`). The dataset is NYC-only, so beyond the four
// single-city boroughs every city here is a Queens neighborhood.
const CITIES = [
  "Flushing",
  "Forest Hills",
  "Jamaica",
  "Glen Oaks",
  "Elmhurst",
  "Bayside",
  "Rego Park",
  "Far Rockaway",
  "Long Island City",
  "Queens Village",
];
const SPECIALTIES = [
  "ADHD",
  "Anxiety",
  "Depression",
  "Bipolar Disorder",
  "OCD",
  "Trauma and PTSD",
  "Couples",
  "Grief and Loss",
  "Addiction",
  "LGBTQIA+",
];

type FindCategory = {
  key: string;
  label: string;
  icon: IconName;
  sections: Array<{ header?: string; links: Array<{ label: string; href: string; icon: IconName }> }>;
  viewAll: { label: string; href: string };
  /** Present only for the three location-driven categories (therapist/psychiatrist/
      nurse practitioner) — lets the panel splice in a "Near you" section when
      geolocation resolves. The exact filter each category searches by. */
  baseParams?: Record<string, string>;
};

const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

// Boroughs use `county=` (exact match); the Queens-neighborhood cities use
// `q=` (searches the directory's `city` column). Merged into one flat "By
// city" list — see FindCarePanel for the "Near you" section spliced on top
// when IP geolocation resolves the visitor to a NY city.
function locationSections(baseParams: Record<string, string>, icon: IconName) {
  const boroughLinks = BOROUGHS.map(([label, county]) => ({
    label,
    href: `/providers?${qs({ ...baseParams, county })}`,
    icon,
  }));
  const cityLinks = CITIES.map((c) => ({
    label: c,
    href: `/providers?${qs({ ...baseParams, q: c })}`,
    icon: "globe" as IconName,
  }));
  return [{ header: "By city", links: [...boroughLinks, ...cityLinks] }];
}

const FIND_CATEGORIES: FindCategory[] = [
  {
    key: "therapists",
    label: "Therapist",
    icon: "users",
    baseParams: { type: "therapist" },
    sections: locationSections({ type: "therapist" }, "person-circle"),
    viewAll: { label: "View all", href: "/providers?type=therapist" },
  },
  {
    key: "psychiatrists",
    label: "Psychiatrist",
    icon: "book-heart",
    baseParams: { need: "Psychiatrist" },
    sections: locationSections({ need: "Psychiatrist" }, "book-heart"),
    viewAll: { label: "View all", href: `/providers?${qs({ need: "Psychiatrist" })}` },
  },
  {
    key: "nurse-practitioner",
    label: "Nurse Practitioner",
    icon: "shield-plus",
    baseParams: { need: "Psychiatric Nurse Practitioner" },
    sections: locationSections({ need: "Psychiatric Nurse Practitioner" }, "shield-plus"),
    viewAll: { label: "View all", href: `/providers?${qs({ need: "Psychiatric Nurse Practitioner" })}` },
  },
  {
    key: "specialty",
    label: "Specialty",
    icon: "grid",
    sections: [
      {
        header: "By specialty",
        links: SPECIALTIES.map((s) => ({
          label: s,
          href: `/providers?specialty=${encodeURIComponent(s)}`,
          icon: "sparkle" as IconName,
        })),
      },
    ],
    viewAll: { label: "+20 more", href: "/providers" },
  },
  {
    key: "virtual",
    label: "Virtual therapy",
    icon: "video",
    sections: [
      {
        links: [
          { label: "Virtual therapy", href: "/providers?type=virtual", icon: "video" },
          { label: "Virtual psychiatry", href: "/providers?type=virtual&kind=psychiatry", icon: "video" },
          { label: "Same-week appointments", href: "/providers?type=virtual", icon: "calendar-check" },
        ],
      },
    ],
    viewAll: { label: "Browse virtual care", href: "/providers?type=virtual" },
  },
  {
    key: "resources",
    label: "Therapy resources",
    icon: "file-text",
    sections: [
      {
        links: [
          { label: "Mental health programs", href: "/care/programs", icon: "globe" },
          { label: "Crisis support", href: "/care/programs/family/crisis", icon: "phone" },
          { label: "What to expect", href: "/#for-providers", icon: "note" },
        ],
      },
    ],
    viewAll: { label: "Explore resources", href: "/care/programs" },
  },
];

const PROVIDER_LINKS: Array<{ label: string; href: string; icon: IconName }> = [
  { label: "Learn more", href: "/#for-providers", icon: "sparkle" },
  { label: "Join Leuk", href: "/join", icon: "plus" },
  { label: "Refer a provider", href: "/join?ref=1", icon: "send" },
  { label: "Provider portal", href: "/sign-in", icon: "lock" },
  { label: "Resource center", href: "/join#faq", icon: "file-text" },
];

const COMPANY_LINKS: Array<{ label: string; href: string; icon: IconName }> = [
  { label: "About us", href: "/company/about", icon: "globe" },
  { label: "Press", href: "/company/press", icon: "note" },
  { label: "Careers", href: "/company/careers", icon: "users" },
];

// ── row + panel-content pieces ───────────────────────────────────────────────

function PanelRow({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-field px-3 py-2 transition-colors hover:bg-canvas"
    >
      <Icon
        name={icon}
        size={20}
        className="shrink-0 text-text-muted transition-colors group-hover:fill-primary-wash group-hover:text-text"
      />
      <span className="text-[15px] font-medium text-text-body group-hover:text-text">{label}</span>
    </Link>
  );
}

// Find-care content link — plain text, no icon (icons are for the nav panels
// that are literal action rows, not this location/specialty index).
function FindLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-field px-3 py-2 text-[15px] font-medium text-text-body transition-colors hover:bg-canvas hover:text-text"
    >
      {label}
      <span aria-hidden className="text-primary opacity-0 transition-opacity group-hover:opacity-100">
        ↗
      </span>
    </Link>
  );
}

// Book panel — the dedicated booking dropdown. Left rail = the practice's real
// practitioners (GET /api/book/providers, includes Dr. Shelley Padgett); right =
// pick a day then a real open slot (GET /api/book, availability minus booked).
// Choosing a slot hands off to /book/[practitioner] with the day + time so the
// standalone page finishes the details + confirm.
type BookProvider = { id: string; name: string };

const fmtSlot = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

function BookPanel({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [providers, setProviders] = useState<BookProvider[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [provider, setProvider] = useState<string | null>(null);
  const [day, setDay] = useState<string>();
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/book/providers")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setProviders(d.practitioners ?? []);
        setServiceId(d.services?.[0]?.id ?? "");
        setProvider(d.practitioners?.[0]?.id ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!provider || !day || !serviceId) {
      setSlots(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/book?practitionerId=${encodeURIComponent(provider)}&serviceId=${encodeURIComponent(serviceId)}&date=${day}`)
      .then((r) => r.json())
      .then((d) => alive && setSlots(d.slots ?? []))
      .catch(() => alive && setSlots([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [provider, day, serviceId]);

  return (
    <div className="flex">
      {/* left third — providers rail */}
      <div className="w-1/3 p-2">
        <p className="px-3 pb-1 pt-1 text-[13px] font-semibold text-primary">Providers</p>
        {providers.length === 0 && <p className="px-3 py-2 text-sm text-text-muted">Loading…</p>}
        {providers.map((p) => {
          const on = p.id === provider;
          return (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setProvider(p.id)}
              onClick={() => setProvider(p.id)}
              className={`flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-left transition-colors ${on ? "bg-surface shadow-sm" : ""}`}
            >
              <Icon name="person-circle" size={20} className={`shrink-0 ${on ? "fill-primary-wash text-text" : "text-text-muted"}`} />
              <span className={`text-[15px] font-medium ${on ? "text-text" : "text-text-body"}`}>{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* right two-thirds — calendar left, that day's open times beside it */}
      <div className="flex w-2/3 gap-6 p-4">
        <DatePicker value={day} onChange={setDay} className="w-64 shrink-0" />
        <div className="min-w-0 flex-1 border-l border-border pl-6">
          <p className="pb-1.5 text-[13px] font-semibold text-primary">Availability</p>
          {!day && <p className="py-2 text-sm text-text-muted">Pick a day to see open times.</p>}
          {day && loading && <p className="py-2 text-sm text-text-muted">Finding open times…</p>}
          {day && !loading && slots && slots.length === 0 && (
            <p className="py-2 text-sm text-text-muted">No open times that day — try another.</p>
          )}
          {day && !loading && slots && slots.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {slots.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => provider && onNavigate(`/book/${provider}?service=${serviceId}&date=${day}&time=${t}`)}
                  className="rounded-field border border-border px-2 py-1.5 text-[13px] font-medium text-text-body transition-colors hover:border-primary hover:bg-primary-wash hover:text-primary"
                >
                  {fmtSlot(t)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FindCarePanel({ cat, setCat }: { cat: string; setCat: (k: string) => void }) {
  // Both the rail highlight and the right-hand content follow whatever's hovered
  // (falling back to `cat` when nothing is hovered). Clicking a rail item pins it;
  // the links out (with a teal ↗ on hover) live on the content options.
  const [hovered, setHovered] = useState<string | null>(null);
  const [geo, setGeo] = useState<{ city: string | null; region: string | null } | null>(null);

  // Fires once, the first time this panel mounts (i.e. the first time someone
  // opens the Care menu) — not on every page load. IP geolocation via Vercel's
  // edge headers (see app/api/geo); resolves to nulls in local dev, where
  // there's no edge in front of the request, so "Near you" just never appears.
  useEffect(() => {
    let alive = true;
    fetch("/api/geo")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setGeo(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const highlight = hovered ?? cat;
  const active = FIND_CATEGORIES.find((c) => c.key === highlight) ?? FIND_CATEGORIES[0];
  // The directory is NY-only, so "near you" only makes sense once geolocation
  // resolves the visitor to a NY city — otherwise it'd point at an empty search.
  const nearYou =
    active.baseParams && geo?.city && geo.region === "NY"
      ? [
          {
            header: "Near you",
            links: [
              {
                label: `${geo.city}, NY`,
                href: `/providers?${qs({ ...active.baseParams, q: geo.city })}`,
                icon: active.icon,
              },
            ],
          },
        ]
      : [];
  const sections = [...nearYou, ...active.sections];
  return (
    <div className="flex">
      {/* left third — category rail (grey comes from the panel gradient) */}
      <div className="w-1/3 p-2" onMouseLeave={() => setHovered(null)}>
        <p className="px-3 pb-1 pt-1 text-[13px] font-semibold text-primary">Services</p>
        {FIND_CATEGORIES.map((c) => {
          const on = c.key === highlight;
          return (
            <button
              key={c.key}
              type="button"
              onMouseEnter={() => {
                setHovered(c.key);
                setCat(c.key);
              }}
              onClick={() => setCat(c.key)}
              className={`flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-left transition-colors ${
                on ? "bg-surface shadow-sm" : ""
              }`}
            >
              <Icon
                name={c.icon}
                size={20}
                className={`shrink-0 transition-colors ${on ? "fill-primary-wash text-text" : "text-text-muted"}`}
              />
              <span className={`text-[15px] font-medium ${on ? "text-text" : "text-text-body"}`}>{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* right two-thirds — content; View all is the last grid cell */}
      <div className="w-2/3 p-4">
        {sections.map((s, i) => {
          const isLast = i === sections.length - 1;
          return (
            <div key={i} className="mb-4 last:mb-0">
              {s.header && <p className="px-3 pb-1 text-[13px] font-semibold text-primary">{s.header}</p>}
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {s.links.map((l) => (
                  <FindLink key={l.href + l.label} href={l.href} label={l.label} />
                ))}
                {isLast && (
                  <Link
                    href={active.viewAll.href}
                    className="group col-span-2 px-3 py-2 text-[15px] font-medium text-primary"
                  >
                    <span className="link-wipe">Browse 116,185 providers</span>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Mocked "Recent results" shown before a query is entered.
const RECENT_RESULTS: string[] = [
  "Maya Patel, MD",
  "Devon Wright, LCSW",
  "Adelante Counseling PLLC",
  "Sandra Leong, PsyD",
  "Riverside Mental Health",
];

// Directory rows (not the handful of bookable Leuk practitioners) come out
// of NPPES in ALL CAPS, so their names get the same titleCase pass as the
// city/address fix.
const resultName = (r: PublicResult) => (r.bookable ? r.name : titleCase(r.name));

// A single result / recent-result row: two-tone person icon + name only.
function ResultRow({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-field px-2 py-2 text-left transition-colors hover:bg-canvas"
    >
      <Icon name="person-circle" size={20} className="shrink-0 fill-primary-wash text-text" />
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text">{name}</span>
    </button>
  );
}

type PayerOption = { slug: string; name: string; providerCount: number };

// Live directory search in the morphing panel: search bar + insurance filter
// rail on the left, results / "Recent results" on the right. Results are
// capped so the panel stays within the Find-care menu height.
function SearchPanel({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [q, setQ] = useState("");
  const [insurance, setInsurance] = useState<string | null>(null);
  const [payers, setPayers] = useState<PayerOption[]>([]);
  const [results, setResults] = useState<PublicResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fires once, the first time this panel mounts — real harvested payers only
  // (Cigna, Humana, ...); the full list incl. carriers we hold nothing for
  // lives on /providers, reached via "View more".
  useEffect(() => {
    let alive = true;
    fetch("/api/insurance-options")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setPayers(d.payers ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const active = q.trim().length > 0 || insurance !== null;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (insurance) params.set("insurance", insurance);
        const res = await fetch(`/api/directory/public-search?${params.toString()}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, insurance, active]);

  const selectInsurance = (slug: string) => setInsurance((cur) => (cur === slug ? null : slug));
  const go = () => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (insurance) p.set("insurance", insurance);
    onNavigate(`/providers${p.toString() ? `?${p.toString()}` : ""}`);
  };

  const shown = results.slice(0, 6);

  return (
    <div>
      {/* search bar + active filter chip */}
      <div className="p-3">
        <SearchInput
          autoFocus
          className="[&_svg]:fill-primary-wash [&_svg]:text-text"
          placeholder="Search therapists, psychiatrists, and programs"
          aria-label="Search providers and programs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
        />
        {insurance && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Tag hue="teal" onDismiss={() => setInsurance(null)}>
              {payers.find((p) => p.slug === insurance)?.name ?? insurance}
            </Tag>
          </div>
        )}
      </div>

      {/* filter rail + results */}
      <div className="flex border-t border-border">
        <div className="w-1/3 bg-canvas p-2">
          <p className="px-2.5 pb-1 pt-1 text-[13px] font-semibold text-primary">Filter</p>
          {payers.map((p) => {
            const on = insurance === p.slug;
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => selectInsurance(p.slug)}
                className={`group flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-left transition-colors ${
                  on ? "bg-surface shadow-sm" : "hover:bg-surface hover:shadow-sm"
                }`}
              >
                <Icon
                  name="id-card"
                  size={20}
                  className={`shrink-0 text-text transition-colors ${on ? "fill-primary-wash" : "group-hover:fill-primary-wash"}`}
                />
                <span
                  className={`text-[15px] font-medium ${on ? "text-text" : "text-text-body group-hover:text-text"}`}
                >
                  {p.name}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={go}
            className="group flex w-full items-center gap-3 rounded-field px-3 py-2.5 text-left transition-colors hover:bg-surface hover:shadow-sm"
          >
            <Icon
              name="grid"
              size={20}
              className="shrink-0 text-text-muted transition-colors group-hover:fill-primary-wash group-hover:text-text"
            />
            <span className="text-[15px] font-medium text-text-body group-hover:text-text">View more</span>
          </button>
        </div>

        <div className="w-2/3 p-3">
          <p className="px-1 pb-1 text-[13px] font-semibold text-primary">{active ? "Results" : "Search"}</p>
          {!active && RECENT_RESULTS.map((name) => <ResultRow key={name} name={name} onClick={go} />)}
          {active && loading && <p className="px-1 py-3 text-sm text-text-muted">Searching…</p>}
          {active && !loading && shown.length === 0 && (
            <p className="px-1 py-3 text-sm text-text-muted">No matches. Try a broader term.</p>
          )}
          {active &&
            !loading &&
            shown.map((r) => (
              <ResultRow key={`${r.kind}-${r.id}`} name={resultName(r)} onClick={go} />
            ))}
          <button type="button" onClick={go} className="group mt-1 flex px-1 py-2 text-[15px] font-medium text-primary">
            <span className="link-wipe">Browse 116,185 providers</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function ProvidersPanel() {
  return (
    <div className="p-2">
      <p className="px-3 pb-1 pt-1 text-[13px] font-semibold text-primary">Professionals</p>
      {PROVIDER_LINKS.map((l) => (
        <PanelRow key={l.href} {...l} />
      ))}
    </div>
  );
}

function CompanyPanel() {
  return (
    <div className="p-2">
      <p className="px-3 pb-1 pt-1 text-[13px] font-semibold text-primary">Leuk</p>
      {COMPANY_LINKS.map((l) => (
        <PanelRow key={l.href} {...l} />
      ))}
    </div>
  );
}

// My portal — the real secondary Button primitive + a left-aligned dropdown.
function MyPortalMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover-open (like the centered nav triggers); a short close delay bridges the
  // gap between the button and the menu so it doesn't flicker shut.
  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div ref={ref} className="relative" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <Button
        variant="secondary"
        className="!border-primary"
        onClick={openMenu}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Log in
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 flex w-56 flex-col rounded-card border border-border bg-surface p-2 shadow-menu"
        >
          <p className="px-3 pb-1 pt-1 text-[13px] font-semibold text-primary">Portal</p>
          {(
            [
              { icon: "person-circle", label: "For patients" },
              { icon: "lock", label: "For providers" },
            ] as const
          ).map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => go("/sign-in")}
              className="group flex w-full items-center gap-3 rounded-field px-3 py-2 text-left transition-colors hover:bg-canvas"
            >
              <Icon name={it.icon} size={20} className="shrink-0 text-text-muted transition-colors group-hover:fill-primary-wash group-hover:text-text" />
              <span className="text-[15px] font-medium text-text-body group-hover:text-text">{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Mobile menu — full-screen sheet with collapsible sections (Headway pattern).
function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  if (!open || typeof document === "undefined") return null;
  const link = (href: string, label: string) => (
    <Link
      key={href + label}
      href={href}
      onClick={onClose}
      className="block rounded-field px-3 py-2 text-[15px] font-medium text-text-body hover:bg-canvas hover:text-text"
    >
      {label}
    </Link>
  );
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-surface md:hidden">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
        <Link href="/" aria-label={`${BRAND.name} home`} onClick={onClose}>
          <img src={BRAND.logoDark} alt={BRAND.name} className="h-11 w-auto" />
        </Link>
        <IconButton icon="x" label="Close menu" onClick={onClose} />
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-2">
        <AccordionSection title="Find care" defaultOpen={false}>
          {FIND_CATEGORIES.map((c) => link(c.viewAll.href, c.label))}
        </AccordionSection>
        <AccordionSection title="For providers" defaultOpen={false}>
          {PROVIDER_LINKS.map((l) => link(l.href, l.label))}
        </AccordionSection>
        <AccordionSection title="Company" defaultOpen={false}>
          {COMPANY_LINKS.map((l) => link(l.href, l.label))}
        </AccordionSection>
        <div className="mt-6 flex flex-col gap-3">
          <Button variant="secondary" fullWidth onClick={() => { onClose(); router.push("/sign-in"); }}>
            Log in
          </Button>
          <Button fullWidth onClick={() => { onClose(); router.push("/join"); }}>
            Sign up
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── nav ──────────────────────────────────────────────────────────────────────

// `ground` is the non-scrolled bar background (Tailwind classes). Defaults to the
// mint hero wash used on /join and /providers; the redesigned home passes the
// First Light page ground so the bar melts into the hero.
export function Nav({ ground = "bg-primary-wash" }: { ground?: string } = {}) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [cat, setCat] = useState("therapists");
  const [caretX, setCaretX] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<MenuKey, HTMLButtonElement | null>>({
    book: null,
    search: null,
    find: null,
    providers: null,
    company: null,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMenu = useRef<MenuKey>("find");
  if (open) lastMenu.current = open;
  const menu = open ?? lastMenu.current;

  const measure = useCallback((m: MenuKey) => {
    const t = triggerRefs.current[m];
    const c = barRef.current;
    if (!t || !c) return;
    const tr = t.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    setCaretX(tr.left + tr.width / 2 - cr.left);
  }, []);

  const openMenu = useCallback(
    (m: MenuKey) => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      measure(m);
      if (m === "find") setCat("therapists");
      setOpen(m);
    },
    [measure],
  );

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(null), 150);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const isDark = localStorage.getItem("mkt-theme") === "dark";
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  // Marketing-only dark toggle — circular reveal via the View Transitions
  // API, ported from 44b's AppLayout. Lives here (not inside ThemeToggle) so
  // the logo swap below can read the same `dark` state.
  const toggleTheme = useCallback(
    (e: React.MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      const next = !dark;

      const apply = () => {
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("mkt-theme", next ? "dark" : "light");
      };

      if (!document.startViewTransition) {
        apply();
        return;
      }

      const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      const transition = document.startViewTransition(() => flushSync(apply));
      transition.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
          { duration: 600, easing: "cubic-bezier(.76,.32,.29,.99)", pseudoElement: "::view-transition-new(root)" },
        );
      });
    },
    [dark],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openMenu("search");
      }
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMenu]);

  // Animate panel height to fit content on menu / category change.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!open || !el) {
      setPanelHeight(0);
      return;
    }
    // Track the panel's *live* content height with a ResizeObserver rather than
    // measuring once: the width animates between menus, which reflows/​un-wraps
    // the text, and a one-shot read taken mid-transition freezes a stale (too
    // tall) height. Observing keeps the box fitting exactly, at any data shape.
    const ro = new ResizeObserver(() => setPanelHeight(el.scrollHeight));
    ro.observe(el);
    setPanelHeight(el.scrollHeight);
    return () => ro.disconnect();
  }, [open, menu, cat]);

  const triggers: Array<{ key: MenuKey; label: string }> = [
    { key: "book", label: "Book" },
    { key: "search", label: "Search" },
    { key: "find", label: "Care" },
    { key: "providers", label: "Providers" },
    { key: "company", label: "Company" },
  ];

  return (
    <>
      <header
        className={`sticky top-0 z-40 transition-all duration-200 ${
          scrolled ? "bg-surface shadow-card" : ground
        }`}
      >
        <div
          ref={barRef}
          className={`relative mx-auto flex max-w-6xl items-center gap-6 px-6 transition-all duration-200 ${
            scrolled ? "h-[70px]" : "h-[72px]"
          }`}
          onMouseLeave={scheduleClose}
        >
          <Link href="/" aria-label="Leuk home" className="group relative shrink-0">
            {/* Sunrise wipe: a brightened copy of the mark is stacked on top and
                revealed bottom→top via an animating clip-path, so the "dawn"
                (brighter/warmer pigment) rises up through the watercolor on hover.
                No motion — the base mark stays put. */}
            <img
              src={dark ? BRAND.logoLight : BRAND.logoDark}
              alt={BRAND.name}
              className={`block h-11 w-auto transition-all duration-200 ${dark ? "brightness-125" : ""}`}
            />
            <img
              src={dark ? BRAND.logoLight : BRAND.logoDark}
              alt=""
              aria-hidden
              className={`pointer-events-none absolute left-0 top-0 block h-11 w-auto saturate-[1.25] ${dark ? "brightness-125" : "brightness-110"} [clip-path:inset(100%_0_0_0)] transition-[clip-path] duration-[600ms] ease-out group-hover:[clip-path:inset(0_0_0_0)]`}
            />
          </Link>

          {/* nav links — centered in the bar */}
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {triggers.map((t) => (
              <button
                key={t.key}
                ref={(el) => {
                  triggerRefs.current[t.key] = el;
                }}
                type="button"
                onMouseEnter={() => openMenu(t.key)}
                onFocus={() => openMenu(t.key)}
                aria-expanded={open === t.key}
                className={`rounded-field px-3 py-2 text-[15px] font-medium transition-colors hover:bg-black/[0.04] hover:text-primary ${
                  open === t.key ? "text-primary" : "text-text-body"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {/* right cluster */}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 md:flex">
              {/* Dark/light mode is staying — just hiding the trigger for now.
                  Flip SHOW_THEME_TOGGLE back to true to bring the icon back. */}
              {SHOW_THEME_TOGGLE && <ThemeToggle dark={dark} onToggle={toggleTheme} />}
              <MyPortalMenu />
              <Button onClick={() => router.push("/join")}>Sign up</Button>
            </div>
            <IconButton icon="menu" label="Open menu" className="md:hidden" onClick={() => setMobileOpen(true)} />
          </div>

          {/* shared morphing panel */}
          <div className="pointer-events-none absolute left-0 top-full z-40 w-full" aria-hidden={!open}>
            <div
              className="absolute top-2 transition-[left,width] duration-[250ms] ease-out"
              style={{ left: caretX, width: WIDTHS[menu], transform: "translateX(-50%)" }}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
            >
              {/* caret */}
              <div
                className={`mx-auto h-3 w-3 rotate-45 rounded-[2px] border-l border-t border-border bg-surface transition-opacity duration-150 ${
                  open ? "opacity-100" : "opacity-0"
                }`}
              />
              <div
                className={`pointer-events-auto -mt-[7px] overflow-hidden rounded-card border border-border shadow-menu transition-[height,opacity] duration-[250ms] ease-out ${
                  open ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                style={{
                  height: open ? panelHeight : 0,
                  // Find-care two-tone: left third canvas, rest surface — painted
                  // on the box so the rail always fills full height.
                  background:
                    menu === "find" || menu === "book"
                      ? "linear-gradient(to right, var(--color-canvas) 0 33.3333%, var(--color-surface) 33.3333%)"
                      : "var(--color-surface)",
                }}
              >
                <div ref={contentRef}>
                  {menu === "search" && (
                    <SearchPanel
                      onNavigate={(href) => {
                        setOpen(null);
                        router.push(href);
                      }}
                    />
                  )}
                  {menu === "find" && <FindCarePanel cat={cat} setCat={setCat} />}
                  {menu === "book" && (
                    <BookPanel
                      onNavigate={(href) => {
                        setOpen(null);
                        router.push(href);
                      }}
                    />
                  )}
                  {menu === "providers" && <ProvidersPanel />}
                  {menu === "company" && <CompanyPanel />}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <MobileMenu open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
}
