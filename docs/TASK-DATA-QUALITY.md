# TASK — Data-Quality Terminal (2026-07-18 tranche)

You are the **data-quality terminal**. The lead (Fable session) wrote this
brief; execute it top to bottom. Your mission: **make the database and its
surfaces trustworthy** — finish the run-history table, label the new CPT
codes before tonight's wide rescans land, get the FHIR status report off the
dying driver, and clear the small data-quality backlog.

## Context (read first, ~10 min)

- `CLAUDE.md` (house rules), `ops/harvest/README.md` (the nightly runner)
- `lib/repos/sync-runs.ts` — `recentSyncRuns()` already exists for you
- `app/(app)/insights/` — the page you're extending (`sync-health.tsx` is the
  card that shipped tonight; follow its composition style)
- `components/ui/data-table.tsx` header — the DataTable contract
- Linear **NYS-100** — the quality bar for recording a finished feature
- Dev server: port 3010, login `brendan@leuk.demo` / `demo`. Headless
  verification gotcha: POST `/api/auth/login` with the credentials, carry the
  cookie; `networkidle` never settles under Turbopack HMR — assert on HTML
  content, and if a page hangs, probe with curl first (a wedged shared dev
  server looks exactly like your bug).

## Task 1 — /insights run-history table (founder's explicit ask)

Under the sync-health card on `/insights` (admin section), render the run
ledger as a **DataTable** (the founder wants the DataTable primitive
specifically):

