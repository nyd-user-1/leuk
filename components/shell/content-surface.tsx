"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TopBarBell } from "@/components/shell/topbar-bell";
import { ownsPageTitle, routeTitle } from "@/components/shell/route-title";
import { OPEN_COMMAND_PALETTE } from "@/components/search/command-palette";
import { TOPBAR_ACTIONS_ID } from "@/components/shell/topbar-slot";
import { Icon, type IconName } from "@/components/ui/icons";
import { RevealFx } from "@/components/providers/reveal-fx";

// Catalog `ContentSurface` — the inside of the floating white panel. Replaces
// the old TopBar strip + ContentHeader H1 (retired 2026-07-23): the panel's
// first row IS the page chrome now. Reads left → right:
//
//   [Section ⇅]  ···················  [page actions]  [Search… ⌘K]  [bell?]
//
// The LEFT pill is a self-contained section switcher (its own anchored menu,
// Vercel "All Projects ⇅") — it is the page identifier (the route title renders
// as an sr-only H1 beside it) and a nav function in one. The RIGHT pill opens
// the global ⌘K palette. The bell appears on the Workspace board family only
// (ruling 2026-07-23). Page actions portal in via TopBarActions; index pages
// instead put their "+ New" at the right end of the tab rail (IndexHeader).
//
// The row is fixed to the top of the panel; content scrolls in the region
// below and slides beneath it.

// Jump-to destinations for the switcher menu — the main app areas.
const SWITCH_DESTINATIONS: Array<{ label: string; href: string; icon: IconName }> = [
  { label: "Workspace", href: "/workspace", icon: "grid" },
  { label: "Calendar", href: "/calendar", icon: "calendar" },
  { label: "Inbox", href: "/inbox", icon: "inbox" },
  { label: "Clients", href: "/clients", icon: "users" },
  { label: "Prescriptions", href: "/prescriptions", icon: "pill-bottle" },
  { label: "Orders", href: "/orders", icon: "send" },
  { label: "Billing", href: "/billing", icon: "dollar" },
  { label: "Catalog", href: "/catalog", icon: "grid" },
  { label: "Library", href: "/library", icon: "clipboard" },
  { label: "Rates", href: "/rates", icon: "activity" },
  { label: "Directory", href: "/directory", icon: "globe" },
  { label: "Programs", href: "/programs", icon: "hand-heart" },
  { label: "Organizations", href: "/orgs", icon: "id-card" },
  { label: "Maps", href: "/maps", icon: "map-pin" },
  { label: "Networks", href: "/networks", icon: "link" },
  { label: "Plans", href: "/plans", icon: "credit-card" },
  { label: "Recruiting", href: "/recruiting", icon: "users-round" },
  { label: "Settings", href: "/settings", icon: "gear" },
];

// The bell survives only where its alerts land: the Workspace board family.
const BELL_ROUTES = ["/workspace", "/analytics", "/dashboard"];

export function ContentSurface({
  variant,
  leading,
  children,
}: {
  variant: "workspace" | "portal";
  /** Slot before the context pill — the mobile hamburger. */
  leading?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const section = routeTitle(pathname).title;
  const showBell =
    variant === "workspace" && BELL_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <>
      <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 px-4 md:h-16 md:gap-3 md:px-6">
        {leading}
        <ContextSwitcher section={section} />
        {/* The switcher pill is the visible page identity; this keeps the
            document outline honest without a second visible title. Pages whose
            record names itself (/portal home) keep their own H1. */}
        {!ownsPageTitle(pathname) && <h1 className="sr-only">{section}</h1>}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div id={TOPBAR_ACTIONS_ID} className="flex items-center gap-2" />
          <SearchTrigger />
          {showBell && <TopBarBell />}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))] [scrollbar-width:none] md:p-6 md:pb-6 [&::-webkit-scrollbar]:hidden">
        {/* key={pathname} remounts RevealFx on every navigation, replaying the
            reveal from scratch — tuned fast (200ms, an 8px settle) so it reads
            as "content just arrived," not a marketing-page flourish. */}
        {/* h-full here is load-bearing, not cosmetic: RevealFx wraps every page
            in a plain block div, and full-height surfaces (calendar grid, inbox
            master/detail, the centred chat composer) size themselves with
            `h-full`. Without this the wrapper shrink-wraps its content and
            every one of them collapses to natural height with dead space
            below. It has to be a definite `h-full`, not `min-h-full`: a child's
            percentage height resolves against the parent's HEIGHT, and a parent
            with only a min-height is still auto. Pages taller than the viewport
            overflow this box and scroll normally — safe here because the reveal
            mask is a horizontal gradient that tiles identically down the axis,
            so the overflow is not clipped. */}
        <RevealFx key={pathname} durationMs={200} translateY={8} className="h-full">
          {children}
        </RevealFx>
      </div>
    </>
  );
}

// The far-left switcher pill (Vercel "All Projects ⇅"): the current section +
// a stacked up/down glyph (no brand crumb — ruling 2026-07-23). Click opens its
// OWN anchored menu — a "Find…" filter
// over a scrollable list of jump-to destinations — NOT the global ⌘K palette.
// Desktop-only; on mobile the hamburger + sidebar sheet carry the brand.
function ContextSwitcher({ section }: { section: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? SWITCH_DESTINATIONS.filter((d) => d.label.toLowerCase().includes(needle))
    : SWITCH_DESTINATIONS;

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${section} — switch section`}
        className={`flex h-9 items-center gap-1.5 rounded-field pl-3 pr-2 text-[14px] transition-colors ${
          open ? "bg-black/[0.04] text-primary" : "bg-black/[0.04] text-text-body hover:text-primary"
        }`}
      >
        <span className="max-w-[180px] truncate font-medium">{section}</span>
        <span className="ml-0.5 flex shrink-0 flex-col text-text-muted" aria-hidden>
          <Icon name="chevron-up" size={12} className="-mb-[3px]" />
          <Icon name="chevron-down" size={12} className="-mt-[3px]" />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1.5 w-64 overflow-hidden rounded-card border border-border bg-surface shadow-menu"
        >
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find…"
              aria-label="Find a section"
              className="w-full rounded-field bg-canvas px-2.5 py-1.5 text-[14px] text-text outline-none transition-shadow placeholder:text-text-muted focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-3 text-sm text-text-muted">No matches.</p>
            ) : (
              filtered.map((d) => (
                <button
                  key={d.href}
                  type="button"
                  role="menuitem"
                  onClick={() => go(d.href)}
                  className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[14px] font-medium text-text-body transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-text"
                >
                  <Icon name={d.icon} size={18} className="shrink-0 text-text-muted" />
                  <span className="flex-1 truncate">{d.label}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// A search field in look, a button in behavior: it opens the ⌘K CommandPalette
// (which owns the actual search). Full "Search… ⌘K" pill at md+, icon-only on
// mobile so the row stays uncramped.
function SearchTrigger() {
  const open = () => window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE));
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Search"
      className="group flex h-9 items-center gap-2 rounded-field bg-black/[0.04] px-2.5 text-text-muted transition-colors hover:text-primary md:w-64"
    >
      <Icon name="search" size={18} className="shrink-0" />
      <span className="hidden text-[14px] md:inline">Search…</span>
      <kbd className="ml-auto hidden rounded-[5px] border border-border bg-canvas px-1.5 py-0.5 text-[12px] font-medium md:inline">
        ⌘K
      </kbd>
    </button>
  );
}
