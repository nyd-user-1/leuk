# TASK-WORKSPACE-GAUGE — fuel gauge + Agents/Reports/Rules consolidation

Founder task 2026-07-20. **ui-agent seam** (with an ops read for the data
source). Read `CLAUDE.md` and `docs/ops/PACING.md` before starting.

---

## Recon already done by the lead — work from these facts, do not re-derive

- **Snapshot** `~/.claude/hq/statusline-snapshot.json` carries **only**
  `rate_limits.five_hour.{used_percentage, resets_at}` and
  `rate_limits.seven_day.{used_percentage, resets_at}`.
  `resets_at` is **unix epoch seconds**. Live values at brief time:
  **five_hour 8%, seven_day 62%**.
- `~/.claude/hq/usage-snapshot.json` has keys `capturedAt` / `source` /
  `windows` only.
- **Per-model usage IS derivable — from the transcripts, not the snapshots.**
  (An earlier draft of this brief said otherwise; that was wrong and the
  founder corrected it.) Claude Code's own `/usage` screen reports
  "Current week (Fable): NN% used" with a per-model cost breakdown, and the
  data behind it lives in `~/.claude/projects/**/*.jsonl` — every assistant
  message carries its `model` and a `usage` block
  (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
  `cache_read_input_tokens`). `ops/usage-gauge.mjs` already describes this as
  its source 3, "mirrors hq/lib/usage.ts".
- `lib/repos/lead-reports.ts` exports **only** `latestLeadReport()` (`LIMIT 1`)
  and `saveLeadReport()`. **No list function exists.**
- Sections are composed in `app/(app)/workspace/page.tsx` via `<EcoSection>`:
  "The night's work" (~line 106), "Data" (~line 116); `CoverageGrowth` imported
  line 12.
- Components: `doc-sheet.tsx`, `fleet.tsx`, `fleet-grid.tsx`,
  `rules-panel.tsx`, `rules-grid.tsx`, `night-report.tsx`. The **"Editable"
  badge is at `night-report.tsx:36`**.

---

## Part 1 — Fuel gauge, placed IMMEDIATELY BEFORE "Coverage & growth"

The instrument already exists (`ops/usage-gauge.mjs`, NYS-123); `docs/ops/PACING.md`
documents the model. **Nothing new needs measuring — this is a surfacing job.**

A three-column row of cards mirroring the founder's reference (the SOC 2 /
ISO 27001 completion cards). Each card:

- small identity icon + label, top-left
- completion percentage, top-right
- a grid of small rounded squares filling left-to-right to represent consumption
- a two-item footer — left: the raw count (e.g. `62% of 7-day window used`);
  right: the secondary fact (e.g. `resets 6:30 AM`, converted from epoch seconds)

Colour the filled squares by state (**healthy / warning / depleted**) using
**existing theme tokens — do not invent a palette**. Reduced-motion gated if
you animate the fill.

**The three columns:**

**Map each card to the correct field — do not mix them.** The five-hour figure
is the **session window**; the seven-day figure is the **week**.

1. **Window usage** — `rate_limits.five_hour` (the session window). `live`.
2. **Weekly usage** — `rate_limits.seven_day` (the week). `live`.
3. **Fable usage** — the Fable-model consumption specifically, **derived from
   the transcripts using hq's method and labelled MODELED, not measured.**

### Card 3: follow the working precedent one repo over

**Read these before designing ours** — `~/Code/hq/app/ui/usage-panel.tsx`, its
`~/Code/hq/app/api/usage/route.ts`, and `~/Code/hq/lib/usage.ts`. hq already
ships a `byModel` breakdown in production; mirror its method rather than
inventing one.

The method, confirmed in `hq/lib/usage.ts`:

- **Meter token totals from the local transcripts** `~/.claude/projects/**/*.jsonl`.
  Each assistant message carries `model` plus a `usage` block. Files are
  append-only, so hq caches per file by **byte offset** and parses only new
  bytes — do the same; do not re-read whole transcripts on every request.
- **Dedupe by** `requestId ?? message.id` (hq keys its record map that way).
- **Cost weight within a model** (`shape()` in hq): fresh input ×1,
  cache write ×1.25, **cache read ×0.1**, **output ×5**.
