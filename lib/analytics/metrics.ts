// The metric registry — the catalog /analytics is composed from.
//
// hq's lib/fleet.ts is the model: a named metric is a DEFINITION (what it is,
// what shape it draws as, where its data lives), and the board renders whatever
// subset of ids the user has placed. This file is the definitions only; the
// numbers come from lib/repos/analytics.ts, keyed by `key`.
//
// PURE ON PURPOSE — no lib/db import, so the "use client" board and the KPI
// library panel can import MetricDef/METRICS directly. (Same rule as
// lib/rate-table.ts: importing a VALUE from a repo drags lib/db into the
// browser bundle, where the sql Proxy throws on construction.)

/** The chart vocabulary. Each kind has exactly one renderer in components/analytics. */
export type MetricKind = "stat" | "series" | "area" | "ranking" | "distribution" | "table" | "agenda" | "offer";

export type MetricCategory = "Practice" | "Finance" | "Directory" | "Insurance graph" | "Rates" | "Codes & benchmarks" | "Photon";

/** practice = the caseload (practitioners see these, own-scoped). platform = the data platform (admin only). */
export type MetricScope = "practice" | "platform";

export interface MetricDef {
  key: string;
  label: string;
  category: MetricCategory;
  kind: MetricKind;
  /** One plain-English line. Shown on the card and in the library. */
  description: string;
  /** The table/matview this reads. Opens the data dictionary panel. */
  sourceTable: string;
  /** The page this metric powers, if any. */
  poweredPage?: { href: string; label: string };
  scope: MetricScope;
}

export const CATEGORIES: MetricCategory[] = [
  "Practice",
  "Finance",
  "Directory",
  "Insurance graph",
  "Rates",
  "Codes & benchmarks",
  "Photon",
];

const DIRECTORY = { href: "/directory", label: "Directory" };
const RATES = { href: "/rates", label: "Rates" };
const PUBLISHED = { href: "/published-rates", label: "Published rates" };
const ORGS = { href: "/orgs", label: "Organizations" };
const PLANS = { href: "/plans", label: "Plans" };

