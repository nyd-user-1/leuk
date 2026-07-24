import type { IconName } from "@/components/ui/icons";

// The route → (icon, title) map that names each page. Consumed by
// ContentSurface (the surface header's context switcher + sr-only H1) — kept
// out of any one component so the mapping has a single home.
//
// Longest-prefix wins: order specific → general.
const ROUTE_TITLES: Array<[prefix: string, icon: IconName, title: string]> = [
  ["/workspace/data-dictionary", "grid", "Data dictionary"],
  ["/workspace/schema", "grid", "Schema"],
  ["/workspace/docs", "file-text", "Docs"],
  ["/workspace", "grid", "Workspace"],
  ["/analytics", "columns-3", "Analytics"],
  // The pre-rename original, kept reachable via the Workspace content tabs.
  ["/dashboard", "grid", "Dashboard"],
  ["/calendar", "calendar", "Calendar"],
  ["/inbox", "inbox", "Inbox"],
  ["/clients", "users", "Clients"],
  ["/prescriptions", "pill-bottle", "Prescriptions"],
  ["/orders", "send", "Orders"],
  ["/catalog", "grid", "Catalog"],
  ["/chat", "message", "Chat"],
  ["/directory", "globe", "Directory"],
  ["/programs", "globe", "Programs"],
  ["/billing", "dollar", "Billing"],
  ["/earnings", "credit-card", "Earnings"],
  ["/rates", "activity", "Rates"],
  ["/codes", "dollar", "Billing codes"],
  // Soft launch: direct-URL only, no sidebar entry. Sits after /rates but the
  // prefix match is exact-or-"/rates/", so the two never collide.
  ["/published-rates", "dollar", "Published rates"],
  ["/orgs", "id-card", "Organizations"],
  ["/maps", "map-pin", "Maps"],
  ["/networks", "link", "Networks"],
  ["/plans", "credit-card", "Plans"],
  ["/recruiting", "users-round", "Recruiting"],
  ["/library", "clipboard", "Library"],
  // Settings is a tabbed section (services/locations/availability) — one constant
  // title, tab bar switches the panel. See app/(app)/settings/layout.tsx.
  ["/settings", "gear", "Settings"],
  ["/monitor", "activity", "Monitor"],
  ["/design-system", "paint-roller", "Design System"],
  ["/admin/data", "grid", "Data dictionary"],
  ["/portal/dashboard", "grid", "Dashboard"],
  ["/portal/appointments", "calendar-check", "Appointments"],
  ["/portal/medications", "pill-bottle", "Medications"],
  ["/portal/records", "file-text", "Records"],
  ["/portal/resources", "globe", "Resources"],
  ["/portal/forms", "clipboard", "Forms"],
  ["/portal/invoices", "credit-card", "Invoices"],
  ["/portal/messages", "message", "Messages"],
  ["/portal/profile", "person-circle", "Profile"],
];

// Routes whose PAGE supplies the H1 because the record names itself — the
// client-record exception in CLAUDE.md. The surface header's sr-only H1 stands
// down for these so the document never carries two.
export function ownsPageTitle(pathname: string): boolean {
  // /chat is a full-height conversation surface — no page H1 at all (ruling
  // 2026-07-22); the switcher pill + thread content carry the identity.
  return pathname === "/portal" || pathname === "/chat";
}

// /portal is the patient's own record and carries its own entity header (the
// name as H1, the client-record exception), so the strip names the destination
// rather than greeting — the greeting moved to /portal/dashboard.
export function routeTitle(pathname: string): { icon: IconName; title: string } {
  if (pathname === "/portal") return { icon: "id-card", title: "Home" };
  const hit = ROUTE_TITLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  return hit ? { icon: hit[1], title: hit[2] } : { icon: "grid", title: "Leuk" };
}