1. New client component `app/(app)/insights/run-history.tsx`:
   `RunHistory({ runs }: { runs: SyncRun[] })` → `DataTable` with columns:
   Job (fixed, `font-medium`) · Status (`Badge` — success/danger/warning per
   the card's mapping; "died"/"error" = danger) · Trigger · Started
   (`formatDateTime`, sortValue = ISO string) · Duration (right-aligned,
   `${Math.round(ms/1000)}s`, "—" when null) · Steps
   (`n steps · k failed` when k>0). `rowKey` = run id. `defaultSort` =
   `{ col: "started", dir: "desc" }` (note: `SortState` uses `col`, not
   `key`). Use `stacked` so the table matches the /rates
   toolbar-inside-card look. No storageKey needed (few columns).
2. In `app/(app)/insights/page.tsx`: fetch `recentSyncRuns()` alongside
   `syncHealth()` in the existing `Promise.all` (admin-gated) and render
   `<RunHistory>` inside the same section as `<SyncHealthCard>`, below it.
3. Verify at :3010 (the ledger already holds real rows: one `daily` manual
   run + four `harvest:*` rows from tonight's shakedown, including a red
   `harvest:fhir-status`). Commit, push. File + close a small Linear issue
   (team NYSgpt) recording it, NYS-100-style but brief.

## Task 2 — Label the 15 new CPT codes (URGENT — tonight's rescans land at 01:04)

`scan-tic.mjs`'s default set was widened today from 5 to 20 codes; four
wide-code rescans are queued for tonight. The `cpt_codes` table has 14 rows —
the /rates surfaces read it for labels. Unlabeled codes must not render as
bare numbers.

1. Check how `cpt_codes` is consumed (`grep -rn cpt_codes lib/ app/`) and
   what its columns are.
2. Migration `sql/050_cpt_codes_wide.sql`: insert rows for
   90792, 90832, 90833, 90836, 90838, 90839, 90840, 90846, 90847, 90785,
   96127, 99204, 99205, 99213, 99215 (skip any already present).
   **Write PLAIN-LANGUAGE short labels, not AMA descriptor text** — house
   rule (see `scripts/cms/ingest-rvu.mjs` header: we deliberately discard
   AMA-licensed descriptors). E.g. 90792 "Psychiatric evaluation with
   medical services", 90833 "30-min psychotherapy add-on (with E/M)",
   99213 "Established patient visit, low complexity", 96127 "Brief
   behavioral screener (PHQ-9/GAD-7 class)".
3. Apply to the live DB via psql, update any mock mirror
   (`lib/mock/*` — check whether cpt_codes has one), verify a /rates surface
   renders a new code's label if reachable, commit.

## Task 3 — `.harvest/status.mjs` off the Neon HTTP driver

The nightly `fhir-status` job was disabled 2026-07-17: the script's first
aggregate over `provider_network_participation` (2.4M rows) now exceeds
undici's 300s headers timeout inside the Neon HTTP driver (`@neondatabase/
serverless`) — the same failure family as NYS-65. Fix it properly:

1. Read `.harvest/status.mjs` and identify every query that can exceed ~60s.
2. Choose (your call, justify in the report):
   (a) run heavy queries through a **psql subprocess** (`spawn("psql", ...)`,
   house precedent: `sql/maint/org-affiliations-sync.sql` + the NPPES
   loader), or (b) back them with a **small matview** (`sql/051_...`,
   UNIQUE index so it can refresh CONCURRENTLY; add it to the `VIEWS` list in
   `app/api/cron/daily/route.ts` ONLY if you also verify total runtime stays
   under the 300s Vercel cap with margin — current chain is ~190s; if the
   margin is tight, refresh it from the local runner instead by making it a
   jobs.json step).
3. Acceptance: `node --env-file=.env.local .harvest/status.mjs` completes in
   under 60s. Then re-enable the job: in `ops/harvest/jobs.json` flip
   `"disabled": true` → remove the flag on `fhir-status` and update its memo.
   That file is SHARED (docs terminal adds a db-atlas entry) — `git pull
   --rebase origin main` immediately before your push of it.
4. File + close a Linear issue; relate it to NYS-65.

## Task 4 — NYS-44: /plans display dedup

Open ticket, spec already written by the founder (read NYS-44 in Linear).
On the `/plans` employer detail: strip the employer-name prefix from plan
names ("UNITED AIRLINESAetna Choice POS II" → "Aetna Choice POS II"),
collapse identical rows post-strip into one row + `×N` count Badge, keep the
raw name in the row's `title` attribute for provenance. Files:
`app/(app)/plans/*`, `lib/repos/plans.ts` (`getPlansForEmployer`). Verify at
:3010 on a big employer (United Airlines). Close NYS-44 with a comment.

## Task 5 — Small data-quality backlog (timebox: whatever remains)

- **NYS-88**: `sql/032_rate_table_children.sql` carries a wrong comment about
  CONCURRENTLY (sql/036 fixed the behavior; the comment still misleads). Fix
  the comment text only; no schema change. Close the ticket.
- **NYS-69** (providers-per-network matview): read the ticket. If you build
  it, you MUST content-dedup rosters first (Anthem: 541 of 1,133 networks
  share one identical roster — collapsing them is the point of the ticket).
  If the dedup design isn't clean in the time you have, write your
  recommendation as a ticket comment instead and leave it open. Do not ship
  a misleading ranking.

## Ownership — the collision contract

- **You OWN**: `app/(app)/insights/**` (additions), `app/(app)/plans/**`,
  `lib/repos/sync-runs.ts`, `lib/repos/plans.ts`, `.harvest/status.mjs`,
  `sql/050`–`sql/059`, the `fhir-status` entry in `ops/harvest/jobs.json`,
  `cpt_codes` table contents, your report file.
- **DO NOT TOUCH**: `scripts/mrf/**`, `scripts/ingest-*.mjs`, `sql/040-049`
  (data terminal's range), `docs/**` except your report, Linear
  project/milestone structure (file/close only your own issues),
  `ops/harvest/runner.mjs`, `components/ui/**` (compose, don't modify — if a
  primitive genuinely blocks you, write it up in the report instead).

## House rules (non-negotiable)

- Explicit staging only — `git add -A` banned. `git pull --rebase origin
  main` before every push. Push = deploy (Vercel builds main); push when a
  task is verified complete.
- The DB is LIVE. Migrations applied via psql; clean up any test rows you
  create; never log PHI.
- Reuse the 44 UI-kit primitives; no new primitives.
- One H1 per page lives in the TopBar — never add a page-level H1.
- Table overflow rule: if a page scrolls horizontally, the bug is a flex
  ancestor missing `min-w-0`, not the table.

## Report-back protocol

Write `docs/reports/2026-07-18-data-quality.md`: what shipped (commits,
verification evidence per task), the status.mjs approach you chose and why,
Linear issues opened/closed, anything left open with exact state. Commit,
push, STOP — do not start work beyond this brief.

---

# TRANCHE 2 (2026-07-18, lead-approved)

Tranche-1 accepted in full — both premise corrections (cptLabel chokepoint,
NYS-69 roster fingerprint) were exactly right. **Ownership additions** this
tranche: `lib/repos/admin.ts`, `lib/repos/orgs.ts` (or wherever the employer
detail's repo lives), `app/(app)/orgs/**`, `components/rates/cpt.ts`,
`lib/rate-table.ts`, `lib/repos/plans.ts`, and the metadata block of
`scripts/db-atlas.mjs` (transferred from the docs terminal, which is now in
review-only mode). In order:

1. **Form 5500 registry surface.** The data terminal shipped
   `employer_plan_registry` (sql/040 view; see its report §Task 1 for the
   join proof — Amazon 608,343 covered lives, etc.). On the employer detail
   page (where `PlansPanel` lives), add a "Federal registry (Form 5500)"
   block via a repo function: named carrier(s), covered lives, plan year,
   and the stop-loss "self-funded tell" as a Badge. No PHI. Verify at :3010
   on United Airlines / Apple / IBM EINs. File+close an NYS-100-style record.
2. **CPT label consolidation** (your own flag 1): make DB `cpt_codes` the
   single source. Since repos can't cross into client bundles, generate the
   client-safe map (build-time script or checked-in generated module with a
   regeneration command) and consume it from `components/rates/cpt.ts`,
   `lib/rate-table.ts`, `lib/repos/plans.ts`. `RATE_CPTS` (the 5-column set)
   stays separate exactly as you designed.
3. **Data-dictionary unification** (yours + docs terminal's suggestion):
   promote `nppes_organizations`, `nppes_other_names`, `org_affiliations`,
   `nucc_taxonomy` into the admin.ts metadata; then extract the
   table-metadata into ONE shared module both `lib/repos/admin.ts` and
   `scripts/db-atlas.mjs` read. Rerun db-atlas; the Unmapped count (25)
   should drop and the two surfaces become provably consistent.
4. **NYS-94** — the uncaught `.split` TypeError seen driving /rates. Drive
   /rates headless (cookie login), watch server + console output, find the
   repro. Fix if root-caused cheaply; otherwise post the exact repro on the
   ticket.

Report: `docs/reports/2026-07-18-data-quality-t2.md`, same protocol.
