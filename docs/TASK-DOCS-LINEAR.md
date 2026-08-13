# TASK — Docs & Linear Terminal (2026-07-18 tranche)

You are the **docs-and-linear terminal**. The lead (Fable session) wrote this
brief with the founder's approval; execute it top to bottom. Your mission:
**move the institutional knowledge out of terminal sessions — into Linear
(reorg + documents) and into `docs/`** — and build the DB Atlas generator.

## Context (read first, ~10 min)

- `CLAUDE.md` (house rules), `ops/harvest/README.md` (the nightly runner),
  `app/api/cron/daily/route.ts` header comments (the 4:12 matview cron)
- `docs/reports/2026-07-17-client-board.md` (coverage audit numbers)
- Linear issue **NYS-100** — the template for how a feature gets recorded
  (feature story + technical spec + not-in-v1). Match its quality everywhere.
- Linear MCP tools are available (list/save issue, project, milestone,
  document). Team = **NYSgpt** (key NYS). Existing: project "Leuk", initiative
  "Find my plan", ~100 issues, zero Documents.

## Task 1 — The Linear reorg (approved by the founder verbatim)

1. Create project **"Data Engine"** (team NYSgpt): summary = "Supply side:
   MRF/TiC rates, FHIR directories, NPPES, CMS benchmarks, orgs/TINs, the
   nightly harvest runner and matview cron." Status: In progress. Link it to
   initiative "Find my plan".
2. Create five **milestones** on Data Engine:
   - **Watched pipelines** — harvestd + sync-health + alerts (shipped
     2026-07-17; retroactive so progress reads true)
   - **The 49.4% run** — MVP, Anthem finish, UHC, MetroPlus refresh (+2.1pts
     to the measured ceiling)
   - **Depth & codes** — 20-CPT set (shipped), wide rescans, second-payer
     depth
   - **Zero-touch** — per-payer manifest builders, monthly re-harvest cadence
   - **Plan registry (the HPID ghost)** — Form 5500 + NYSOH/QHP + DFS +
     remaining payer ToC indexes; unique-plan-ID assembly