export const METRICS: MetricDef[] = [
  // ── Practice — the caseload. Scoped to the viewer in SQL. ──────────────────
  { key: "today_appts", label: "Today's appointments", category: "Practice", kind: "stat", description: "Appointments on today's calendar, and how many are still to come.", sourceTable: "appointments", poweredPage: { href: "/calendar", label: "Calendar" }, scope: "practice" },
  { key: "next_up", label: "Next up", category: "Practice", kind: "agenda", description: "The rest of today, soonest first — the same agenda the calendar rail shows.", sourceTable: "appointments", poweredPage: { href: "/calendar", label: "Calendar" }, scope: "practice" },
  { key: "active_clients", label: "Active clients", category: "Practice", kind: "stat", description: "Clients with an active status on the caseload.", sourceTable: "clients", poweredPage: { href: "/clients", label: "Clients" }, scope: "practice" },
  { key: "unread_threads", label: "Unread messages", category: "Practice", kind: "stat", description: "Open threads where the client has said something nobody has read.", sourceTable: "threads", poweredPage: { href: "/inbox", label: "Inbox" }, scope: "practice" },
  { key: "outstanding", label: "Outstanding", category: "Practice", kind: "stat", description: "Billed and not yet settled, net of part payments.", sourceTable: "invoices", poweredPage: { href: "/billing", label: "Billing" }, scope: "practice" },
  { key: "overdue", label: "Overdue", category: "Practice", kind: "stat", description: "Past its due date and still unpaid.", sourceTable: "invoices", poweredPage: { href: "/billing", label: "Billing" }, scope: "practice" },
  { key: "sessions_week", label: "Sessions this week", category: "Practice", kind: "stat", description: "Sessions so far this week, against the same point last week.", sourceTable: "appointments", poweredPage: { href: "/calendar", label: "Calendar" }, scope: "practice" },
  { key: "sessions_trend", label: "Sessions, last 8 weeks", category: "Practice", kind: "area", description: "Weekly session volume — the shape of the practice's workload.", sourceTable: "appointments", poweredPage: { href: "/calendar", label: "Calendar" }, scope: "practice" },
  { key: "rx_routing", label: "Awaiting pharmacy", category: "Practice", kind: "stat", description: "Prescriptions still routing to a pharmacy.", sourceTable: "photon (api)", poweredPage: { href: "/orders", label: "Orders" }, scope: "practice" },

  // ── Finance — what Stripe Connect actually paid out ───────────────────────
  { key: "revenue_month", label: "Revenue this month", category: "Finance", kind: "stat", description: "Net marketplace revenue so far this month, against the same point last month.", sourceTable: "stripe_payment_splits", poweredPage: { href: "/earnings", label: "Earnings" }, scope: "practice" },
  { key: "revenue_trend", label: "Revenue, last 8 weeks", category: "Finance", kind: "area", description: "Weekly net revenue — the shape of the practice's income.", sourceTable: "stripe_payment_splits", poweredPage: { href: "/earnings", label: "Earnings" }, scope: "practice" },
  { key: "avg_session_value", label: "Avg. session value", category: "Finance", kind: "stat", description: "Net proceeds per session, after the platform fee.", sourceTable: "stripe_payment_splits", poweredPage: { href: "/earnings", label: "Earnings" }, scope: "practice" },
  { key: "finance_offer", label: "Leuk Capital & card", category: "Finance", kind: "offer", description: "A financing and business-card teaser sized off trailing Stripe Connect revenue. Preview only — nothing here is a live offer.", sourceTable: "stripe_payment_splits", poweredPage: { href: "/settings/payments", label: "Finance" }, scope: "practice" },

  // ── Directory — who exists ─────────────────────────────────────────────────
  { key: "dir_rows", label: "Directory rows", category: "Directory", kind: "stat", description: "One row per (source, source_id) — more than one per clinician by design.", sourceTable: "directory_providers", poweredPage: DIRECTORY, scope: "platform" },
  { key: "dir_npis", label: "Distinct providers", category: "Directory", kind: "stat", description: "Distinct NPIs in the NY behavioral-health book — the real headcount.", sourceTable: "directory_providers", poweredPage: DIRECTORY, scope: "platform" },
  { key: "dir_programs", label: "Programs", category: "Directory", kind: "stat", description: "State-licensed treatment programs — the clinics, not the clinicians.", sourceTable: "directory_programs", poweredPage: { href: "/programs", label: "Programs" }, scope: "platform" },
  { key: "dir_quals", label: "Qualifications", category: "Directory", kind: "stat", description: "Per-NPI licences and taxonomies behind the profession filter.", sourceTable: "provider_qualifications", poweredPage: DIRECTORY, scope: "platform" },
  { key: "nppes_rows", label: "NPPES registry", category: "Directory", kind: "stat", description: "The raw national NPI registry we distil the NY book out of.", sourceTable: "nppes_npi", poweredPage: DIRECTORY, scope: "platform" },
  { key: "providers_by_county", label: "Providers by county", category: "Directory", kind: "ranking", description: "Where the book is thick and where it is thin.", sourceTable: "directory_providers", poweredPage: DIRECTORY, scope: "platform" },
  { key: "providers_by_profession", label: "Providers by profession", category: "Directory", kind: "ranking", description: "What the book is made of — social workers, counsellors, psychologists, psychiatrists.", sourceTable: "directory_providers", poweredPage: DIRECTORY, scope: "platform" },

  // ── Insurance graph — who is in which network ─────────────────────────────
  { key: "payer_sources_live", label: "Payer directories live", category: "Insurance graph", kind: "stat", description: "Insurers whose directory we actually pull, against those configured.", sourceTable: "payer_sources", scope: "platform" },
  { key: "payer_networks", label: "Networks", category: "Insurance graph", kind: "stat", description: "Every named network or product the payers publish.", sourceTable: "payer_networks", scope: "platform" },
  { key: "networks_by_payer", label: "Networks by payer", category: "Insurance graph", kind: "ranking", description: "How many network labels each insurer publishes.", sourceTable: "payer_networks", scope: "platform" },
  { key: "participation_rows", label: "Network memberships", category: "Insurance graph", kind: "stat", description: "The payer's own claim that a provider is in a network — the badge's evidence.", sourceTable: "provider_network_participation", poweredPage: DIRECTORY, scope: "platform" },
  { key: "participation_npis", label: "Providers in a network", category: "Insurance graph", kind: "stat", description: "Distinct NPIs any payer attests to, anywhere.", sourceTable: "provider_participation_summary", poweredPage: DIRECTORY, scope: "platform" },
  { key: "accepting_share", label: "Accepting new patients", category: "Insurance graph", kind: "stat", description: "Share of listed providers a payer says are open to new patients.", sourceTable: "provider_participation_summary", poweredPage: DIRECTORY, scope: "platform" },
  { key: "unmatched_npis", label: "Unmatched NPIs", category: "Insurance graph", kind: "stat", description: "Providers a payer names that our book has never heard of — the discovery pool.", sourceTable: "payer_unmatched_npis", scope: "platform" },
  { key: "fhir_locations", label: "FHIR locations", category: "Insurance graph", kind: "stat", description: "Practice sites payers publish — the addresses behind a listing.", sourceTable: "fhir_locations", scope: "platform" },
  { key: "fhir_organizations", label: "FHIR organizations", category: "Insurance graph", kind: "stat", description: "The org entities a payer names, as the payer models them.", sourceTable: "fhir_organizations", scope: "platform" },
  { key: "fhir_org_affiliations", label: "FHIR affiliations", category: "Insurance graph", kind: "stat", description: "How a payer wires its orgs to its networks.", sourceTable: "fhir_org_affiliations", scope: "platform" },
  { key: "fhir_services", label: "FHIR services", category: "Insurance graph", kind: "stat", description: "What a payer says is offered where — their taxonomy, not ours.", sourceTable: "fhir_healthcare_services", scope: "platform" },
  { key: "fhir_plans", label: "Insurance plans (FHIR)", category: "Insurance graph", kind: "stat", description: "The plan objects payers publish alongside their networks.", sourceTable: "fhir_insurance_plans", poweredPage: PLANS, scope: "platform" },

  // ── Rates — what payers actually pay ──────────────────────────────────────
  { key: "rate_rows", label: "Rate signals", category: "Rates", kind: "stat", description: "One row = one payer's published price for one code, at one TIN, on one date.", sourceTable: "provider_rate_signals", poweredPage: RATES, scope: "platform" },
  { key: "rate_npis", label: "Providers with rates", category: "Rates", kind: "stat", description: "Distinct NPIs we hold a negotiated rate for.", sourceTable: "provider_rate_summary", poweredPage: { href: "/recruiting", label: "Recruiting" }, scope: "platform" },
  { key: "rate_tins", label: "Billing TINs", category: "Rates", kind: "stat", description: "Distinct tax IDs the rates are attached to — the org grain.", sourceTable: "org_tin_rosters", poweredPage: ORGS, scope: "platform" },
  { key: "rate_payers", label: "Payer labels", category: "Rates", kind: "stat", description: "Distinct payer labels in the rate corpus.", sourceTable: "payer_rate_totals", poweredPage: RATES, scope: "platform" },
  { key: "rows_by_payer", label: "Rate rows by payer", category: "Rates", kind: "ranking", description: "Which insurers we actually have prices from.", sourceTable: "payer_rate_totals", poweredPage: RATES, scope: "platform" },
  { key: "npis_by_code", label: "Rate points by code", category: "Rates", kind: "ranking", description: "Distinct published prices per code — deduped on (npi, tin, payer, code, rate), so a clinician billing under two TINs counts once each.", sourceTable: "org_tin_rate_summary", poweredPage: PUBLISHED, scope: "platform" },
  { key: "rows_by_network", label: "Rates by network label", category: "Rates", kind: "ranking", description: "MRF rates key on the payer's own plan/network LABEL, which does not join the FHIR network vocabulary (NYS-48/49). Published-table payers only — the full 389-label ranking needs a matview (NYS-69).", sourceTable: "rate_table_child_mv", poweredPage: PUBLISHED, scope: "platform" },
  { key: "rate_table_rows", label: "Published rate rows", category: "Rates", kind: "stat", description: "The precomputed table the public rate page renders.", sourceTable: "rate_table_mv", poweredPage: PUBLISHED, scope: "platform" },
  { key: "rate_table_named", label: "Rate rows named", category: "Rates", kind: "stat", description: "Share of published rows with a real business name, not a bare TIN.", sourceTable: "rate_table_mv", poweredPage: PUBLISHED, scope: "platform" },
  { key: "rate_spread_90834", label: "Rate spread — 90834", category: "Rates", kind: "distribution", description: "What a 45-minute session actually pays across the market.", sourceTable: "rate_table_mv", poweredPage: PUBLISHED, scope: "platform" },
  { key: "tin_registry", label: "Named TINs", category: "Rates", kind: "stat", description: "Turns a bare tax ID into a business name.", sourceTable: "tin_registry", poweredPage: ORGS, scope: "platform" },
  { key: "org_rosters", label: "Org roster rows", category: "Rates", kind: "stat", description: "Who bills under each organization.", sourceTable: "org_tin_rosters", poweredPage: ORGS, scope: "platform" },
  { key: "employers", label: "Employers", category: "Rates", kind: "stat", description: "Plan sponsors from the Aetna ToC — the demand side.", sourceTable: "employers", poweredPage: PLANS, scope: "platform" },
  { key: "plans_catalog", label: "Plans", category: "Rates", kind: "stat", description: "The plan catalog — employer to network product to rate file.", sourceTable: "plans", poweredPage: PLANS, scope: "platform" },

  // ── Codes & benchmarks — the denominator ──────────────────────────────────
  { key: "cpt_codes", label: "CPT names", category: "Codes & benchmarks", kind: "stat", description: "Our own plain-language names for the codes we price. AMA text is licensed; this isn't it.", sourceTable: "cpt_codes", scope: "platform" },
  { key: "hcpcs_codes", label: "HCPCS codes", category: "Codes & benchmarks", kind: "stat", description: "The public code set — where NY Medicaid behavioral health lives. Vocabulary only, no rates.", sourceTable: "hcpcs_codes", scope: "platform" },
  { key: "cms_rvu", label: "RVU rows", category: "Codes & benchmarks", kind: "stat", description: "How much work each code represents, per CMS.", sourceTable: "cms_rvu", scope: "platform" },
  { key: "cms_gpci", label: "GPCI localities", category: "Codes & benchmarks", kind: "stat", description: "The geography multiplier — why Manhattan and Buffalo differ.", sourceTable: "cms_gpci", scope: "platform" },
  { key: "medicare_manhattan", label: "Medicare — Manhattan", category: "Codes & benchmarks", kind: "table", description: "What Medicare allows in Manhattan for each of the five codes. The denominator.", sourceTable: "medicare_benchmark_ny", poweredPage: RATES, scope: "platform" },
  { key: "pct_medicare_by_payer", label: "% of Medicare by payer", category: "Codes & benchmarks", kind: "ranking", description: "Median negotiated rate against Manhattan Medicare. Single-rate cells only, so payers that publish rate ranges (Cigna, Empire) read low — shape, not ground truth (NYS-70).", sourceTable: "rate_table_mv", poweredPage: RATES, scope: "platform" },

  // ── Photon — e-prescribing ────────────────────────────────────────────────
  { key: "photon_synced", label: "Patients synced", category: "Photon", kind: "stat", description: "Clients that exist in Photon and can be prescribed for.", sourceTable: "clients.photon_patient_id", poweredPage: { href: "/prescriptions", label: "Prescriptions" }, scope: "practice" },
  { key: "photon_rx", label: "Prescriptions", category: "Photon", kind: "stat", description: "Every prescription written in the org.", sourceTable: "photon (api)", poweredPage: { href: "/prescriptions", label: "Prescriptions" }, scope: "practice" },
  { key: "photon_orders", label: "Pharmacy orders", category: "Photon", kind: "stat", description: "Every order sent to a pharmacy.", sourceTable: "photon (api)", poweredPage: { href: "/orders", label: "Orders" }, scope: "practice" },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m]));

