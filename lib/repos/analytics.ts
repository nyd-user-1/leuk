import { hasDb, sql } from "@/lib/db";
import { formatCents } from "@/lib/format";
import { METRICS, type MetricValue, type MetricValues } from "@/lib/analytics/metrics";
import { photonInventory, practiceSnapshot } from "@/lib/repos/dashboard";
import { platformInventory, type DictionaryTable } from "@/lib/repos/admin";
import { revenueSnapshot, type RevenueSnapshot } from "@/lib/repos/stripe-connect";
import type { Role } from "@/lib/types";

// analytics.ts — the numbers behind /analytics.
//
// It does NOT re-count anything /dashboard already counts: practiceSnapshot()
// gives the caseload and platformInventory() gives every table count (with the
// pg_class estimates and the 5-minute memo). This file adds only what a board
// needs beyond a count — the rankings, the histogram, the benchmark table — and
// each of those reads a matview or a small table, never the 9.3M-row corpus.
//
// PERF, measured (see the report): every extra query below is ≤400ms server
// side. The ones deliberately NOT here, because they cost seconds:
//   · GROUP BY on provider_rate_signals directly (1.5-6.7s — no index on
//     plan_or_network / billing_code). Answered from rate_table_child_mv and
//     rate_bands_payer_summary instead, which are the same facts pre-rolled.
//   · providers-per-network (payer_networks × provider_network_participation,
//     ~15s). Left out until it has a matview — see NYS-68.

const num = (n: number) => n.toLocaleString("en-US");
const pct1 = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : "—");

/** A ranking's bars are relative to the biggest row, like hq's. */
function toRanking(rows: Array<{ name: string; n: number }>, fmt: (n: number) => string = num): MetricValue {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return { kind: "ranking", rows: rows.map((r) => ({ name: r.name, pct: (r.n / max) * 100, value: fmt(r.n) })) };
}

/**
 * The "Leuk Capital & card" teaser — a preview card, not a live offer. Sizes a
 * plausible financing pre-qualification off trailing Stripe Connect revenue the
 * same rough way Stripe Capital itself does (a multiple of recent volume),
 * rounded to a clean number so it reads as an estimate, not a computed fact.
 */
function financeOfferValue(rev: RevenueSnapshot): MetricValue {
  if (rev.trailingQuarterNetCents <= 0) {
    return {
      kind: "offer",
      badge: "Preview",
      headline: "Leuk Capital & the Leuk Card",
      amount: "—",
      sub: "Financing offers and a business card unlock once you have a few months of revenue on the books.",
      bullets: ["Advance against future bookings, repaid as a share of each payout", "A no-fee debit card funded by your Stripe balance"],
      cta: "Notify me",
    };
  }
  const raw = rev.trailingQuarterNetCents * 3;
  const amountCents = Math.min(7_500_000, Math.max(500_000, Math.round(raw / 50_000) * 50_000));
  return {
    kind: "offer",
    badge: "Preview — not a live offer",
    headline: "You may pre-qualify for Leuk Capital",
    amount: formatCents(amountCents),
    sub: `Estimated off your last 90 days of Stripe payouts (${formatCents(rev.trailingQuarterNetCents)} net). One repayment, taken as a share of each future payout — no fixed due date.`,
    bullets: [
      "Working capital, sized to what your practice actually brings in",
      "The Leuk Card — a business debit card funded straight from your Stripe balance",
    ],
    cta: "Notify me when this opens",
  };
}

// ── the extra queries (everything a count can't answer) ──────────────────────

const RANKINGS_SQL = `
  SELECT 'county' AS bucket, county AS name, count(DISTINCT npi)::int AS n
    FROM directory_providers WHERE county IS NOT NULL GROUP BY county
  UNION ALL
  SELECT 'profession', profession, count(DISTINCT npi)::int
    FROM directory_providers WHERE profession IS NOT NULL GROUP BY profession
  UNION ALL
  SELECT 'network_rates', network, count(*)::int
    FROM rate_table_child_mv WHERE network IS NOT NULL GROUP BY network
  UNION ALL
  SELECT 'payer_rows', payer, rows::int FROM payer_rate_totals
  UNION ALL
  SELECT 'networks_by_payer', s.slug, count(*)::int
    FROM payer_networks n JOIN payer_sources s ON s.id = n.payer_source_id GROUP BY s.slug
  UNION ALL
  -- rate_points is deduped on (npi, tin, payer, code, rate); summing npis here
  -- would double-count a clinician who bills under two TINs. The raw row counts
  -- would be truer still, but that's a 15.9s scan of the corpus.
  SELECT 'code_points', billing_code, sum(rate_points)::int
    FROM org_tin_rate_summary WHERE billing_code IN ('90791','90834','90837','90853','99214')
    GROUP BY billing_code
`;