3. Move existing issues into Data Engine with sensible milestones:
   NYS-14, NYS-25, NYS-40, NYS-41, NYS-65, NYS-72, NYS-92 (leave Done ones
   where they are). Set project "Leuk" status to In progress (it's deployed).
4. Close with a one-line comment: **NYS-87** (CRON_SECRET verified in prod —
   endpoint returns 401), **NYS-97** (moot — Bands/Rates became tabs),
   **NYS-98** (shipped by the lead in `41ef076` — verify toolbar-in-card on
   /rates at :3010 before closing).
5. File these NEW issues (team NYSgpt; Data Engine unless noted; 2-4 sentence
   descriptions — expand from the hints, NYS-100 quality):
   - **QHP / NYSOH / CMS-PUF discovery spike** — evaluate & size: CMS
     state-based-exchange PUFs (cms.gov/marketplace/resources/data/state-based-public-use-files),
     marketplace PUFs + crosswalks (cms.gov/marketplace/resources/data/public-use-files),
     quality downloads (cms.gov/marketplace/about/health-insurance-quality-initiatives/downloads),
     cms.gov/data-research generally, and health.data.ny.gov (Socrata API).
     Deliverable: which datasets join to our layers and on what keys.
     Milestone: Plan registry.
   - **NYS DFS licensed-insurer list → canonical insurer entity** — the DFS
     company search (myportal.dfs.ny.gov/web/guest-applications/ins.-company-search)
     enumerates every DFS-supervised insurer; feed the canonical-carrier
     design in NYS-48 (relate the two). Milestone: Plan registry.
   - **Hospital price-transparency MRF spike** — the *other* federal MRF
     regime (facility rates, separate from payer TiC); size a NY hospital
     harvest. Milestone: Plan registry.
   - **Provider-rights corpus (NY)** — PHL §4406-c(5-a) (payment-methodology
     transparency in managed-care contracts), Ins. Law §3224-b (fee-schedule
     disclosure), §3224-a (prompt pay): verify scope → Know Your Rates
     content + a records/fee-schedule request-letter feature. Project Leuk.
   - **Per-payer manifest builders (zero-touch MRF)** — scripts that walk
     each stable ToC index → emit a fresh manifest into the queue; kills the
     last human step for non-walled payers. Milestone: Zero-touch.
   - **Monthly re-harvest cadence** — MRFs republish monthly; a monthly
     manifest-drop per payer = longitudinal rate history (file_date already
     tracked). Milestone: Zero-touch.
   - **Excellus scout** (Incapsula-walled; size before funding) and
     **MetroPlus refresh** (newest file 2024-02-07 — 5,218 NPIs priced 2.5y
     stale) — two issues. Milestone: The 49.4% run.
   - **Aetna Provider Directory app + harvest** — blocked on founder's portal
     credentials (questionnaire status check → Production Third-Party app →
     `AETNA_CLIENT_ID/SECRET`); then registry entry in ingest-payers +
     `$export`-first harvest. Relate to NYS-14. Milestone: The 49.4% run.
   - **Aetna MRF two-entity overlap check** — Aetna Life (3.6M rows) vs
     Aetna-Healthfirst-TPA (4.36M): quantify NPI/rate overlap so depth stats
     don't double-count a book. Analytical dedup is already solved
     (NYS-28/NYS-38 + sql/024/025) — relate all three. Milestone: Depth & codes.
6. Post a **project update** on Data Engine: the 2026-07-17 automation night
   (harvestd + sync-health card + bell NYS-100 + ops email; coverage 47.3%,
   ceiling 49.4%; 20-CPT widening + 4 wide rescans queued; first full
   green night pending).

## Task 2 — Three documents (each BOTH a Linear Document and a repo file)

1. **Operations Runbook** → `docs/ops/OPERATIONS.md` + Linear Document.
   Everything automated, in one place: the 01:04 harvestd (jobs.json set,
   manifest drop-folder + prefix rules, retries, KILL SWITCH, ledger, email),
   the 04:12 Vercel matview cron (10 views + ANALYZE, CRON_SECRET), the
   /insights sync-health card + bell + `LEUK_OPS_EMAIL`, how to check
   health (green card + two silent emails = worked), how to add/disable a
   job, `install.sh on|off|status|run`, the lock file, log locations,
   the lid-physics caveat. Sources: `ops/harvest/README.md`, the cron route
   comments, `lib/repos/sync-runs.ts`.
2. **Scripts Inventory** → `docs/ops/SCRIPTS.md` + Linear Document. Read the
   header comment of every script in `scripts/`, `scripts/mrf/`,
   `scripts/cms/`, `.harvest/*.{sh,mjs}` and produce the table: name ·
   purpose · invocation · writes-to · resumable? · cron-able? · status
   (active / one-off / superseded). Add a "scripts we still need" section:
   manifest builders (per payer), form-5500 loader (data terminal is building
   it), db-atlas (you are building it).
3. **Database Atlas** → generator `scripts/db-atlas.mjs` + output
   `docs/data/DATABASE.md` + Linear Document + Obsidian notes.
   - The generator introspects the live DB (information_schema +
     pg_matviews + row estimates via pg_class.reltuples — do NOT count(*)
     the 9M-row tables) and emits: tables grouped by domain, columns,
     row counts, matview lineage (which sql/0XX file, what refreshes it —
     the nightly cron's VIEWS list in `app/api/cron/daily/route.ts` is the
     refresh registry), and which page/repo consumes each table. Reuse the
     grouping/meaning metadata that already exists in `lib/repos/admin.ts`
     (`platformInventory` — it powers /insights' Observatory and /admin/data).
   - Also emit per-table Obsidian notes to `~/Vaults/hq/leuk/atlas/` with
     `[[wiki-links]]` between joined tables (FK + known join keys: npi, ein/
     tin, payer) so the founder's graph view shows the schema. (Old artifacts
     `~/Vaults/hq/Session-Database Expansion.md` and
     `~/Vaults/hq/leuk/Database Transcript.md` are prose predecessors —
     leave them; yours supersedes.)
   - Register it as a weekly job: add to `ops/harvest/jobs.json` —
     `{"id":"db-atlas","every":"week","run":"node --env-file=.env.local scripts/db-atlas.mjs","timeoutMinutes":20,"attempts":1,"memo":"Regenerate docs/data/DATABASE.md + Obsidian atlas from the live schema."}`.
     This file is SHARED — pull --rebase before pushing it.

## Task 3 — Commit the Aetna reference + the standing writer brief

1. `docs/AETNA-INTEROP.md`: the founder's Aetna Interoperability reference is
   **already committed as a draft** with a header note listing what's
   pending. Apply the five agreed corrections in place, then remove the
   draft note: (a) harvest
   strategy ladder = `$export` bulk FIRST, then enrich-by-NPI
   (`identifier=…us-npi|<npi>`), then network-walk; (b) soften "rates
   unusable until dedup solved" → solved at band/median layer (NYS-28,
   NYS-38, sql/024/025), open remainder NYS-44 (display); (c) implementation
   = a `PAYER_REGISTRY` entry in `scripts/ingest-payers.mjs`, not a new
   harvester; (d) `_include`/`_revinclude`/pagination vary per payer — our
   `payer_sources` columns exist because of it; test before trusting the IG;
   (e) network-walk degeneracy warning (Anthem: 541 of 1,133 networks share
   one roster — NYS-69).