// ── what the repo hands the board ────────────────────────────────────────────
// One shape per MetricKind, plus "missing" — a metric whose table hasn't been
// loaded yet renders a quiet card, never an error (to_regclass, server side).

export interface AgendaEntry {
  id: string;
  title: string;
  timeLabel: string;
  status: string;
  telehealth?: boolean;
}

export type MetricValue =
  | { kind: "stat"; value: string; sub?: string; tone?: "default" | "success" | "warning" | "danger" }
  | { kind: "ranking"; rows: Array<{ name: string; pct: number; value: string }> }
  | { kind: "distribution"; bins: Array<{ h: number; hot?: boolean }>; xL: string; xR: string }
  | { kind: "series" | "area"; points: number[]; labels?: string[]; capL: string; capR: string }
  | { kind: "table"; cols: string[]; rows: string[][] }
  | { kind: "agenda"; items: AgendaEntry[] }
  | {
      kind: "offer";
      badge: string;
      headline: string;
      amount: string;
      sub: string;
      bullets: string[];
      cta: string;
    }
  | { kind: "missing"; note: string };

/** key → value, for every metric the viewer's role allows. */
export type MetricValues = Record<string, MetricValue>;

export interface BoardView {
  name: string;
  ids: string[];
  /** Built-ins are seeded from here; user views are saved to localStorage. */
  builtIn?: boolean;
}

