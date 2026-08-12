import type { ReactNode } from "react";
import { MobileNav } from "@/components/shell/mobile-nav";
import { AgentDock } from "@/components/agents/agent-dock";
import { CommandPalette } from "@/components/search/command-palette";
import { ContentSurface } from "@/components/shell/content-surface";
import { Sidebar, type SidebarNavSection } from "@/components/shell/sidebar";
import { APP_PANEL_ROOT_ID } from "@/components/shell/app-panel-root";
import { MAIN_PANEL_ID } from "@/components/shell/main-panel";
import type { SessionUser } from "@/lib/auth";

// Catalog `AppShell` — Sidebar + the floating content panel.
// Two variants: `workspace` (practitioner/admin) and `portal` (client).
// Server component; layouts pass the session user down.
//
// Shell chrome (2026-07-23 rework — the TopBar strip is retired): the
// warm-paper Sidebar sits left; the white content panel floats beside it,
// rounded on all corners with a 24px paper margin at top/right/bottom (md+).
// The panel's first row is the surface header (ContentSurface): context
// switcher left, page actions + search right — the page chrome lives INSIDE
// the panel now. The account chip lives at the bottom of the Sidebar.

// The practitioner nav, categorized (Fathom pattern): a headerless top group,
// then collapsible sections. Workspace lives under System (moved 2026-08-10 —
// /chat is the front door now); its sub-views (Analytics / Dashboard / Data
// dictionary / Docs) are in-content tabs, not sidebar children.
const WORKSPACE_NAV: SidebarNavSection[] = [
  {
    items: [
      { label: "Chat", href: "/chat", icon: "message" },
      { label: "Calendar", href: "/calendar", icon: "calendar" },
      { label: "Inbox", href: "/inbox", icon: "inbox" },
      { label: "Clients", href: "/clients", icon: "users" },
    ],
  },
  {
    header: "Practice",
    icon: "hand-heart",
    items: [
      { label: "Prescriptions", href: "/prescriptions", icon: "pill-bottle" },
      { label: "Orders", href: "/orders", icon: "send" },
      { label: "Billing", href: "/billing", icon: "dollar" },
      { label: "Earnings", href: "/earnings", icon: "credit-card" },
      { label: "Catalog", href: "/catalog", icon: "grid" },
      { label: "Library", href: "/library", icon: "clipboard" },
    ],
  },
  {
    header: "Intelligence",
    icon: "columns-3",
    items: [
      { label: "Rates", href: "/rates", icon: "activity" },
      { label: "Directory", href: "/directory", icon: "globe" },
      { label: "Programs", href: "/programs", icon: "hand-heart" },
      { label: "Organizations", href: "/orgs", icon: "id-card" },
      { label: "Maps", href: "/maps", icon: "map-pin" },
      { label: "Networks", href: "/networks", icon: "link" },
      { label: "Plans", href: "/plans", icon: "credit-card" },
      { label: "Recruiting", href: "/recruiting", icon: "users-round" },
    ],
  },
  {
    header: "System",
    icon: "monitor-check",
    items: [
      { label: "Workspace", href: "/workspace", icon: "grid" },
      { label: "Monitor", href: "/monitor", icon: "activity" },
      { label: "Settings", href: "/settings", icon: "gear" },
      { label: "Design system", href: "/design-system", icon: "paint-roller" },
    ],
  },
];

// Home is the patient's own record (the /clients/[id] shell, read-only), so
// Medications / Records / Invoices each exist twice: once as a tab of that
// record and once as their own destination here. One flat, headerless group.
const PORTAL_NAV: SidebarNavSection[] = [
  {
    items: [
      { label: "Home", href: "/portal", icon: "id-card" },
      { label: "Appointments", href: "/portal/appointments", icon: "calendar-check" },
      { label: "Medications", href: "/portal/medications", icon: "pill-bottle" },
      { label: "Records", href: "/portal/records", icon: "file-text" },
      { label: "Resources", href: "/portal/resources", icon: "globe" },
      { label: "Forms", href: "/portal/forms", icon: "clipboard" },
      { label: "Invoices", href: "/portal/invoices", icon: "credit-card" },
      { label: "Messages", href: "/portal/messages", icon: "message" },
      { label: "Profile", href: "/portal/profile", icon: "person-circle" },
      { label: "Dashboard", href: "/portal/dashboard", icon: "grid" },
    ],
  },
];

export function AppShell({
  variant,
  user,
  counts,
  children,
}: {
  variant: "workspace" | "portal";
  user: SessionUser;
  /** Optional per-href sidebar count badges, e.g. { "/inbox": 3 }. */
  counts?: Record<string, number>;
  children: ReactNode;
}) {
  const base = variant === "workspace" ? WORKSPACE_NAV : PORTAL_NAV;
  const sections: SidebarNavSection[] = counts
    ? base.map((s) => ({
        ...s,
        items: s.items.map((item) => (counts[item.href] !== undefined ? { ...item, count: counts[item.href] } : item)),
      }))
    : base;
  const homeHref = variant === "portal" ? "/portal" : "/calendar";
  return (
    <div className="flex h-dvh overflow-hidden bg-page">
      {/* ⌘K search. Both variants have one; they differ only in the endpoint
          behind them. The portal's is scoped server-side to the signed-in
          patient's own record — it cannot return another client, or anything
          from the directory/rates side of the app. */}
      <CommandPalette scope={variant === "portal" ? "portal" : "workspace"} />
      <Sidebar className="max-md:hidden" sections={sections} user={user} homeHref={homeHref} />
      <div className="flex min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)] md:py-6 md:pr-6">
        {/* The floating content panel: white surface, rounded on every corner
            (md+), paper showing on all sides. Full-bleed on mobile. The panel
            clips its own children; scrolling happens inside ContentSurface. */}
        <main
          id={MAIN_PANEL_ID}
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden border border-[#e2e4e9] bg-surface md:rounded-2xl"
        >
          <ContentSurface
            variant={variant}
            leading={<MobileNav sections={sections} user={user} homeHref={homeHref} />}
          >
            {children}
          </ContentSurface>
        </main>
      </div>

      {/* Push-panel lane. A flex SIBLING of the content column, so an open
          AppPanel takes width from the page instead of covering it, and the
          node outlives every route change because it sits outside `children`.
          Vertical padding only — horizontal padding here would leave a dead
          24px gutter while the lane is empty. */}
      <div id={APP_PANEL_ROOT_ID} className="flex h-full shrink-0 md:py-6" />
      {/* Mounted once, outside the routed subtree: that is what lets the
          transcript survive navigation. Pages only toggle it (AgentButton).
          Workspace only — the roster is staff-facing (provider directory,
          rates, credentialing); a patient has no business holding its end. */}
      {variant === "workspace" && <AgentDock />}
    </div>
  );
}
