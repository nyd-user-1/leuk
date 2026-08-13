# TABLE STANDARD v2 — the self-describing operational table

**Agent:** ui · **Date:** 2026-07-20 · **Scope:** primitive-level evolution of the shared table pattern (`components/ui/*`), applied to the five /workspace Operations tables, propagation-checked on /rates + /directory, documented in the catalog.

This was a primitive change, not a set of per-table edits: the capability lives in
`DataTable`/`Table`, and each table opts in by passing data. Existing consumers that
don't opt in render exactly as before — verified on /rates and /directory.

**Before-state** is durable in git: the /workspace baseline (the deleted Sync-health
card, the 8-row region, the pre-v2 tables) lives at **740770d** and its parents — the
tree is shared with live agents, so this report points there rather than checking it out.
After-state screenshots are in `docs/reports/assets/2026-07-20-table-standard-v2/`.

## What shipped

### Primitive (`components/ui/data-table.tsx`, `components/ui/table.tsx`)
Additive, opt-in, backward-compatible props on the **stacked** variant:

- `title` / `status` / `titleMeta` — a **title block** pinned far-left of the header:
  a status dot + the table's name + a status pill, with an optional muted sub-line.
  The table names itself and states its own health; no separate status card floats
  above it.
- Search moves **RIGHT**, beside the utilities kebab (when `title` is set, the
  `toolbarLeft` search renders in the right group).
- `source` / `updatedAt` — an honest **footer**: the data source (matview/table/API)
  on the left, freshness (refresh time / query time / row count) on the right.
- `Table` now **measures its toolbar height** and pins the sticky column-header at
  exactly that offset (ResizeObserver), replacing the hardcoded `top-[57px]` that
  left a hairline gap/overlap the moment the toolbar wasn't one text-line tall. This
  is the general fix that makes stickyHeader correct for the taller v2 header — and
  it also tightens every existing stacked table (e.g. /rates, whose toolbar carries a
  40px search input). `Table` gained `"use client"` (it now uses hooks; every direct
  importer was already a client component, so no server-render breakage).
- **New shared utility — `lib/csv.ts`** (`toCsv` / `downloadCsv`): a 22-line pure,
  dependency-free client helper the `onExport` hook calls (the hook already existed on
  `DataTable`). Named here per the house rule that new shared code gets called out. It is
  NOT a UI primitive — no component, no render — so it doesn't touch the primitives-first
  law; it's the export serializer every v2 table shares.

**Why this counts as in-charter primitive work, not a new primitive:** no new component
was created. The title block, footer, and search-right are composed from existing
primitives (`DotBadge`, `Badge`, `SearchInput`, `KebabMenu`) inside `DataTable`, driven
by new props. This is the deliberate evolution the tranche asked for.

### The five /workspace Operations tables
The standalone **Sync-health card was deleted** (`sync-health.tsx` removed; its
`SyncHealthCard` usage dropped from `page.tsx`). Its content — dot + "Nightly sync" +
Healthy pill + "Jul 20, 2026 · 1:23 AM · cron · 428s · 15 steps" — now lives verbatim
in the **Harvest runs** title block (the default/first Operations table), so the nightly
health is the first thing an admin sees, without a bar above the panel. `RunsPanel` now
takes the full `health` object to derive it.

Every table now carries: a title block + status pill, sortable **type-aware** headers on
**every** column, a search on the right, a per-row action kebab, CSV export folded into
the table-options kebab, and a source + freshness footer. The shared region grew from 8
to **10 visible rows** (`REGION_H` 356px → 544px; the Work-queue tab now fills the same
region instead of its own 480px box, so all five tabs are the same height).

| Table | Title · status | Row actions | Source · freshness footer |
|---|---|---|---|
| Harvest runs | Nightly health (Healthy/Failed/Stopped) + run meta | copy run ID / job / row | `sync_runs · harvest:* jobs` · newest run |
| History logs | run count (+ N failed) | copy run ID / job / row | `sync_runs ledger · newest 30` · newest run |
| Agent reports | `N recent` | open report · copy file name | `docs/reports/*.md` · newest report |
| Work queue | `N in progress` | pin (kept) + copy id / open in Linear | `Linear NYS board · snapshot` · snapshot date |
| Anthem-June | `476,114 rows` | copy NPI / copy row | `provider_rate_signals · June Empire 39F0` · N of total loaded |

Sortable comparators were added where columns lacked them (run Description/Status/Trigger/
Steps by weight; report File; every Anthem-June column). The Work-queue auto-scroll now
also pauses while a search query is active (not just on hover / reduced-motion).

### Catalog / `/design-system`
- New live **"Table · v2 (operational)"** Spec in the table section — a static render of
  the exact standard (title block, search+kebab right, per-row kebabs, source/freshness
  footer).
- Start-here rules updated: the stacked-layout bullet now names the operational variant,
  and a new **TABLE STANDARD v2** bullet writes the standing rule — the lightning stack
  (server pagination, lazy loading, debounced indexed search, snapshot/matview backing
  over ~10k rows, parallel page+count, `min-w-0` overflow) is the default and the
  definition of done; a table missing it is a defect.