2. `docs/TASK-DOCS-ENGINE.md`: a standing technical-writer brief (modeled on
   the VoltAgent technical-writer subagent pattern) any future session can
   execute: owns the three documents above, refresh procedure, the "every
   shipped feature gets a Linear record like NYS-100" policy, and the
   dual-home rule (repo file + Linear Document, repo is source of truth).

## Ownership — the collision contract

- **You OWN**: `docs/**` EXCEPT `docs/MRF-INDEXES.md` (data terminal's) and
  `docs/reports/*` written by others; ALL Linear structural writes (projects,
  milestones, documents, moves, closes); `scripts/db-atlas.mjs`;
  `ops/harvest/jobs.json` (your one additive entry); `~/Vaults/hq/leuk/atlas/`.
- **DO NOT TOUCH**: `app/**`, `components/**`, `lib/**` (read freely, write
  never), `scripts/` other than db-atlas.mjs, `sql/**`, `.harvest/**`.

## House rules (non-negotiable)

- Explicit staging only — `git add -A` banned. `git pull --rebase origin
  main` before every push. Push = deploy; docs and scripts are safe to push
  when complete.
- The DB is LIVE — your atlas generator is read-only; keep it that way.
- Verify at :3010 (login brendan@leuk.demo / demo) anything you must see
  (NYS-98 close-check). Headless gotcha: sign in by POSTing
  `/api/auth/login`, carry the cookie; `networkidle` never settles under HMR.

## Report-back protocol

Write `docs/reports/2026-07-18-docs-linear.md`: reorg done (project/milestone
IDs, issues filed/moved/closed with numbers), the three documents (Linear URLs
+ repo paths), atlas generator status + sample output, Aetna doc status,
blockers, next-tranche suggestions. Commit, push, STOP.

---

# TRANCHE 2 — ROLE PIVOT: engineering review (2026-07-18, lead-approved)

Tranche-1 accepted in full. **You are now the review terminal.** New
contract: you may write ONLY Linear content and `docs/reports/*` — zero
source edits this tranche (you file findings; owners fix them).

1. **Three approved Linear hygiene calls** (answers to your flags):
   - Move **NYS-92** to project **Leuk**, no milestone (it's a UI evergreen —
     your instinct was right).
   - **Close NYS-14 as superseded by NYS-111** — first copy any unique
     registration detail from NYS-14 into NYS-111's description. NYS-111 is
     the one canonical Aetna-directory ticket now.
   - File one new issue: **"Shared data-dictionary metadata (admin.ts ×
     db-atlas)"** — Data Engine, note that the data-quality terminal owns
     the implementation in its tranche 2 (ownership of the `GROUPS` metadata
     block in `scripts/db-atlas.mjs` transfers to them).
2. **Review the commit range `618c663..HEAD` on main** (~20 commits, four
   sessions in one day: harvestd runner + install + queue, notifications/
   bell + API, sync-health card + run-history, cron ops email, Form 5500
   loader + migration, status.mjs psql port, scan-tic code widening,
   db-atlas). For each area, check: correctness; security (auth on the new
   API routes, secret handling in the runner/email paths, injection surface
   of the psql-subprocess and `spawn("/bin/bash", ["-c", …])` patterns);
   failure modes (what happens when the DB / Resend / a payer host is
   down); and claims-vs-reality — re-run the cheap verifications yourself
   rather than trusting the reports. **File every real finding as a Linear
   issue** (label Bug or Improvement, relate it to the shipping issue,
   NYS-100-quality one-paragraph description). No style nits, no findings
   theater — an empty findings list is a legitimate outcome if you verified.
   The 44b repo is OUT of scope.
3. Report: `docs/reports/2026-07-18-review.md` — findings by severity, what
   you verified clean, and anything you could not verify with the access you
   have. Commit, push, STOP.
