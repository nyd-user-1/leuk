# TASK — AMA CPT API: canonical `cpt_codes` reference table (NYS-50)

> **SUPERSEDED 2026-07-16 — do not execute.** AMA licensing deliberately
> deferred ($1,050/yr + royalties). Replaced by docs/TASK-CMS-RVU.md (free CMS
> PFS RVU files + own-wording descriptors). Kept for the AMA portal facts and
> as the spec to revive if the licensing trigger fires (see
> scripts/cms/LICENSE_NOTE.md).

Leuk keys rates by TIN × network × service code but references codes as bare
identifiers (90791, 90834, 90837, 90853, 99214) with hardcoded names
(`lib/rate-table.ts:25`). This task seeds an official CPT descriptor layer from
the AMA CPT API platform. `cpt_codes` is already listed as a **planned** table
in `lib/repos/admin.ts:105` under Linear ticket **NYS-50** — this task is that
ticket.

DB: live Neon Postgres (`leuk`). Connect the way every repo script does:
`node --env-file=.env.local scripts/...` reading `DATABASE_URL` — see
`scripts/nppes-sync.mjs` for the house pattern (header comments there are the
style bar for ingest scripts: idempotency contract, resumability, why-notes).
Never hardcode or print credentials.

## Phase 0 — confirm the contract BEFORE building (hard gate)

1. Fetch the readme: https://platform.ama-assn.org/ama/#/documents/cpt/cpt-readme
   Note it's an SPA route — curl may return the app shell. If the doc doesn't
   render unauthenticated, that finding goes in your Phase-0 report; do NOT
   guess the contract from marketing pages.
2. Determine the exact auth scheme (API key? OAuth client-credentials?) and the
   endpoints/formats for **CPTAPI_Zip** (`/cpt-zip`, v1.0.0) and
   **CPTRefreshAPI** (`/refresh`, v1.5.0).
3. Check `.env.local` for AMA credentials. **There are none today (verified
   2026-07-15).** If the API needs keys you don't have: STOP. Print a short
   plain-language report — which AMA portal steps Brendan must do (account,
   app registration, which API products to subscribe), which env var names
   you'll expect, and what you verified about the contract. Wait for him to
   paste credentials into `.env.local`. Do not scrape, do not mock, do not
   build schema against imagined field names.
4. Once authenticated: pull a sample response. Confirm real field names, the
   actual code count, and one sample row. Show that, then build against it.

## Phase 1 — ingest (CPTAPI_Zip)

- `sql/033_cpt_codes.sql` — next free number; note `sql/` has a duplicate-029
  collision, don't repeat that. Table `cpt_codes`: `code` PK, short/long/
  consumer descriptors (as the real payload names them), `effective_date`,
  source/version column, `status` (active/retired), timestamps. Adjust to the
  verified shape — the payload wins over this sketch.
- `scripts/cpt/ingest-cpt-zip.mjs` — stream-and-parse (zip central directory
  sits at the END; download fully to `.harvest/cpt/`, gitignored, then read —
  same lesson as NPPES). CPT is ~11k codes, so memory is not the risk;
  correctness of the upsert is. Idempotent upsert on `code`; re-running must
  not duplicate or churn rows.
- Handle pagination/rate limits/retries/empty responses inside the script.

## Phase 2 — refresh (CPTRefreshAPI)

- `scripts/cpt/refresh-cpt.mjs` — pulls deltas, upserts, updates version +
  effective_date. Logs added/changed/retired counts. NEVER hard-delete retired
  codes — flag `status='retired'` so historical rate rows stay resolvable.

## Phase 3 — wire into the repo surface

- Flip the `planned("cpt_codes", …, "NYS-50")` entry in `lib/repos/admin.ts`
  to a live `table(...)` row with real row count + a one-line join hint.
- Do NOT rewire any UI to use descriptors this phase (`lib/rate-table.ts`
  names stay hardcoded). But diff the AMA official descriptors for the five
  behavioral codes against our hardcoded labels and put the diff in the report.

## Out of scope
CPTAssistantAPI, VignettesAPI, KBAPI (stub/TODO note only, in LICENSE_NOTE.md
or the ingest script header). Any customer-facing descriptor surface. Cron
wiring for refresh.

## Licensing flag (surface, do not resolve)
AMA marks every API "Licenseable." CPT descriptors are AMA-copyrighted;
customer-facing display likely needs a distribution license separate from API
access. Write `scripts/cpt/LICENSE_NOTE.md` capturing this. Internal/reference
use only until resolved.

## Done when
1. `cpt_codes` live in Neon, seeded; verification query shows total row count
   and 90791/90834/90837/90853/99214 resolving to real official descriptors.
2. Re-running the ingest is a no-op (prove it: run twice, show counts).
3. Refresh script runs clean against the current dataset (even if delta = 0).
4. `.env.example` gains the AMA entries (names only, no values).
5. `lib/repos/admin.ts` planned→live flip renders on /admin/data.
6. `scripts/cpt/LICENSE_NOTE.md` exists.

## Working agreements
Stage ONLY your own files (`git add <paths>`, never `-A` — concurrent sessions
share this tree). Commit locally; do NOT push. Never print secrets/tokens.
Downloads under `.harvest/cpt/` (never committed). Report to
`docs/reports/2026-07-16-cpt-api.md`, 60-line cap, sections:
Shipped / DB changes / Decisions / Open items / Gotchas. If Phase 0 blocks on
credentials, file the report anyway with what you verified and stop there.
