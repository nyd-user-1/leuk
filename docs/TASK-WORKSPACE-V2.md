# TASK-WORKSPACE-V2 — /workspace founder redesign (ironclad, single tranche)

Executor: **ui-agent** (founder-run Opus terminal). Speed and efficiency; no
exploration beyond what this brief names. Every task has literal acceptance
criteria. The founder reviews on localhost:3010 — commit locally, NEVER push.

## Ground truth (read nothing else first)

- The page: `app/(app)/workspace/` (renamed from /insights tonight; commit
  ee102dc). Key files: `page.tsx`, `insights-header.tsx`, `section.tsx`
  (EcoSection: eyebrow/title/blurb), `practice-strip.tsx` (top card row),
  `observatory.tsx`, `coverage-growth.tsx`, `fleet.tsx` + `agent-card.tsx`
  (JUST refactored by another live session — build on the current tree,
  never revert anything you find), `copy-card.tsx`.
- Shell: H1 lives in the TopBar (`components/shell/topbar.tsx`,
  ROUTE_TITLES → "Workspace"); pages inject right-side controls via
  `TopBarActions` (`components/shell/topbar-slot.tsx`); the bell is
  `components/shell/topbar-bell.tsx`; notifications repo
  `lib/repos/notifications.ts`; table registry `lib/table-atlas.mjs`.
- House rules: design-system primitives ONLY (`components/ui/*`, browse
  /design-system) — no new primitives without declaring it in the report.
  One H1 per page (TopBar owns it) — the page gets an H2. Do NOT load the
  impeccable skill. Copy rules (binding): no hedging paragraphs; no
  pipeline vocabulary in labels (shortest honest noun); data displays move,
  gated on `prefers-reduced-motion`.
- Concurrent sessions share this tree. Stage ONLY files you edit, by path
  (`git add <path>`, never `-A`). NEVER stage: `components/rates/*`,
  `app/(site)/*`, `lib/repos/public-stats.ts`, `docs/UI-*.md`,
  `docs/QUEUE.md`. Local commit; no push. No Linear MCP — Linear intents go
  in your report.

## Tasks (all nine; acceptance criteria are literal)

### 1. Kill every eyebrow on /workspace
Remove the eyebrow element from `EcoSection` rendering (and any stray
eyebrow text on the page, e.g. "THE ENGINE", "THE WORKFORCE").
✓ Accept: zero uppercase eyebrow labels render anywhere on /workspace.