// Built-in boards. Each is shaped to sit well under the shelf-pack default: a
// band of stats first (they pack 3-up), then the wider chart cards.
export const BUILT_IN_VIEWS: BoardView[] = [
  {
    name: "Overview",
    builtIn: true,
    ids: ["today_appts", "active_clients", "unread_threads", "revenue_month", "dir_npis", "rate_rows", "next_up", "revenue_trend", "rows_by_payer", "providers_by_county"],
  },
  {
    name: "Practice day",
    builtIn: true,
    ids: ["today_appts", "active_clients", "unread_threads", "outstanding", "overdue", "sessions_week", "rx_routing", "next_up", "sessions_trend"],
  },
  {
    name: "Revenue",
    builtIn: true,
    ids: ["revenue_month", "avg_session_value", "outstanding", "overdue", "revenue_trend", "finance_offer"],
  },
  {
    name: "Data platform",
    builtIn: true,
    ids: ["dir_npis", "dir_rows", "payer_networks", "participation_rows", "rate_rows", "rate_tins", "fhir_plans", "plans_catalog", "rows_by_payer", "rows_by_network", "providers_by_county", "networks_by_payer"],
  },
  {
    name: "Insurance graph",
    builtIn: true,
    ids: ["payer_sources_live", "payer_networks", "participation_rows", "participation_npis", "accepting_share", "unmatched_npis", "fhir_locations", "fhir_plans", "networks_by_payer", "providers_by_county"],
  },
  {
    name: "Rates deep-dive",
    builtIn: true,
    ids: ["rate_rows", "rate_npis", "rate_tins", "rate_payers", "rate_table_rows", "rate_table_named", "rows_by_payer", "npis_by_code", "rows_by_network", "rate_spread_90834"],
  },
  {
    name: "Codes & benchmarks",
    builtIn: true,
    ids: ["cpt_codes", "hcpcs_codes", "cms_rvu", "cms_gpci", "medicare_manhattan", "pct_medicare_by_payer", "npis_by_code", "rate_spread_90834"],
  },
];

/** What a practitioner may see. Admin sees everything. */
export function metricsForRole(isAdmin: boolean): MetricDef[] {
  return isAdmin ? METRICS : METRICS.filter((m) => m.scope === "practice");
}

/** A view, filtered to what this role may actually render (drops platform ids for a practitioner). */
export function viewsForRole(views: BoardView[], isAdmin: boolean): BoardView[] {
  if (isAdmin) return views;
  const allowed = new Set(metricsForRole(false).map((m) => m.key));
  return views
    .map((v) => ({ ...v, ids: v.ids.filter((id) => allowed.has(id)) }))
    .filter((v) => v.ids.length > 0);
}
