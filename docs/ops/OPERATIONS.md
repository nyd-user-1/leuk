# Operations Runbook

Everything that runs on its own — where it runs, when, how to know it worked,
and how to turn each piece off. **One scheduler** does the automated work now:

| Runner | Where | When | What it does |
| --- | --- | --- | --- |
| **harvestd** | this laptop (launchd) | **01:04** local, nightly | runs every due data job, loads any dropped MRF manifest, **then rebuilds the matviews** those loads feed |

harvestd is the whole nightly loop: it loads new rows, then — in the same run,
right after the loads — rebuilds the eleven derived views (via `psql`, no 300 s
ceiling) so anything harvested is in the app by morning. The old Vercel
`/api/cron/daily` cron that used to do the rebuild is **demoted to a manual /
emergency HTTP path and no longer scheduled** (NYS-130 — the 13.4 M-row chain
outgrew Vercel's 300 s function cap). Every unit of work — each job and the
rebuild — writes one row to **`sync_runs`**, all surfaced on
**/workspace → Nightly sync**.

> **This file is the source of truth.** It's mirrored to a Linear Document for
> reading; edit it here.

---

## 1. harvestd — the nightly data runner

One launchd agent (`com.leuk.harvest`) fires `ops/harvest/runner.mjs` at
**01:04 every night**, wrapped in `caffeinate -is` so the machine stays awake
until the work is done. The runner:

- runs every **due** job **sequentially** — one Neon writer, one laptop's
  bandwidth, and payers WAF-ban concurrent greed, so sequential is the polite
  speed;
- retries a failed job (2 attempts, 120 s backoff) — a flaky payer CDN heals
  itself;
- honors the **KILL SWITCH** convention;
- **ledgers** every run into `sync_runs` (`job = 'harvest:<id>'`);
- **rebuilds the matviews last** — after the night's loads it runs the shared
  rebuild plan (§2) via `psql`, ledgered as job `daily`; skipped cleanly when
  nothing has loaded since the last good rebuild (`DAILY_FORCE=1` overrides);
- **emails** `LEUK_OPS_EMAIL` and drops an in-app notification if anything
  failed.

### Install / control — `install.sh`

```bash
ops/harvest/install.sh on        # install the LaunchAgent + load it (survives reboot/login)
ops/harvest/install.sh status    # is it loaded? when did it last run?
ops/harvest/install.sh run       # fire the runner right now (via launchd)
ops/harvest/install.sh off       # unload + remove the agent entirely
```

### Two kinds of work

**Recurring jobs** — declared in `ops/harvest/jobs.json`. Each entry:

```json
{
  "id": "rates-rollup",
  "every": "day",                                     // day | week | month | once
  "run": "node --env-file=.env.local scripts/mrf/rollup.mjs",
  "timeoutMinutes": 30,
  "attempts": 1,
  "memo": "Read-only morning coverage report — the log is the deliverable."
}
```

The runner treats a job as **due** if it hasn't succeeded within a window a bit
shorter than its nominal period (`day` → 20 h, `week` → 140 h, `month` → 648 h),
so a run that fired late yesterday still qualifies today — nothing is ever
"missed", only late. Current jobs:

| id | every | what | notes |
| --- | --- | --- | --- |
| `rates-rollup` | day | read-only morning coverage report | the log is the deliverable |
| `fhir-status` | day | directory-side coverage snapshot | **re-enabled 2026-07-18** — now runs each query via a psql subprocess (no HTTP 300 s ceiling, the NYS-65 family) + a `count(p.*)`→`count(p.id)` fix; ~7 min → ~10 s |
| `nppes-weekly` | week | download + apply the CMS weekly NPPES delta + deactivations | idempotent; re-running is free |
| `probe-payers` | week | read-only payer capability probe (≤2 GETs/payer) | keeps `payer_sources.last_probe_result` honest |

**MRF harvests** — do **not** go in `jobs.json`. Drop a manifest into
`.harvest/mrf/manifests/queue/` and walk away. That night the runner scans it,
loads the CSVs (idempotent), and on success moves the manifest to
`manifests/done/` (prefixed with the date). Filename prefixes pick the pipeline:

| manifest name | pipeline |
| --- | --- |
| `<name>.txt` | `run-payer.sh` → `load-rate-signals` |
| `stream-<name>.txt` | `run-stream.sh` (scan piped straight to DB) |
| `2p-<name>.txt` | `run-two-pass.sh` → load (ref-dense payers) |

A failed manifest job stays in `queue/` and retries the next night.

### Add a job / disable a job

- **Add:** append an entry to `ops/harvest/jobs.json` (the shape above). It runs
  on its next due night — no reinstall. `jobs.json` is a **shared file**: `git
  pull --rebase` before editing, and stage only your own hunk.
- **Disable without deleting:** set `"disabled": true` on the entry (this is how
  `fhir-status` is parked). The job stays documented; it just doesn't run.

### KILL SWITCH

Borrowed from `.harvest/babysit.sh`: when a job's output contains the literal
text `KILL SWITCH` (a script prints it on a DB write error it must not retry
into), the runner stops retrying that job and records the note — a poisoned run
never loops.

### The ledger, the lock, the logs

- **Ledger:** `sync_runs` — one row per run, opened at start (so a run that dies
  mid-flight is visible as `status='running'` with no `finished_at`), closed
  with per-step timing/errors. Same table the Vercel cron writes.
- **Lock:** `.harvest/runner/lock.json` holds the live PID. A second runner that
  finds a live PID exits; a stale lock (dead PID) is unlinked and reclaimed.
- **Logs (all untracked, under `.harvest/runner/`):**
  - `runner.log` — the runner's own narration
  - `state.json` — last-success timestamp per job (the due-date math)
  - `logs/<job>-<stamp>.log` — each job's captured stdout/stderr (kept 45 days)
  - `launchd.log` — what launchd itself captured (the caffeinate wrapper)

### Lid physics (the one caveat)

`caffeinate` holds a **started** run awake, and launchd runs a missed 01:04 on
next wake — but nothing in userland can start a Mac that's **sleeping shut on
battery**. Plugged in (lid open, or clamshell with a display) it runs at 01:04
every night, hands off. On battery with the lid closed all night, the run starts
on first morning wake instead.

---

## 2. The matview rebuild — the shared plan the runner runs

The app derives its rate/participation surfaces (`/rates`, `/directory`,
`/orgs`, `/recruiting`) from materialized views, not the 13M-row base tables —
that precompute is the only reason `/rates` answers in under a second. Those
views must be rebuilt after each night's loads, and **the harvestd runner does
it**, as the last thing it does each night.

- **One plan, two possible executors, no drift.** The refresh list — **eleven
  views, then four ANALYZEs**, in dependency order — lives once, in
  `ops/harvest/sync-plan.mjs` (`VIEWS` / `ANALYZE_TABLES`). Both the runner and
  the demoted Vercel route `import` it, so adding a matview means editing that
  one file, never two (NYS-129, "don't fork"). **That `VIEWS` array is the
  refresh registry** the Database Atlas reads to mark which matviews are rebuilt
  nightly.
- **The runner runs it via `psql`, right after the loads.** A real Postgres
  session has no 300 s ceiling, it runs inside the runner's lock on the data it
  just loaded, and it's ledgered as job `daily` — so `/workspace` judges it
  exactly like every other job. Measured ~6–10 min for the full chain
  (2026-07-17, 9.34M rate rows); each run records its own per-step timings in
  `sync_runs`.
- **It skips cleanly when there's nothing to do.** If no job has loaded since the
  last successful `daily` rebuild, the runner logs "nothing changed" and skips —
  a quiet night doesn't burn a rebuild. `DAILY_FORCE=1` overrides (for an
  operator or a verification run).
