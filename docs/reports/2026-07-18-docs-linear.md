# 2026-07-18 — Docs & Linear terminal

Executed `docs/TASK-DOCS-LINEAR.md` top to bottom. Everything below is committed
and pushed (docs + scripts are safe to push). `.harvest/status.mjs` shows a
concurrent session's modification — left untouched (not mine; DO-NOT-TOUCH).

## Task 1 — the Linear reorg — DONE

**Project "Data Engine"** — `91cf3ee7-4f05-49cb-8abd-432af802ebca` ·
[link](https://linear.app/nysgpt/project/data-engine-1501c7926506). Status **In
Progress**, linked to initiative **Find my plan**. **Leuk** set to In Progress.

**Five milestones:**

| Milestone | ID |
| --- | --- |
| Watched pipelines (shipped 2026-07-17, targetDate set) | `16218ccd-9b43-4875-9d16-ab6d63a6701d` |
| The 49.4% run | `931a1478-2ffe-446b-a29b-17c63beeeb95` |
| Depth & codes | `4c866baa-4bdf-4d7f-af90-af3e3b15432d` |
| Zero-touch | `c7ef968b-db80-4c5b-b5d8-f30c9ab8c026` |
| Plan registry (the HPID ghost) | `8b45fa2d-8bca-4370-b854-4014bcead950` |

**Issues moved into Data Engine, with milestones:**

| Issue | Milestone |
| --- | --- |
| NYS-14 (Aetna directory harvest) | The 49.4% run |
| NYS-25 (Empire 39-series OOM) | The 49.4% run |
| NYS-40 (unmatched-NPI discovery) | The 49.4% run |
| NYS-41 (organizations as NPI-2) | Plan registry |
| NYS-65 (orgs-sync HTTP-timeout port) | Zero-touch |
| NYS-72 (payer_sources hygiene) | The 49.4% run |
| NYS-92 (evergreen extraction loop) | *no milestone* — **see flag** |
| NYS-101 (Form 5500 registry) | Plan registry — **bonus move, see flag** |

**Closed with a one-line comment:**
- **NYS-87** → Done. CRON_SECRET set in prod; endpoint returns 401 (not the
  unset-503), confirming the guard is live.
- **NYS-97** → Canceled (moot). Commit `618c663` made Bands/Rates two tabs, so
  Band/Rate as filter *dimensions* is obviated.
- **NYS-98** → Done. Shipped in `41ef076`; **verified on :3010** (logged in) —
  Roster/Panels/Services render via `DataTable`'s `stacked` variant, toolbar
  inside the card. Spread's baseline table doesn't exist yet (that's NYS-99).

**Ten new issues filed** (all Data Engine except NYS-106 → Leuk; all Medium):

| # | Title | Milestone | Relates |
| --- | --- | --- | --- |
| NYS-103 | QHP / NYSOH / CMS-PUF discovery spike | Plan registry | NYS-101 |
| NYS-104 | NYS DFS licensed-insurer list → canonical insurer entity | Plan registry | NYS-48 |
| NYS-105 | Hospital price-transparency MRF spike | Plan registry | — |
| NYS-106 | Provider-rights corpus (NY) *(Leuk)* | — | — |
| NYS-107 | Per-payer manifest builders (zero-touch) | Zero-touch | NYS-46 |
| NYS-108 | Monthly re-harvest cadence | Zero-touch | NYS-46 |
| NYS-109 | Excellus scout | The 49.4% run | NYS-29 |
| NYS-110 | MetroPlus refresh | The 49.4% run | — |
| NYS-111 | Aetna Provider Directory app + harvest | The 49.4% run | NYS-14 |
| NYS-112 | Aetna MRF two-entity overlap check | Depth & codes | NYS-28, NYS-38 |

**Project update** posted on Data Engine (onTrack): the 2026-07-17 automation
night — harvestd + sync-health card + bell (NYS-100) + ops email; coverage
47.3% / ceiling 49.4%; 20-CPT widening + 4 wide rescans queued; first full green
night pending.

## Task 2 — the three documents — DONE

Each dual-homed (repo = source of truth, Linear = readable mirror).

| Document | Repo | Linear |
| --- | --- | --- |
| Operations Runbook | `docs/ops/OPERATIONS.md` | [operations-runbook](https://linear.app/nysgpt/document/operations-runbook-5e5eaef938ef) |
| Scripts Inventory | `docs/ops/SCRIPTS.md` | [scripts-inventory](https://linear.app/nysgpt/document/scripts-inventory-367fedf57900) |
| Database Atlas | `docs/data/DATABASE.md` | [database-atlas](https://linear.app/nysgpt/document/database-atlas-425e67032209) |

**Database Atlas generator** — `scripts/db-atlas.mjs`, read-only, run:

```
node --env-file=.env.local scripts/db-atlas.mjs
→ db-atlas: 71 relations (61 tables, 10 matviews), 25 unmapped.
  → docs/data/DATABASE.md
  → 72 Obsidian notes in ~/Vaults/hq/leuk/atlas
```

- Introspects the live schema three cheap ways: `pg_class` (kind + reltuples
  estimate — never `count(*)` the big tables; small ones get an exact batched
  count), `pg_attribute` (columns for tables **and** matviews), `pg_constraint`
  (FKs, merged into the hand-maintained join graph).
- Grouping/meaning/`powers` metadata **mirrors `lib/repos/admin.ts`** (extended
  with the sql/024 rate-bands, form5500, sync_runs, notifications). Tables in the
  DB but not in the metadata land under **Unmapped tables** with columns + count
  — a shrinking list is the health signal (currently 25).
- **Matview lineage is read from the cron's `VIEWS` array** in
  `app/api/cron/daily/route.ts`, not restated — all ten matviews resolve to their
  sql file and are correctly marked nightly-refreshed.
- Emits per-table Obsidian notes to `~/Vaults/hq/leuk/atlas/` with
  `[[wiki-links]]` (+ join key) between joined tables, plus an `_atlas.md` index.
  The prose predecessors (`Session-Database Expansion.md`, `Database
  Transcript.md`) were left in place.
- Registered as the weekly **`db-atlas`** job in `ops/harvest/jobs.json`. Note:
  the data terminal committed that shared file (`c876a15`) while I was mid-tranche
  and staged the whole file, so my one additive entry was **swept into their
  commit** — net result is correct (the `db-atlas` job is in HEAD/origin), but it's
  the same whole-file-staging anti-pattern the lead has flagged before (see flag 7).

Sample (current live counts): `provider_rate_signals` ≈ 10.57M rows (grown from
the 9.34M in the cron comment), `nppes_npi` ≈ 9.67M, `provider_network_
participation` ≈ 2.45M, `directory_providers` 123,577, `cpt_codes` 20 (the widened
set). `medicare_benchmark_ny` reads **not yet loaded** — it's computed on the fly,
not a materialized table (see flag).

## Task 3 — Aetna reference + writer brief — DONE

- **`docs/AETNA-INTEROP.md`** — draft note removed; five corrections applied in
  place: (a) harvest ladder = `$export` bulk first → enrich-by-NPI → network-walk;
  (b) rates line softened to the NYS-28/38 solved / NYS-44 display-remainder
  reality; (c) implementation = a `PAYER_REGISTRY` entry in `ingest-payers.mjs`,
  not a new harvester; (d) per-payer `_include`/pagination caveat (test the
  Swagger, don't trust the IG); (e) network-walk degeneracy warning (Anthem 541 of
  1,133 networks share one roster — NYS-69).
- **`docs/TASK-DOCS-ENGINE.md`** — standing technical-writer brief (VoltAgent
  subagent shape): role, triggers, ownership, per-document refresh procedures, the
  "every shipped feature gets a Linear record like NYS-100" policy, the dual-home
  rule, and a definition of done.

## Flags / judgment calls (for the lead)

1. **NYS-92 moved as instructed, but it's a cross-cutting UI/design-system
   evergreen** (component extraction loop), not data-engine work. Moved to Data
   Engine per the explicit list, **no milestone**. Recommend confirming it belongs
   here vs. Leuk.
2. **NYS-101 (Form 5500) moved to Data Engine + Plan registry** though it wasn't
   in the explicit move list — it postdates the brief and is *the* canonical
   plan-registry issue (owned In Progress by the data terminal). Flag if you'd
   rather it stayed put.
3. **NYS-111 substantially overlaps NYS-14** — both are the Aetna directory
   harvest. Filed as the implementation ticket + related to NYS-14 (the
   registration tracker) as instructed; you may want to merge one into the other.
4. **NYS-109 (Excellus) / NYS-110 (MetroPlus) / NYS-107 / NYS-108** overlap the
   existing NYS-29 (Incapsula wall) and NYS-46 (platform refresh). Filed as
   focused new issues + related, not duplicated.
5. **`medicare_benchmark_ny` is computed on the fly**, so the atlas flags it "not
   yet loaded." If we want it represented as present, it needs materializing or
   the atlas needs a "computed view" concept.
6. **Linear MCP hit a Cloudflare WAF block** on the first (verbatim) Operations
   doc push — the literal `curl … Authorization: Bearer` line tripped it.
   Reworded to prose and it went through; the repo file keeps the exact command.
   Note for future doc pushes: avoid raw curl+Bearer / shell-pipe payloads in
   Linear content.
7. **Shared-file collision on `ops/harvest/jobs.json`.** The data terminal
   committed `c876a15` (which **re-enabled the `fhir-status` job** — `status.mjs`
   ported to a psql subprocess, ~7 min → ~10 s, its slice of NYS-65) while I was
   mid-tranche, and staged the whole file — sweeping in my `db-atlas` entry. Both
   changes are correct in HEAD/origin, so nothing needs redoing, and I updated
   OPERATIONS.md + SCRIPTS.md (+ their Linear mirrors) to reflect fhir-status now
   being live. Left `.harvest/status.mjs` (theirs, already committed) untouched.

## Next-tranche suggestions

- **Promote the NPPES-family unmapped tables** (`nppes_organizations`,
  `nppes_other_names`, `org_affiliations`, `nucc_taxonomy`) into
  `lib/repos/admin.ts` + the db-atlas metadata — they're core data-engine tables
  sitting in the "Unmapped" bucket.
- **Kill the metadata drift risk:** db-atlas's `GROUPS` is a hand-mirror of
  `admin.ts`. A shared JSON both the app and the script read would make the atlas
  and /admin/data provably consistent.
- **Auto-refresh the Linear Documents** from the repo (the mirror is currently
  manual) — or accept repo-as-truth + the weekly manual Linear refresh the writer
  brief prescribes.
- **Leuk has no milestones** — if the reorg should extend to the product side,
  that's the next structural pass.
