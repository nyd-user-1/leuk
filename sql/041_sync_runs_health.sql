-- Leuk — 041: two ledger fixes so /insights tells the truth about harvests.
--
-- Both land against sync_runs (sql/035). They exist because the health the card
-- shows was computed against assumptions that only hold for the Vercel matview
-- cron, not for the local harvest runner, whose jobs run for hours and whose
-- "success" can be a lie.
--
-- (1) timeout_ms — NYS-119. lib/repos/sync-runs.ts flips a still-'running' row to
--     'died' after a flat 30 minutes. That is right for the daily cron (the
--     Vercel fn hard-dies at 300s, so 30m 'running' means it was killed), but
--     wrong for a harvest: mrf-wide-metroplus legitimately runs ~22 minutes and
--     mrf-mvp ~19, and a 600-minute-timeout manifest can run for hours. The row
--     showed false red mid-run. The runner now records each job's own timeout
--     here at open; the repo trusts timeout_ms + a grace window before calling a
--     row dead, and falls back to the flat 30m only for rows that carry no
--     timeout (the daily cron and any legacy row).
--
-- (2) status 'suspect' — NYS-124. The Emblem incident (docs/reports/
--     2026-07-18-data-acquisition-t2.md §1b): mrf-wide-emblem exited 0 in 2.7s
--     having loaded 0 rows — run-payer.sh doesn't propagate PIPESTATUS, so the
--     curl-23 + scanner-exit-2 chain looked like success and the runner filed
--     the manifest to done/. The runner now compares a "success" against the
--     job's own history (and, for a first-ever MRF harvest, an absolute floor);
--     an implausibly fast one is written 'suspect', the manifest is kept in
--     queue/ to retry, and the operator is emailed. 'suspect' is a real ledger
--     value, distinct from 'error' (the process didn't fail — it lied), so the
--     row stays honest even though the /insights state union (owned elsewhere)
--     currently renders it red-alongside-error until it grows its own arm.

ALTER TABLE sync_runs
  ADD COLUMN IF NOT EXISTS timeout_ms INTEGER;   -- the job's kill-timeout at open; NULL for the daily cron

-- CHECK constraints can't be modified in place; drop and re-add with the new
-- member. Every existing row is already in the old set, so the re-add validates
-- cleanly against live data.
ALTER TABLE sync_runs DROP CONSTRAINT IF EXISTS sync_runs_status_check;
ALTER TABLE sync_runs ADD CONSTRAINT sync_runs_status_check
  CHECK (status IN ('running', 'ok', 'error', 'suspect'));