- **Every refresh is `CONCURRENTLY`, and that is not an optimisation.** A plain
  `REFRESH` takes `ACCESS EXCLUSIVE` on the view for the whole rebuild — i.e.
  `/rates` hanging, nightly, unattended. `CONCURRENTLY` builds alongside and
  swaps, so readers never block. It requires a UNIQUE index on each view (all
  eleven have one) and cannot run in a transaction block — hence one statement
  per call.
- **Order matters in exactly one place:** `rate_table_mv` (sql/027) joins
  `org_tin_rosters` (sql/025), so the roster is rebuilt first. Everything else
  reads only base tables.
- **A failing step does not stop the run.** The views are independent; one that
  errors keeps its previous contents (the staleness the app already tolerates
  between refreshes), the run closes `error`, and the failure is recorded
  per-step and emailed.
- **ANALYZE, not VACUUM:** a stale `n_distinct` on `provider_rate_signals` is how
  a rates query goes from 0.3 s back to 30 s (NYS-52). The four ANALYZEs
  (`provider_rate_signals`, `provider_network_participation`, `nppes_npi`,
  `directory_providers`) are the cheapest insurance here.
- **Timeouts bound the night:** the whole rebuild is ledgered with a 25 min job
  budget (`DAILY_TIMEOUT_MS`) and each `psql` statement is capped at 15 min, so
  one hung `REFRESH` can't wedge the run.