// 12 buckets of $20 from $40, plus an overflow bin — the shape of what a
// 45-minute session actually pays. rate_table_mv is one row per (payer, TIN),
// so this is the market's spread, not one payer's.
const SPREAD_SQL = `
  SELECT width_bucket(c90834, 40, 280, 12) AS b, count(*)::int AS n
  FROM rate_table_mv WHERE c90834 IS NOT NULL GROUP BY b ORDER BY b
`;

const ACCEPTING_SQL = `SELECT count(*) FILTER (WHERE any_accepting)::int AS acc, count(*)::int AS total FROM provider_participation_summary`;

// NY has five localities; Manhattan (locality_code 01) is the one to quote.
const MEDICARE_SQL = `
  SELECT code, display_name, medicare_allowed_nonfacility AS allowed
  FROM medicare_benchmark_ny
  WHERE locality_name = 'MANHATTAN' AND code IN ('90791','90834','90837','90853','99214')
  ORDER BY code
`;

// Median negotiated rate as a share of Medicare, per payer.
//
// It reads rate_table_mv rather than the corpus because that matview ALREADY
// bakes in sql/027's filter trio (billing_class = professional · negotiated_type
// not %-of-charge · rate > 5) plus the payer allowlist — so this honors the trio
// by construction, in ~330ms instead of a 7s scan.
//
// KNOWN BIAS, stated on the card: the matview only keeps a cell where the payer
// published exactly ONE distinct rate for it. Payers with poor single-rate
// resolution (Cigna, Empire) therefore read low here — the same query against
// the raw corpus puts Cigna at 80% and Empire at 92%, not 64%/67%. MetroPlus and
// EmblemHealth are stable across both. Treat this as the shape, not the truth;
// NYS-70 is the honest version.
const PCT_MEDICARE_SQL = `
  WITH mb AS (
    SELECT code, avg(medicare_allowed_nonfacility) AS allowed
    FROM medicare_benchmark_ny WHERE locality_name = 'MANHATTAN' GROUP BY code
  ), cells AS (
    SELECT payer, '90791' AS code, c90791 AS rate FROM rate_table_mv WHERE c90791 IS NOT NULL
    UNION ALL SELECT payer, '90834', c90834 FROM rate_table_mv WHERE c90834 IS NOT NULL
    UNION ALL SELECT payer, '90837', c90837 FROM rate_table_mv WHERE c90837 IS NOT NULL
    UNION ALL SELECT payer, '90853', c90853 FROM rate_table_mv WHERE c90853 IS NOT NULL
    UNION ALL SELECT payer, '99214', c99214 FROM rate_table_mv WHERE c99214 IS NOT NULL
  )
  SELECT c.payer AS name,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY c.rate / mb.allowed) * 100)::int AS n
  FROM cells c JOIN mb ON mb.code = c.code
  WHERE mb.allowed > 0
  GROUP BY c.payer
  ORDER BY n DESC
`;

type RankRow = { bucket: string; name: string; n: number };

/** What the dictionary panel shows for a table — straight off the admin registry. */
export interface DictionaryEntry {
  name: string;
  meaning: string;
  links: string;
  count: number | null;
  countKind: "exact" | "estimate";
  missing?: boolean;
  poweredPages: Array<{ href: string; label: string }>;
}

export interface AnalyticsPayload {
  values: MetricValues;
  dictionary: Record<string, DictionaryEntry>;
  generatedAt: string;
}

let memo: { at: number; key: string; data: AnalyticsPayload } | null = null;
const TTL = 5 * 60_000;

