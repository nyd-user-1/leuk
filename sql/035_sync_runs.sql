-- Leuk — 035: sync_runs, the maintenance log (NYS-84).
--
-- WHAT A ROW IS. One invocation of a scheduled maintenance job — today the
-- daily derived-view refresh at /api/cron/daily, tomorrow whatever else earns a
-- schedule. A row is opened when the job starts and closed when it ends, so a
-- run that never finished is visible as exactly that: status='running' with a
-- started_at and no finished_at. A job that only ever wrote a row on SUCCESS
-- would be a log that goes quiet precisely when something is wrong.
--
-- WHY THE STEPS ARE JSONB AND NOT A CHILD TABLE. The steps of a run are read as
-- a unit ("what did last night do, and which part was slow?"), never queried
-- across runs on their own — nobody asks "every step named rate_table_mv since
-- April" without also wanting its run. A child table would buy a join and an
-- ordering column to reconstruct something the job already has in hand as an
-- array. If a cross-run step query ever becomes real, the jsonb unnests into
-- one.
--
-- WHY IT IS APPEND-ONLY. This is the record of what the database did to itself
-- unattended. Rewriting history here would defeat the only reason to keep it:
-- the Insights observatory reads this to say "the numbers you are looking at
-- were last rebuilt at 04:12, and it took 6 minutes". Retention is a later
-- problem — one row a night is 365 rows a year.

CREATE TABLE IF NOT EXISTS sync_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job          TEXT NOT NULL,                       -- 'daily' | 'daily-1' | 'daily-2' | …
  status       TEXT NOT NULL DEFAULT 'running'
               CHECK (status IN ('running', 'ok', 'error')),
  -- 'cron' when Vercel's scheduler called it, 'manual' when a human did. Worth
  -- distinguishing: a manual run at 14:00 explains a load spike that a nightly
  -- schedule would not.
  trigger      TEXT NOT NULL DEFAULT 'cron'
               CHECK (trigger IN ('cron', 'manual')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INTEGER,                             -- NULL until the run closes
  -- [{ "step": "provider_rate_summary", "ms": 40400, "rows": 43720 }, …] —
  -- in execution order, including the step that failed.
  steps        JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- The failure, if any. Never carries a row of data — only what broke.
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The one question anyone asks: "how did this job's last few runs go?"
CREATE INDEX IF NOT EXISTS idx_sync_runs_job_started
  ON sync_runs (job, started_at DESC);

-- Finding a run that died without closing its row (status='running' long after
-- started_at) is the other one — a partial index keeps it free.
CREATE INDEX IF NOT EXISTS idx_sync_runs_unfinished
  ON sync_runs (started_at DESC)
  WHERE finished_at IS NULL;