- **Per-model tier multiplier** (`MODEL_WEIGHT`, Sonnet = 1.0): **opus 5.0,
  fable 5.0, mythos 5.0, sonnet 1.0, haiku 0.33.** hq flags this as a
  CALIBRATION KNOB — a price-tier proxy, with Fable a placeholder until a
  Fable-heavy block is measured. Carry that caveat across; do not present the
  multiplier as exact.
- **Honesty convention — carry it verbatim in spirit:** hq's meter type has
  `source: "live" | "modeled"`, and the panel renders a visible **`· modeled`**
  label (`usage-panel.tsx:184`) so an estimate is never shown as a
  measurement. **Card 3 must carry that label.** Cards 1 and 2 are `live` —
  they come from the snapshot's real percentages.

If any part of the derivation turns out not to hold, **say so in the report and
render the honest empty state** rather than a fabricated number. Never invent a
metric to fill a slot.

Add a **read-only server route/loader** for both the snapshot and the
transcript tally. Never read either client-side.

---

## Part 2 — Merge three sections into one: "Agents, Reports, and Rules"

Today "The night's work", "Agents" and "Rules" are three separate groups.
Combine into a single section with three tabs: **Agents · Reports · Rules**.

- **Reports tab** — rename "Night report" to **"Report"**. These are
  `lead_reports` rows: show **all of them, newest first**, in the standard
  layout. You must **add a list function** to `lib/repos/lead-reports.ts`
  (only `latestLeadReport()`/`LIMIT 1` exists today). Keep the
  `hasDb ? sql : mock` convention; dates out as ISO strings.
- **Rules tab** — collapse the current Design / Agent / Database rule tabs into
  **one** Rules tab, each card carrying a **category badge in its lower-left**
  (Design, Agent, Database) so the grouping survives the merge.
- **Agents tab** — unchanged in content.
- **Every tab** uses the same layout: **3 columns × 2 rows, then a "View more"
  control** — the pattern `rules-grid.tsx` already implements.
- **Remove the "Editable" badge everywhere in this section** (starts at
  `night-report.tsx:36`) — every card is editable, so the badge carries no
  information.
- **Every card** gets the three-vertical-dots action icon top-right with
  **"Copy as Markdown"** in its menu, and the **whole card is clickable**,
  opening the existing **DocSheet**. **Reuse
  `app/(app)/workspace/doc-sheet.tsx` — do not fork it — and name the reused
  component in your report.**
- **All cards in a tab must be equal height**; clamp body text rather than
  letting content drive height.

---

## Verification

Headless at **1440 and 1280**, practitioner login `brendan@leuk.demo` / `demo`:

- the gauge row renders three cards **immediately above "Coverage & growth"**
- each tab shows **exactly 3×2 plus View more**
- **zero "Editable" badges survive** anywhere
- a card click opens the **DocSheet**
- **no horizontal overflow** (recurring bug — the cause is a flex ancestor
  missing `min-w-0`, not the table itself)

**Screenshots of the gauge row and all three tabs** in the report.

## House rules

- Kit primitives only (~44 in `components/ui/*`, browsable at `/design-system`);
  no new primitives without flagging.
- One H1 per page — the shell renders it (`components/shell/content-header.tsx`).
  Note `CLAUDE.md` still says the H1 lives in the TopBar; that is stale (NYS-177).
- **Staging: the index is shared across agents.** Commit with an explicit
  pathspec every time — `git commit -m "…" -- path/one path/two` — and run
  `git diff --cached --name-only` before each commit. Local commits, **NEVER
  push**.
- Do not touch `components/rates/**`, `app/api/connect|stripe|checkout/**`,
  `lib/stripe.ts`, `lib/repos/stripe-connect.ts`, `docs/QUEUE.md`.
- Dev server runs on **:3010** — do not restart it.

## Report

**File to `docs/reports/2026-07-20-workspace-gauge.md`.** The **advisor**
session reviews this report (the lead terminal is retired as of 2026-07-20
evening) — write it for a reader who will re-run your claims, not skim them.

Include: per-item verification with the evidence, screenshots, an explicit
statement of **which existing component you reused** for the card→DocSheet
gesture, a plain statement of **what the Fable card actually shows and how it
was derived** (measured vs modeled — say which, and name the method), and any
flags or premise corrections. Premise corrections are a good outcome, not a
failure; if the brief is wrong about something, say so with evidence rather
than building to a wrong spec. File under NYS-174's siblings.

When the report is written: **commit it, do not push, and STOP.** Do not
continue into adjacent work or self-assign follow-ups.
