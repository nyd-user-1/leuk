# TASK-DATA-DETACHED — matview re-adoption + detached data loads

Lead brief, 2026-07-18 evening. Executor: **data-agent** (founder-run Opus
terminal). Founder ruling: the org_network_rates matview is RESTORED, not
dropped — the 0a98c7c revert was aimed at the UI/DataTable work, not the
data layer.

## Tasks

### 1. Re-adopt `org_network_rates` (repo ↔ DB parity) — do first, it's small
- Restore the file verbatim from the revert's parent:
  `git show 0a98c7c^:sql/048_org_network_rates.sql > sql/048_org_network_rates.sql`
- Restore the one refresh line the revert removed from
  `ops/harvest/sync-plan.mjs` (visible in `git show 0a98c7c -- ops/harvest/sync-plan.mjs`).
- Verify against the LIVE matview in Neon: definition matches
  (`pg_matviews`), then run one refresh and confirm row count > 0.
  Trap (memory `leuk-postgres-neon-traps`): expression indexes silently
  break `REFRESH CONCURRENTLY` — if the unique index isn't plain-column,
  say so in the report rather than "fixing" it tonight.
- Do NOT restore `lib/repos/networks.ts` rate reads or any `/networks` UI —
  the UI rebuild is founder-driven, separately.
- Acceptance: sql/048 back in the tree + sync-plan line restored + a
  successful refresh with row count reported.

### 2. Form 5500-SF load (NYS-146) — the detached one
- Load the DOL Form 5500-SF (small-employer) filings alongside the existing
  sql/040 registry (150,635 5500 filings live). Bare-EIN join discipline
  as before; extend, don't rebuild.
- Run download + psql COPY as a DETACHED process (nohup/babysit pattern) —
  check in on it, don't hold the session open for it.
- Acceptance: row count loaded, EIN-join sanity check vs employers/
  tin_registry (how many NEW matchable EINs did SF add?), zero PHI.

### 3. Anthem/Empire finish (+833 NPIs) — if time allows
- Resume the remaining Anthem/Empire harvest (signed URLs valid to
  ~2026-08-19). Detached, same pattern.
- Acceptance: NPI delta reported; post-ingest chain NOT run ad-hoc (see
  timing below).

## Timing (load-bearing)
- Tonight's 01:04 runner carries the wide-uhc-oxford rescan. **Never race
  it**: check `.harvest/runner/lock.json` before any DB-heavy step, and
  leave the post-ingest matview chain to the nightly (01:04 runner →
  04:12 matview cron; never invert).
- Heavy loads still running at 01:04 are fine only if they don't contend
  for the same tables the runner writes.

## Seams
- OWNS: `sql/048` (restore only), `ops/harvest/sync-plan.mjs` (that one
  hunk), 5500-SF loader scripts, `.harvest/*` job artifacts.
- DO-NOT-TOUCH: `components/rates/*` and `docs/UI-PUSH-2026-07-18.md`
  (another session's uncommitted work — never stage), all UI, `jobs.json`
  recurrence entries (ops-agent's call), sql/049+ (reserved, rate-API).

## House rules
Explicit staging only; local commits, no push without the lead. The DB is
LIVE — clean up any test rows. Linear is LEAD-ONLY: do not connect Linear
MCP; write Linear intents (issue/NEW · action · evidence) in your report.
Report: `docs/reports/2026-07-18-data.md`, then STOP.
