# TASK — /analytics: the composable KPI board (hq system, Leuk skin)

The /dashboard build is NOT what was asked for. It stays as-is (Brendan will
reference it — do not delete or rework it), and its DATA LAYER
(lib/repos/dashboard.ts: counts, reltuples estimates, caching, role logic, AI
briefing) is good and gets REUSED. What was wrong: it's a static page. The
reference — hq's analytics — is a SYSTEM, and this task transplants the
system to a new route, /analytics, in Leuk's design language (LIGHT.
Leuk tokens and primitives. Forget hq's dark palette entirely.)

READ THE HQ CODE FIRST — this brief is a map, the code is the spec:
- `~/Code/hq/app/ui/kpi-panel.tsx` — the metric library panel: search field,
  VIEWS list up top (name + "N CARDS"), then metrics grouped BY CATEGORY,
  each row = shape glyph + name + kind label (STAT/SERIES/AREA/RANKING/
  DISTRIBUTION) + state (ON BOARD / + ADD); drag onto the board
  (dataTransfer) or click to add.
- `~/Code/hq/app/ui/kpi-state.tsx` — MetricDef registry pattern,
  RECOMMENDED_VIEWS, saved views, applyView.
- `~/Code/hq/app/ui/fleet-view.tsx` / `fleet-grid.tsx` /
  `draggable-card.tsx` — the board: grid of cards, drag to reorder,
  drag-in to add, per-card resize, remove.
- `~/Code/hq/lib/fleet.ts` — MetricDef / MetricKind types.

## What Leuk's version is

### 1. Metric registry — `lib/analytics/metrics.ts`
MetricDef: key, label, category, kind (stat | series | area | ranking |
distribution | table), description (one plain-English line), sourceTable,
poweredPage (route it powers), scope (practice | platform), and a fetch key
into the repo layer. TARGET ~40–50 METRICS. Categories (the picker groups by
these):
- **PRACTICE** (visible to practitioners; own-caseload scoping): today's
  appointments, next up (agenda), active clients, unread threads, outstanding/
  overdue invoices, sessions this week (+delta), awaiting pharmacy,
  prescriptions active.
- **DIRECTORY**: providers (rows + distinct NPIs), programs, qualifications,
  nppes_npi, providers-by-county (ranking), providers-by-network (ranking).
- **INSURANCE GRAPH**: payer_sources live/total, payer_networks (+ across N
  payers), networks-by-payer (ranking), provider_network_participation,
  accepting-new-patients share, payer_unmatched_npis, fhir_locations/
  organizations/org_affiliations/healthcare_services/insurance_plans.
- **RATES**: provider_rate_signals rows, distinct TINs / NPIs / payers,
  rows-by-payer (ranking), rows-by-code (ranking), rate_table_mv rows + %
  named, negotiated-rate spread per core code (distribution), rates-by-
  network label (ranking over plan_or_network — NOTE for the card copy: MRF
  rates key on the payer's plan_or_network LABEL; the FHIR network vocabulary
  does not join it yet — that crosswalk is NYS-48/49).
- **CODES & BENCHMARKS**: cpt_codes, hcpcs_codes, cms_rvu, cms_gpci,
  medicare_benchmark_ny (Manhattan $ for the 5 codes as stats), median
  %-of-Medicare by payer (ranking — the sql/027 filter trio applies).
- **PHOTON**: synced patients, prescriptions, orders, orders awaiting
  pharmacy.
Feature-detect tables with to_regclass; a metric whose table is missing shows
a quiet "not built yet" card, never an error. Big tables: reltuples
estimates, marked ≈ (the /dashboard repo already does this — reuse).

