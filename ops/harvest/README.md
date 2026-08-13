# harvestd — the nightly data runner

One launchd job fires `runner.mjs` at **01:04 every night**, wrapped in
`caffeinate -is` so the machine stays awake until the work is done. It runs
every due job **sequentially** (one Neon writer, one laptop's bandwidth,
payers that WAF-ban greed), retries failures with backoff, honors the
`KILL SWITCH` convention from `.harvest/babysit.sh`, ledgers every run into
`sync_runs` (the same table surfaced on **/workspace → Nightly sync**), and
emails `LEUK_OPS_EMAIL` when anything fails.

**Then it rebuilds the matviews itself.** After the last load, the runner runs
the ten `REFRESH MATERIALIZED VIEW CONCURRENTLY` + four `ANALYZE` of
`sync-plan.mjs` via **psql** and ledgers it as job `daily` — so everything
loaded overnight is in the app by morning. This is the PRIMARY rebuild path
(NYS-129): psql has no 300s ceiling, and running it here makes the
loads→rebuild ordering a code fact, not a schedule coincidence. It skips
cleanly if a `daily` run already succeeded today (`DAILY_FORCE=1` overrides).
The old Vercel cron (`app/api/cron/daily`) is **demoted to manual-only**
(NYS-130): Hobby delivery proved best-effort and the full chain no longer fits
one function's 300s cap at current scale. The route survives as an
authenticated manual trigger; `sync-plan.mjs` is the shared source of truth so
the paths can't drift.

**The cloud belt (`.github/workflows/nightly-rebuild.yml`).** A GitHub Actions
schedule (11:13 UTC, after the Mac window) that runs the *same*
`ops/harvest/rebuild-daily.mjs` → `runDailyRebuild` path against Neon via psql —
the fallback for laptop-away stretches. Same shared chain, same sound skip-guard,
so on a normal night (the Mac already rebuilt) it's a clean no-op; it only does
real work when nothing rebuilt since the last load. Belt rebuilds ledger as
`daily | cron` like the Mac's (the `sync_runs.trigger` CHECK only allows
`cron`/`manual`); a belt rebuild is told apart by its run time (~11:13 UTC, after
the Mac's window). A manual dispatch with `force=true` bypasses the skip-guard.
**One manual step (founder):** add a repo
secret `DATABASE_URL` (repo Settings → Secrets and variables → Actions → New
repository secret) = the Neon pooler connection string. Until then the scheduled
run is a clean green no-op. Also runnable locally: `node ops/harvest/rebuild-daily.mjs`.

## Install / control

```bash
ops/harvest/install.sh on        # install + load (survives reboot/login)
ops/harvest/install.sh status    # loaded? last runs?
ops/harvest/install.sh run       # fire right now
ops/harvest/install.sh off       # remove entirely
```

## Two kinds of work

**Recurring jobs** — declared in `jobs.json` (`every: day|week|month`).
Currently: nightly rates rollup + FHIR status snapshot (read-only reports),
weekly NPPES delta sync (auto-discovers + downloads the CMS weekly), weekly
payer capability probe.

**MRF harvests** — drop a manifest into `.harvest/mrf/manifests/queue/` and
walk away. That night the runner scans it (`run-payer.sh`), loads the CSVs
(`load-rate-signals.mjs`, idempotent), and on success moves the manifest to
`manifests/done/`. Filename prefixes pick the pipeline:

| manifest name         | pipeline                                   |
| --------------------- | ------------------------------------------ |
| `<name>.txt`          | run-payer.sh → load-rate-signals           |
| `stream-<name>.txt`   | run-stream.sh (scan piped straight to DB)  |
| `2p-<name>.txt`       | run-two-pass.sh → load (ref-dense payers)  |

A failed manifest job stays in `queue/` and retries the next night (2
in-run attempts first), so a flaky payer CDN heals itself. A manifest line is
`url|decomp|payer|network|slug|filedate[|zerook]`; `run-payer.sh` now fails the
job (nonzero exit → no load, retry, alert) on any per-file pipe failure
(PIPESTATUS) **or** an empty scan — so a partial/empty harvest can never ledger
as a green tick (NYS-132). For a network that legitimately matches zero NY
providers (e.g. Emblem's HCP), add a 7th `zerook` field to that line to allow
its empty output.

## What still needs a human (on purpose)

- **Minting manifests.** BCBS/Aetna file URLs are CloudFront-signed and
  expire — a manifest is only runnable for days. Curating one (from the
  payer's ToC index, sometimes via browser devtools) is judgment work; it's
  the *only* step left that is. Everything after the drop is machine's.
- **Lid physics.** `caffeinate` holds a started run awake, and launchd runs a
  missed 01:04 on next wake — but nothing in userland can start a Mac that's
  sleeping shut on battery. Plugged in, it just works.

## Where things live

- State/logs: `.harvest/runner/` (untracked) — `runner.log`, `state.json`,
  `logs/<job>-<stamp>.log`, `launchd.log`
- Ledger: `sync_runs` rows with `job = 'harvest:<id>'` → /workspace card
- Email: `LEUK_OPS_EMAIL` + `LEUK_RESEND_API_KEY` in `.env.local`