export async function analyticsData(user: { id: string; role: Role }): Promise<AnalyticsPayload> {
  const isAdmin = user.role === "admin";
  // Practice numbers are per-user; the memo key keeps one practitioner's
  // caseload from ever being served to another.
  const key = `${user.id}:${isAdmin}`;
  if (memo && memo.key === key && Date.now() - memo.at < TTL) return memo.data;

  const values: MetricValues = {};
  const dictionary: Record<string, DictionaryEntry> = {};

  const [snapshot, photon, revenue, inventory, extras] = await Promise.all([
    practiceSnapshot(user),
    photonInventory(),
    revenueSnapshot({ userId: isAdmin ? null : user.id }),
    isAdmin ? platformInventory() : Promise.resolve(null),
    isAdmin && hasDb ? loadExtras() : Promise.resolve(null),
  ]);

  // ── Practice ──────────────────────────────────────────────────────────────
  const s = snapshot;
  values.today_appts = { kind: "stat", value: num(s.todayTotal), sub: s.todayRemaining > 0 ? `${s.todayRemaining} still to come` : "nothing left today" };
  values.next_up = {
    kind: "agenda",
    items: s.nextUp.map((a) => ({ id: a.id, title: a.clientName, timeLabel: new Date(a.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), status: a.status })),
  };
  values.active_clients = { kind: "stat", value: num(s.activeClients), sub: s.scope === "all" ? "across the practice" : "on your caseload" };
  values.unread_threads = { kind: "stat", value: num(s.unreadThreads), sub: s.unreadThreads ? "waiting on a reply" : "inbox clear", tone: s.unreadThreads ? "warning" : "default" };
  values.outstanding = { kind: "stat", value: formatCents(s.outstandingCents), sub: "billed, not yet settled" };
  values.overdue = { kind: "stat", value: formatCents(s.overdueCents), sub: `${s.overdueCount} ${s.overdueCount === 1 ? "invoice" : "invoices"} past due`, tone: s.overdueCount ? "danger" : "default" };
  const delta = s.sessionsThisWeek - s.sessionsLastWeek;
  values.sessions_week = {
    kind: "stat",
    value: num(s.sessionsThisWeek),
    sub: s.sessionsLastWeek === 0 && s.sessionsThisWeek === 0 ? "no sessions either week" : `${delta >= 0 ? "+" : ""}${delta} vs last week (${s.sessionsLastWeek})`,
    tone: delta > 0 ? "success" : "default",
  };
  values.sessions_trend = s.weeklySessions.length
    ? { kind: "area", points: s.weeklySessions.map((w) => w.count), labels: s.weeklySessions.map((w) => w.label), capL: s.weeklySessions[0]?.label ?? "", capR: "this week" }
    : { kind: "missing", note: "No session history yet." };
  values.rx_routing = { kind: "stat", value: s.rxRouting === null ? "—" : num(s.rxRouting), sub: s.rxRouting === null ? "e-prescribing not connected" : "routing to a pharmacy" };
  values.photon_rx = photon ? { kind: "stat", value: num(photon.prescriptions), sub: "written in this org" } : { kind: "missing", note: "Photon is not connected." };
  values.photon_orders = photon ? { kind: "stat", value: num(photon.orders), sub: `${photon.routing} still routing` } : { kind: "missing", note: "Photon is not connected." };

  // ── Finance — Stripe Connect revenue ────────────────────────────────────────
  if (!revenue.hasAccount) {
    const note = "No payout account yet — set up Finance to start seeing revenue here.";
    values.revenue_month = { kind: "missing", note };
    values.revenue_trend = { kind: "missing", note };
    values.avg_session_value = { kind: "missing", note };
    values.finance_offer = { kind: "missing", note: "Financing and card offers unlock once a payout account is active." };
  } else {
    const revDelta = revenue.monthNetCents - revenue.prevMonthNetCents;
    values.revenue_month = {
      kind: "stat",
      value: formatCents(revenue.monthNetCents),
      sub:
        revenue.prevMonthNetCents === 0 && revenue.monthNetCents === 0
          ? "no revenue yet this month"
          : `${revDelta >= 0 ? "+" : ""}${formatCents(revDelta)} vs last month (${formatCents(revenue.prevMonthNetCents)})`,
      tone: revDelta > 0 ? "success" : "default",
    };
    values.revenue_trend = revenue.weeklyRevenue.some((w) => w.cents > 0)
      ? {
          kind: "area",
          points: revenue.weeklyRevenue.map((w) => w.cents),
          labels: revenue.weeklyRevenue.map((w) => w.label),
          capL: revenue.weeklyRevenue[0]?.label ?? "",
          capR: formatCents(revenue.weeklyRevenue[revenue.weeklyRevenue.length - 1]?.cents ?? 0),
        }
      : { kind: "missing", note: "No revenue history yet." };
    values.avg_session_value = {
      kind: "stat",
      value: formatCents(revenue.avgSessionNetCents),
      sub: `net, across ${num(revenue.sessionCount)} paid ${revenue.sessionCount === 1 ? "session" : "sessions"}`,
    };
    values.finance_offer = financeOfferValue(revenue);
  }

  if (!isAdmin || !inventory) {
    const data: AnalyticsPayload = { values, dictionary, generatedAt: new Date().toISOString() };
    memo = { at: Date.now(), key, data };
    return data;
  }

  // ── Platform: every count comes from the shared registry ──────────────────
  const byTable = new Map<string, DictionaryTable>();
  for (const g of inventory.groups) for (const t of g.tables) byTable.set(t.name, t);

  // The dictionary panel's entries, and the pages each table powers.
  for (const g of inventory.groups) {
    for (const t of g.tables) {
      const pages = METRICS.filter((m) => m.sourceTable === t.name && m.poweredPage).map((m) => m.poweredPage!);
      dictionary[t.name] = {
        name: t.name,
        meaning: t.meaning,
        links: t.links,
        count: t.count,
        countKind: t.countKind,
        missing: t.missing,
        poweredPages: [...new Map(pages.map((p) => [p.href, p])).values()],
      };
    }
  }

  const inv = inventory.specials;
  const count = (table: string): number | null => byTable.get(table)?.count ?? null;
  const stat = (table: string, sub: string): MetricValue => {
    const t = byTable.get(table);
    if (!t || t.missing) return { kind: "missing", note: `${table} hasn't been loaded yet.` };
    return { kind: "stat", value: num(t.count ?? 0), sub };
  };

  values.dir_rows = stat("directory_providers", "rows, not people");
  values.dir_npis = inv ? { kind: "stat", value: num(inv.directoryNpis), sub: "distinct NPIs in the NY book" } : { kind: "missing", note: "No count yet." };
  values.dir_programs = stat("directory_programs", "OMH-licensed programs");
  values.dir_quals = stat("provider_qualifications", "licences + taxonomies");
  values.nppes_rows = stat("nppes_npi", "national, all specialties");
  values.payer_networks = stat("payer_networks", inv ? `across ${inv.networkPayers} payers` : "network labels");
  values.participation_rows = stat("provider_network_participation", "npi × payer × network × site");
  values.participation_npis = stat("provider_participation_summary", "distinct NPIs in any network");
  values.unmatched_npis = stat("payer_unmatched_npis", "seen but not held");
  values.fhir_locations = stat("fhir_locations", "published practice sites");
  values.fhir_organizations = stat("fhir_organizations", "payer-modelled orgs");
  values.fhir_org_affiliations = stat("fhir_org_affiliations", "org ↔ network wiring");
  values.fhir_services = stat("fhir_healthcare_services", "services per location");
  values.fhir_plans = stat("fhir_insurance_plans", "plan/product objects");
  values.rate_rows = stat("provider_rate_signals", "one price, one code, one date");
  values.rate_npis = stat("provider_rate_summary", "distinct NPIs with a rate");
  values.rate_table_rows = stat("rate_table_mv", "one row per payer × TIN");
  values.tin_registry = stat("tin_registry", "TIN → business name");
  values.org_rosters = stat("org_tin_rosters", "who bills under each TIN");
  values.employers = stat("employers", "plan sponsors (Aetna ToC)");
  values.plans_catalog = stat("plans", "employer → network product");
  values.cpt_codes = stat("cpt_codes", "our own plain-language names");
  values.hcpcs_codes = stat("hcpcs_codes", "public descriptors, no rates");
  values.cms_rvu = stat("cms_rvu", "work/PE/MP per code");
  values.cms_gpci = stat("cms_gpci", "NY has five localities");

  values.payer_sources_live = inv
    ? { kind: "stat", value: `${inv.payersLive} of ${inv.payersConfigured}`, sub: "configured directories actually syncing" }
    : { kind: "missing", note: "No count yet." };
  values.rate_tins = inv ? { kind: "stat", value: num(inv.rateTins), sub: "distinct billing TINs" } : { kind: "missing", note: "No count yet." };
  values.rate_payers = inv ? { kind: "stat", value: num(inv.ratePayers), sub: "distinct payer labels" } : { kind: "missing", note: "No count yet." };
  values.rate_table_named = inv
    ? { kind: "stat", value: pct1(inv.rateTableNamed, inv.rateTableRows), sub: `${num(inv.rateTableNamed)} of ${num(inv.rateTableRows)} rows named` }
    : { kind: "missing", note: "No count yet." };
  values.photon_synced = inv
    ? { kind: "stat", value: `${inv.photonClients} of ${inv.clientsTotal}`, sub: "clients that exist in Photon" }
    : { kind: "missing", note: "No count yet." };

  if (extras) {
    const pick = (bucket: string, limit = 10) =>
      extras.ranks
        .filter((r) => r.bucket === bucket && r.name)
        .sort((a, b) => b.n - a.n)
        .slice(0, limit)
        .map((r) => ({ name: r.name, n: r.n }));

    values.providers_by_county = toRanking(pick("county"));
    values.providers_by_profession = toRanking(pick("profession"));
    values.rows_by_network = toRanking(pick("network_rates"));
    values.rows_by_payer = toRanking(pick("payer_rows"));
    values.networks_by_payer = toRanking(pick("networks_by_payer"));
    values.npis_by_code = toRanking(pick("code_points"));

    const maxBin = Math.max(1, ...extras.spread.map((b) => b.n));
    values.rate_spread_90834 = extras.spread.length
      ? { kind: "distribution", bins: extras.spread.map((b) => ({ h: (b.n / maxBin) * 100, hot: b.b >= 13 })), xL: "$40", xR: "$280+" }
      : { kind: "missing", note: "No 90834 rates yet." };

    values.accepting_share = extras.accepting
      ? { kind: "stat", value: pct1(extras.accepting.acc, extras.accepting.total), sub: `${num(extras.accepting.acc)} of ${num(extras.accepting.total)} listed providers`, tone: "success" }
      : { kind: "missing", note: "No participation data yet." };

    values.medicare_manhattan = extras.medicare.length
      ? { kind: "table", cols: ["Code", "What it is", "Medicare allows"], rows: extras.medicare.map((m) => [m.code, m.display_name ?? "—", `$${Number(m.allowed).toFixed(2)}`]) }
      : { kind: "missing", note: "medicare_benchmark_ny hasn't been loaded yet." };

    values.pct_medicare_by_payer = extras.pctMedicare.length
      ? toRanking(extras.pctMedicare.map((r) => ({ name: r.name, n: r.n })), (n) => `${n}%`)
      : { kind: "missing", note: "No benchmark comparison yet — needs cms + checked payers." };
  }

  // Anything the registry knows nothing about renders as a quiet card rather
  // than a hole (a metric can outlive its table).
  for (const m of METRICS) {
    if (!values[m.key]) values[m.key] = { kind: "missing", note: `${m.sourceTable} hasn't been loaded yet.` };
  }

  const data: AnalyticsPayload = { values, dictionary, generatedAt: new Date().toISOString() };
  memo = { at: Date.now(), key, data };
  return data;
}

/** The four extra flights, in parallel. Each is matview- or small-table-backed. */
async function loadExtras() {
  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      // A missing table (the CMS loader hasn't run) must not take the board
      // down — the metric renders "not built yet" instead.
      return fallback;
    }
  };
  const [ranks, spread, accepting, medicare, pctMedicare] = await Promise.all([
    safe(sql.query(RANKINGS_SQL, []) as unknown as Promise<RankRow[]>, []),
    safe(sql.query(SPREAD_SQL, []) as unknown as Promise<Array<{ b: number; n: number }>>, []),
    safe(sql.query(ACCEPTING_SQL, []) as unknown as Promise<Array<{ acc: number; total: number }>>, []),
    safe(sql.query(MEDICARE_SQL, []) as unknown as Promise<Array<{ code: string; display_name: string | null; allowed: number }>>, []),
    safe(sql.query(PCT_MEDICARE_SQL, []) as unknown as Promise<Array<{ name: string; n: number }>>, []),
  ]);
  return { ranks, spread, accepting: accepting[0] ?? null, medicare, pctMedicare };
}
