# 2026-07-16 — /analytics (composable KPI board, hq system → Leuk skin)

## Shipped
- `lib/analytics/metrics.ts` — a 47-metric registry (MetricDef: kind / source
  table / powered page / scope), pure (no db import) so the client board reads
  it. Six built-in views: Overview, Practice day, Data platform, Insurance
  graph, Rates deep-dive, Codes & benchmarks.
- `components/analytics/` — board (drag-reorder, drag-in + click-add, per-card
  size step, kebab remove, localStorage per view), chart bodies (series/area,
  ranked bars, distribution — inline SVG, light tokens), the metric card
  (/library anatomy), and both SidePanels (kicker "KPI LIBRARY" / "DATA
  DICTIONARY", image-faithful to hq's kpi-panel).
- `components/calendar/agenda-list.tsx` — the agenda EXTRACTED from the calendar
  rail; calendar-client.tsx now consumes it, so "Next up" is the same list.
- `lib/repos/analytics.ts` — one memoized flight reusing `practiceSnapshot()` +
  `platformInventory()`, adding only rankings / histogram / benchmark / accepting
  share. `lib/repos/dashboard.ts` gained `weeklySessions` (8-week trend).
- Route wired (ROUTE_TITLES + sidebar "Analytics" beside Dashboard, own hunks).
  Verified :3010 — brendan: Overview 10 cards, 0.10s warm, library 61 rows;
  search / click-add / drag / apply-view / resize / reload-persist / top-10
  dictionary table all pass; 0 console errors; 0 h-scroll at 390/768/1440; Data
  platform answers every Done-when #4 question. shelley: practice only — 6 cards,
  PRACTICE + PHOTON in the library, no platform leak.

## DB changes
None — read-only. No migration, no new table, no test rows.

## Decisions
- **Flow grid, not hq's 12-col canvas.** hq's absolute grid drops a card anywhere
  and pays with collision resolution + a px-height model; this brief needs order
  + width only, so a CSS grid with a 1/2/full size step gets responsive stacking
  free.
- **Server renders the default view** — board state seeds synchronously with
  Overview so SSR paints real numbers; the effect then adopts localStorage.
- **Every extra query is matview-backed, ≤400ms** (a subagent timed them).
  Corpus scans refused: rows-by-raw-label (1.6–12.8s), providers-per-network
  (3.8–18s) → NYS-68/69. Coverage uses org_tin_rate_summary.rate_points, not
  sum(npis) (which double-counts a clinician across two TINs).
- **% of Medicare ships fast-but-biased with a footnote** — rate_table_mv bakes
  in the sql/027 trio (330ms honors it) but keeps single-rate cells only, so
  range-publishers (Cigna, Empire) read low. Card says so; NYS-70 is honest.
- **Scope enforced in registry AND fetch** — practitioner gets Practice metrics
  only (viewsForRole filters built-in views too); no platform query runs for them.

## Open items (each ticketed)
- NYS-68 — matview for the full 389-label rates-by-network ranking.
- NYS-69 — matview for providers-per-network (near-degenerate: 541 Anthem
  shared-roster networks tie at the top → group by payer source).
- NYS-70 — % of Medicare single-rate bias (Cigna/Empire read low).
- NYS-71 — dictionary shows no row count for tables not in the admin registry.
- Analytics icon is `columns-3` (grid/activity taken; no chart glyph in the kit).

## Gotchas
- **A concurrent session is renaming /dashboard → /insights**, with four renames
  staged into the shared index. I unstaged ONLY those (worktree untouched, one
  `git add` restores them) and bare-committed my slice; my shell hunk keeps
  Dashboard + adds Analytics.
- **`justify-center` on an overflowing flex column clips BOTH ends** — it ate New
  York and Kings (the top two counties) off providers-by-county. hq's RankingBody
  omits it for this reason; removed. Caught by screenshot, not tsc.
- **`<Card>` doesn't forward unknown props** — `data-*` test hooks went on the
  board's own wrapper. The agenda extraction also left Badge / Icon / STATUS_META
  unused in calendar-client.tsx; removed those imports in the same hunk.