### 2. Page intro (orientation)
At the top of the page content (above the briefing area): an **H2** (not H1)
naming the page plainly + ONE static paragraph (2–3 sentences) telling the
user what's here: live counts of the main objects, an on-demand AI briefing,
the work queue, the agent fleet, nightly sync health. Static copy, no
hedging, no pipeline words.
✓ Accept: H2 + paragraph render; exactly one H1 in the DOM (TopBar's).

### 3. Briefing switch → TopBar
Remove the word "Briefing". Move the wand-sparkles icon + `Toggle` into the
TopBar RIGHT cluster, immediately LEFT of the notification bell, injected
from the workspace page via `TopBarActions` (client component; keep the
existing localStorage key + fetch logic from `insights-header.tsx`). The
briefing text/skeleton still renders in the page header area when enabled.
✓ Accept: no "Briefing" string renders; icon+toggle sit left of the bell;
toggling still generates/clears the briefing exactly as before.

### 4. Populate the bell (real work only)
Seed `notifications` (via the existing repo insert path, idempotent — check
for an existing row with the same title before inserting; never duplicate on
re-run) from REAL yesterday+today events, 8–10 rows, each with a real href:
reports that landed in `docs/reports/2026-07-18-*.md` + `2026-07-19-*.md`
(one row each, title from the file's H1), the /insights→/workspace rename
(ee102dc → /workspace), sql/052 person-merge applied (→ /workspace), the
rate-intelligence marketing family shipped (→ /pricing-data), Form 5500-SF
loaded (→ /plans), org_network_rates restored (→ /networks). NOTHING
invented; no PHI. Dropdown: show ~8 rows max height, `overflow-y-auto`
scroll for the rest.
✓ Accept: bell badge > 0; dropdown lists 6–10 real items; each href
navigates to a live route; re-running the seed adds zero duplicate rows.

### 5. Remove corner links from cards
Remove the trailing top-right `TextLink`s ("Calendar", "Orders", …) from the
/workspace cards (practice strip + any card carrying one).
✓ Accept: zero corner text-links on /workspace cards.

### 6. Kill the section explainers; one info circle
Remove every `EcoSection` blurb on /workspace (e.g. "The supply side,
compounding while the practice sleeps…"). After the **Coverage & growth**
header only, add a single info-circle icon whose hover tooltip carries that
section's old blurb text. Use the existing tooltip pattern from the kit —
no new primitive.
✓ Accept: zero explainer paragraphs under section headers; exactly one ⓘ
on the page, after "Coverage & growth", with the tooltip.

### 7. Top row → the four main objects
Replace the FIRST FOUR practice-strip cards (Today's appointments · Active
clients · Unread messages · Outstanding) with counts of the four main data
objects, labels per the copy rules:
**Providers** (active directory count) · **In-network rates** (estimate
render "13.6M+" — reuse the `pg_class.reltuples` pattern; exact count is
15s, never do it) · **Billing entities** (distinct TIN) · **Plan filings**
(main + SF form-5500 rows). Counts from existing repos/metrics
(`lib/insights-metrics.ts` / `lib/repos/admin.ts` inventory) — no new heavy
queries at request time. Numbers count up on entry (reduced-motion gated).
Each card is clickable → the kit's `Dialog`, containing a **tree of the
object's related fields**: root = object, children = its backing tables
(from `lib/table-atlas.mjs`), grandchildren = key columns/joins. Simple
indented tree (text + hairlines); one shared dialog component, four data
configs.
✓ Accept: four cards render live counts; each opens a dialog with a
≥2-level tree naming real tables/columns from the atlas; page data fetch
stays under ~1.5s.

### 8. "Next up" = the work queue + three pin slots
Sub-section two of the top section. LEFT (same slot as the current "Next
up" card): the Linear board list from the appendix below — create
`lib/linear-backlog.ts` exporting it as typed data (id, title, priority,
status, project) with an `asOf: "2026-07-18"` stamp rendered as a muted
sub-line ("Board snapshot · Jul 18, 2026"). Order: In Progress first, then
backlog by priority (Urgent→High→Medium→Low→None). The list AUTO-SCROLLS
(gentle continuous vertical marquee, pause on hover, off under
reduced-motion; reuse tonight's marketing auto-scroll approach if it fits,
else a small local one).
RIGHT of it: exactly THREE pin-slot cards, combined height matching the
list. Clicking a list item pins it (max 3, localStorage; a 4th click
replaces the oldest or is refused with a subtle shake — your pick, state it
in the report). Pinned card: issue id, title, priority badge. Empty slot:
quiet "Pin an item" placeholder.
✓ Accept: full appendix list renders and scrolls; pinning persists across
reload; the three cards' total height equals the list card's height at
1440.

### 9. Verify + report (terse)
Headless: POST `/api/auth/login` (brendan@leuk.demo / demo), carry the
cookie, load /workspace at 1440 and 390: **0 console errors, 0 page-level
horizontal overflow**, exactly one H1, all acceptance greps pass (no
"Briefing", no eyebrow strings, deleted blurbs absent). Commit locally
(own hunks). Report: `docs/reports/2026-07-19-ui-workspace.md` — numbers +
file paths only. STOP.

## Appendix — the board snapshot (render this data verbatim)

In Progress: NYS-37 Urgent "Find my plan — patient-facing cost at
employer-plan resolution" · NYS-147 Medium "DataTable pattern roadmap" ·
NYS-25 High "Empire 39-series heap OOM diagnostic" · NYS-26 High
"NY-license NPPES expansion (telehealth gap)" · NYS-32 High "KYR phase 2:
Recruiting · Roster Check · Apply Next" · NYS-36 High "Model the plan
entity" · NYS-91 None "/rates tools: reductive, not additive" · NYS-13
Medium "UHC MRF rates PoC".

Backlog (priority order): NYS-138 Urgent "44b: rotate the leaked Neon DB
password" · NYS-130 High "Cloud belt via GitHub Actions" · NYS-39 High
"Plans catalog surface" · NYS-148 High "The universal record shape" ·
NYS-146 High "Load Form 5500-SF" · NYS-123 High "Budget-aware fleet
pacing" · NYS-122 High "Self-summoning agents on cadence" · NYS-53 High
"Anthem Provider Directory API expansion" · NYS-65 High "Port heavy
scripts to the Neon WebSocket Pool" · NYS-41 High "Model organizations as
first-class (NPI-2)" · NYS-42 High "Table Standard: one canonical table
primitive" · NYS-43 High "Rate-directory row click 404s" · NYS-64 High
"scan-tic drops billing_code_modifier" · NYS-78 High "Export/Refresh
toolbar drift" · NYS-23 High "HIPAA: vendor BAAs" · NYS-11 High "PHI
security hardening pass" · NYS-18 High "Corroboration model + confidence
signal" · NYS-149 Medium "Runner scripts: propagate PIPESTATUS" · NYS-29
Medium "HealthSparq wall: Excellus/Univera/MVP/IH" · NYS-142 Medium
"Table-naming pass" · NYS-145 Medium "/orgs identity card wrap" · NYS-35
Medium "Employer Signals prospecting" · NYS-22 Medium "Real Stripe billing
+ superbill PDF" · NYS-94 Medium "/rates TypeError .split" · NYS-134
Medium "Public /search (marketing)" · NYS-133 Medium "Directory search
BitmapOr residual" · NYS-50 Medium "Expand the billing-code panel" ·
NYS-115 Medium "Shared data-dictionary metadata" · NYS-72 Medium
"payer_sources hygiene" · NYS-111 Medium "Aetna Provider Directory app" ·
NYS-112 Medium "Aetna two-entity overlap check" · NYS-108 Medium "Monthly
re-harvest cadence" · NYS-107 Medium "Per-payer manifest builders" ·
NYS-106 Medium "Provider-rights corpus (NY)" · NYS-105 Medium "Hospital
price-transparency MRF spike" · NYS-103 Medium "QHP/NYSOH/CMS-PUF
discovery spike" · NYS-33 Medium "Marketing nav stale provider count" ·
NYS-34 Medium "Person-level merge across sources" · NYS-45 Medium
"Structured first/last from NPPES" · NYS-61 Medium "ingest-payers pause
drops rows" · NYS-63 Medium "Consolidate provider identity onto
nppes_npi" · NYS-66 Medium "Name the 1,480 for-profit billing groups" ·
NYS-24 Medium "HIPAA: administrative safeguards" · NYS-20 Medium "Near-me
search multi-office" · NYS-19 Medium "NYS Medicaid enrolled-provider
ingest" · NYS-17 Medium "Verify UHC empty-shell psychiatrists" · NYS-12
Medium "Program directory pages design pass" · NYS-141 Low "Scale Horizon
2" · NYS-139 Low "44b sync-health surface" · NYS-140 Low "Agent roster
expansion (parked)" · NYS-30 Low "Oscar TiC files" · NYS-62 Low "React
hydration mismatch #418" · NYS-79 Low "Object-table extraction tidy-up" ·
NYS-81 Low "Rx/Orders constant Patient column" · NYS-82 Low "Promote
FieldDisplay" · NYS-83 Low "client-billing.tsx unused" · NYS-59 Low
"Enrich full Organization+Practitioner resources" · NYS-60 Low
"Incremental Anthem via _lastUpdated" · NYS-21 Low "Load NPPES reference
files" · plus No-priority: NYS-127 "/directory onto DataTable" · NYS-69
"Providers-per-network matview" · NYS-46 "Scheduled payer refresh" ·
NYS-99 "Spread check baseline UI" · NYS-68 "Rate rows by network label" ·
NYS-70 "% of Medicare single-rate bias" · NYS-71 "Data dictionary row
counts" · NYS-52 "TIN/payer aggregates slow" · NYS-47 "Raw FHIR storage
strategy" · NYS-92 "EVERGREEN extraction loop" · NYS-128 "Public /search
(deferred)" · NYS-50-dup-guard: skip if already listed · NYS-10 "Rename
fleet subsystem" · NYS-9/7/6 "teams hardening trio" · NYS-8 "teams
left-rail accent".