## Screenshots (after-state, `docs/reports/assets/2026-07-20-table-standard-v2/`)
Each Operations shot is element-scoped to the table card, so the title block (top) and the
source+freshness footer (bottom) are both in frame.

- `01-harvest-runs.png` — the deleted Sync-health card's content, now the title block:
  green dot + "Harvest runs" + Healthy pill + "Jul 20, 2026 · 1:23 AM · cron · 428s · 15
  steps"; search + kebab right; sortable headers; footer `sync_runs · harvest:* jobs` ·
  newest run time.
- `02-history-logs.png` — ledger with run-count status pill, footer `sync_runs ledger · newest 30`.
- `03-agent-reports.png` — `N recent` pill, open-report/copy row kebab, footer `docs/reports/*.md`.
- `04-work-queue.png` — `N in progress` pill, pin + copy/open-in-Linear row actions, footer `Linear NYS board · snapshot`.
- `05-anthem-june.png` — loaded state: `476,114 rows` pill, every column sortable, footer `provider_rate_signals · June Empire 39F0` · `200 of 476,114 loaded`.
- `06-design-system-v2.png` — the live "Table · v2 (operational)" catalog spec.
- `07-propagation-rates.png` — /rates scrolled: sticky header sits correctly below the toolbar (no v2 props forced on it).
- `08-propagation-directory.png` — /directory index layout intact (select column, sortable headers, Filter·Columns·Export·Refresh).

## Verification (headless, real login `brendan@leuk.demo`)
- Rendered /workspace and clicked through all five Operations tabs — screenshots in the
  session scratchpad (`ws-harvest`, `ws-history`, `ws-reports`, `ws-queue`, `ws-anthem`,
  `final-harvest`, `final-ds-v2`).
- **No page-level horizontal scroll** on /workspace, /rates, or /directory
  (`scrollWidth == clientWidth`, checked in-page). Flex-ancestor chain clean.
- **Propagation:** /rates (stacked, no v2 props) renders and its sticky header sits
  correctly below the toolbar after scrolling — the toolbar-measurement change is strictly
  more correct than the old constant. /directory (index layout) unaffected — select
  column, sortable headers, and the Filter·Columns·Export·Refresh cluster all intact.
- My workspace tables emit **zero** React key warnings.
- `tsc --noEmit`: **0 errors**.
- Leuk is a light-only surface (no `prefers-color-scheme` response; fixed
  navy/teal/amber tokens), so the dark-theme pass renders identically — "both themes"
  doesn't apply here.

## Anthem-June performance (measured, not assumed)
The founder asked to confirm it isn't dragging the page. It isn't:
- Anthem-June is a **lazy, client-fetched tab** — it does not load until its tab is
  clicked, and the fetch is async, so /workspace renders instantly regardless.
- API timings (repeated): **page 0 with count ≈ 1.15s**, subsequent scroll page (offset,
  no count) **186ms**, NPI-filtered **311ms**.
- The 1.15s is **entirely the `count(*)`** over the 476,114 June rows
  (`source_file LIKE …39F0…`) in `provider_rate_signals` (13.7M rows). The repo already
  ships the full lightning stack: parallel page+count (`Promise.all`), count only on
  page 0, server pagination, debounced NPI search. The page rows themselves are fast.

## Flags / next tranche
1. **/rates duplicate-key warning (out of seam, not from this change).** /rates emits 3
   React "two children with the same key" warnings (the dev "3 Issues" badge). It is NOT
   from this change — my workspace tables use the same primitive and warn zero times, and
   my diffs don't touch key generation; it's duplicate `rowKey`s in a rates table. Per the
   seam rule I did **not** touch `components/rates/*`. **Caveat:** the rates files are dirty
   in the shared tree right now (`components/rates/{bands-panel,rates-shell,spread-panel}.tsx`
   modified by another session), so the offending `rowKey` may live in EITHER committed or
   uncommitted code — the rates-session owner will sort which. The fix is a more unique
   `rowKey` on the affected rates DataTable.
2. **Anthem-June count (data-layer, out of my seam).** Shaving the 1.15s first-load means
   a cheaper total for the June slice — a partial index on `source_file`, a cached/snapshot
   count, or returning rows-first then backfilling the count in a second request. All live
   in `lib/repos/rate-signals.ts` / a migration (quality/data-agent), not the UI seam.
3. **Migrate remaining stacked tables to v2 over time.** /rates and /orgs analytical tables
   can adopt title/status/source/updatedAt when their sessions touch them — the primitive
   is ready; nothing is forced.

## Files (all absolute)
- `/Users/brendanstanton/Code/liminal/components/ui/data-table.tsx`
- `/Users/brendanstanton/Code/liminal/components/ui/table.tsx`
- `/Users/brendanstanton/Code/liminal/lib/csv.ts`
- `/Users/brendanstanton/Code/liminal/app/(app)/workspace/{runs-panel,run-history,reports-table,work-queue,anthem-june,page}.tsx`
- `/Users/brendanstanton/Code/liminal/app/(app)/workspace/sync-health.tsx` (deleted)
- `/Users/brendanstanton/Code/liminal/app/(app)/design-system/page.tsx`