### 2. The board — `app/(app)/analytics/`
Client board over server-fetched data. Grid of metric cards: drag to reorder,
drag-in from the picker to add, remove (kebab), per-card size step (1-col
stat / 2-col chart / full-width table — mirror hq's resize affordance).
Layout persists in localStorage (same spirit as DataTable's storageKey).
Charts hand-rolled inline SVG per kind, like hq's (series line, area fill,
ranked horizontal bars with right-aligned values, distribution columns).
CARD DESIGN QUALITY BAR: the /library cards (app/(app)/library) — designed,
hover states, kebab, tidy meta row — not bare rounded boxes. Stat cards keep
the hq anatomy translated light: small caps label, big number, unit/delta
subline.

### 3. Views
Built-in views in the registry, each a named card set with its count shown in
the picker, hq-style: **Overview** (practice + headline platform), **Practice
day** (practice only), **Data platform** (the full observatory),
**Insurance graph**, **Rates deep-dive**, **Codes & benchmarks**. Plus user
views: "Save current board as view" (localStorage). Applying a view replaces
the board.

### 4. The picker + dictionary live in the NEW SidePanel
Use the just-reskinned `SidePanel` (components/ui/side-panel.tsx — flyover,
kicker prop) for BOTH:
- **KPI library panel** (kicker "KPI LIBRARY"): search-50-metrics field,
  VIEWS section, categorized metric rows with shape glyph + kind + ON BOARD/
  +ADD — image-faithful to hq's kpi-panel, Leuk-styled.
- **Data dictionary panel** (kicker "DATA DICTIONARY"): clicking a card's
  source-table chip (or an "About" row in its kebab) opens the table's entry:
  plain-English description + joins (reuse lib/repos/admin.ts registry prose),
  row count, which pages it powers, and A SMALL TABLE VIEW where the metric
  is list-shaped (top-10 rows: e.g. top networks by providers, top payers by
  rate rows) — DataTable primitive, compact.

### 5. Reuse, don't reinvent (hard rule)
- Agenda/"next up" = the agenda list already in the calendar 1-col panel
  (app/(app)/calendar/…) — extract/reuse that component, do not hand-roll.
- Cards/chips/tabs/kebabs/EmptyState/DataTable — all from the kit; /library
  and /design-system are the quality bar. Anything genuinely new (the board
  grid, chart SVGs) gets built ONCE as clean components under
  components/analytics/.
- Data functions extend lib/repos/dashboard.ts (or lib/repos/analytics.ts
  wrapping it) — do not duplicate count queries that already exist.

## Route/shell/roles
ROUTE_TITLES "Analytics" + sidebar entry (keep Dashboard's entry; Analytics
sits beside it for now). requireUser; practitioners get PRACTICE category
only (registry scope), admin gets everything. AI briefing card from
/dashboard may be added to the registry as a metric (kind table/stat) —
cheap, optional.

## Done when
1. /analytics renders the **Overview** view by default: practice stats +
   platform headlines, real numbers.
2. The KPI library panel opens in the new SidePanel: search works, views
   apply with correct card counts, metrics show ON BOARD/+ADD truthfully,
   drag-in AND click-to-add both work; board reorder + resize + remove work;
   layout survives reload (localStorage).
3. Clicking a card's source table opens the dictionary panel with prose +
   count + powered-pages, and a top-10 DataTable where list-shaped.
4. Brendan's questions are one glance each: how many networks (payer_networks
   card), how many plans (fhir_insurance_plans + /plans catalog card), how
   many providers, how many rates, rates-by-payer, rates-by-network-label —
   all on the Data platform view.
5. Verified as brendan (all views) and shelley (practice only) on :3010;
   `npx tsc --noEmit` clean; no page-level horizontal scroll anywhere.

## Working agreements
Stage ONLY your own files/hunks (`git add -p` on shared files — topbar/
sidebar are contested). Commit locally; do NOT push. Never log PHI. Report to
`docs/reports/2026-07-16-analytics.md`, 60-line cap, sections: Shipped / DB
changes / Decisions / Open items / Gotchas.
Linear (NYS team): file a ticket at start, close on done; every Open item
gets its own open ticket. If you lack Linear access, say so in the report.