### The demoted Vercel route — `/api/cron/daily` (manual / emergency only)

The route that used to be the scheduler still exists, but **it is no longer
scheduled** — `vercel.json` has no `crons` entry (NYS-130). Two facts killed the
cron: Vercel Hobby cron delivery is best-effort and silently skipped its window
(the 2026-07-18 incident, proven by Neon's compute log), and even a manual
delivery that day was guillotined at exactly 300 s, because at 13.4M rate rows
the full chain no longer fits one function under `maxDuration`. It survives as an
**authenticated manual trigger** — useful for a targeted single-view re-run, but
it still times out on the full chain at current scale, so for a guaranteed full
rebuild use the runner (`ops/harvest/install.sh run`) or psql. If an automatic
cloud-side belt is ever wanted again (a laptop-away week), split the chain at the
`org_tin_rosters` boundary first.

#### CRON_SECRET (guards the manual route, or it refuses everyone)

The route is guarded by `CRON_SECRET`. Vercel sends
`Authorization: Bearer $CRON_SECRET` when the env var is set, so the same check
serves a human with the secret.

- **Unset `CRON_SECRET` is a CLOSED door:** the endpoint 503s ("CRON_SECRET is
  not set on this deployment"). It spends real database time, so a missing secret
  must mean "nobody can run it", never "anybody can".
- Set it on Vercel Production (`vercel env add CRON_SECRET production`, value from
  `openssl rand -hex 32`) and in local `.env.local` (already there, in
  `.env.example`). **Prod is set** — the endpoint returns **401** (not 503) to an
  unauthenticated request, the tell that the secret is present (NYS-87, closed).

Manual run (with the secret; expect a timeout on the full chain — use it for one
view):

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/daily
# → { ok, ms, steps: [...] } ; a sync_runs row is written (trigger='manual')
```

---

## 3. Watching it — /workspace, the bell, the email

Three layers over the one `sync_runs` ledger (health is judged in
`lib/repos/sync-runs.ts`, so "red" means the same thing everywhere):

- **Glanceable — the bell.** The TopBar bell (NYS-100) carries a red count for
  every admin when a nightly step fails; the dropdown names what failed; the
  click lands on /workspace.
- **Ambient — the /workspace sync-health card.** Green when the last nightly ran
  clean and recently; red on a failed step; **stale** (amber) when the nightly
  hasn't run in 26 h (the runner fires nightly, so a quiet day means it silently
  stopped). Shows the latest `daily` matview rebuild and the latest run of each
  harvest job.
- **Deep — the ops email.** harvestd emails `LEUK_OPS_EMAIL` (via
  `LEUK_RESEND_API_KEY`) on any failed step — the rebuild rides the same path
  as every job — calling the Resend REST API directly (it's plain node, not the
  Next app). The demoted Vercel route, when a human runs it, uses the app's
  `sendOpsAlertEmail`.

### How to know a night worked

**A green sync-health card and a silent inbox.** No failure email from the 01:04
runner — which does both the loads and the `daily` rebuild — and the card green
with a recent `finished_at`, means the night ran clean. The first **full green
night** (every job plus the rebuild passing) is the near-term proof the
automation holds unattended.

If the card is **red**: open it, read the failed step name, then the matching
log under `.harvest/runner/logs/` — the matview rebuild is `daily-<stamp>.log`,
each harvest job is `<job>-<stamp>.log`. If the card is **stale**: harvestd
didn't run — check `install.sh status` and the lid-physics caveat.

---

## Environment variables (ops-relevant)

| var | used by | purpose |
| --- | --- | --- |
| `DATABASE_URL` | everything | Neon connection string |
| `CRON_SECRET` | `/api/cron/daily` | guards the manual/emergency rebuild route (unset ⇒ 503) |
| `DAILY_FORCE` | `runner.mjs` | `=1` forces the nightly rebuild even if nothing loaded |
| `LEUK_OPS_EMAIL` | harvestd (+ manual route) | where failure alerts go |
| `LEUK_RESEND_API_KEY` | harvestd (+ manual route) | Resend API key for the alert email |
| `LEUK_EMAIL_FROM` | harvestd | optional From: (defaults to a Resend sandbox sender) |

## Sources

`ops/harvest/README.md` · `ops/harvest/runner.mjs` · `ops/harvest/install.sh` ·
`ops/harvest/jobs.json` · `ops/harvest/sync-plan.mjs` ·
`app/api/cron/daily/route.ts` · `lib/repos/sync-runs.ts` · `vercel.json`.
