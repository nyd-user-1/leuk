#!/usr/bin/env node
// leuk harvestd — the nightly wake-up that runs every due data job.
//
// launchd fires this at 01:04 local (ops/harvest/install.sh), wrapped in
// `caffeinate -is` so the machine stays awake for the duration. It replaces
// the nohup-and-hope era: jobs are declared in ops/harvest/jobs.json, MRF
// manifests dropped into .harvest/mrf/manifests/queue/ become jobs
// automatically, every run is ledgered to sync_runs (the same table the
// Vercel matview cron writes, so /workspace shows both), failures email
// LEUK_OPS_EMAIL, and Farmer John (a Linear bot, app/api/harvest/report)
// files or updates a ticket per failed/suspect job. If the Mac slept through
// 01:04, launchd runs the job on next wake and the interval math below
// self-heals — nothing is ever "missed", only late.
//
// Design debts to ~/Code/hq: the lock/PID-liveness check (dev-server.ts), the
// detached-group spawn + group kill (same), and launchd bootstrap/bootout as
// the on/off switch (hq-dev.ts). What hq never had — sleep-holding, a retrying
// queue, failure email — lives here.
//
// One job at a time, on purpose: these jobs contend for the same laptop
// bandwidth and the same Neon writer, and payers WAF-ban concurrent greed
// (the UHC valve exists because of it). Sequential is the polite speed.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// The nightly matview rebuild plan, shared with app/api/cron/daily so the two
// executors can never drift (NYS-129). See sync-plan.mjs for the ordering.
import { VIEWS, ANALYZE_TABLES, IDENT } from "./sync-plan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RUN_DIR = path.join(ROOT, ".harvest", "runner");
const LOG_DIR = path.join(RUN_DIR, "logs");
const LOCK = path.join(RUN_DIR, "lock.json");
const STATE = path.join(RUN_DIR, "state.json");
const JOBS = path.join(ROOT, "ops", "harvest", "jobs.json");
const QUEUE_DIR = path.join(ROOT, ".harvest", "mrf", "manifests", "queue");
const DONE_DIR = path.join(ROOT, ".harvest", "mrf", "manifests", "done");

// Interval per cadence, deliberately under the nominal period so a run that
// fired late yesterday still qualifies today (20h < 24h, etc.).
const EVERY_HOURS = { day: 20, week: 140, month: 648 };
const DEFAULT_TIMEOUT_MIN = 360;
const DEFAULT_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 120_000;
const LOG_KEEP_DAYS = 45;

// NYS-117 — a manifest stem is interpolated into a `bash -c` command and into
// CSV glob paths (see manifestJobs); anything outside this charset is a
// command-injection surface and the manifest is refused, not run.
const STEM_RE = /^[A-Za-z0-9._-]+$/;

// NYS-124 — the false-success guard. A job that exits 0 far faster than it ever
// legitimately could (the Emblem incident: exit 0 in 2.7s having loaded 0 rows,
// because run-payer.sh doesn't propagate PIPESTATUS) is not trusted: the run is
// ledgered 'suspect', the manifest is kept in queue/ rather than filed to done/,
// and the operator is emailed. Two independent tells:
//   • baseline — under SUSPECT_FRACTION of the median of this job's last ok runs
//     (needs ≥ SUSPECT_MIN_HISTORY of them); self-scales to each job's normal.
//   • floor — before a baseline exists, an MRF harvest (curl→scan→load) that
//     finished under SUSPECT_FLOOR_MS can't have done real work. Scoped to
//     manifest jobs so fast report jobs (rates-rollup runs in seconds) never
//     trip it; a real NY book like Fidelis takes ~31s, well clear of the floor.
const SUSPECT_FRACTION = 0.2;
const SUSPECT_MIN_HISTORY = 2;
const SUSPECT_FLOOR_MS = 15_000;

// NYS-129 — the nightly matview rebuild the runner runs after the loads.
// Generous vs the measured ~6-10m chain; ledgered as timeout_ms so the
// /workspace "died" math (sql/041) judges it against its own kill-timeout.
const DAILY_TIMEOUT_MS = 25 * 60_000;
// A single hung REFRESH must not wedge the whole night — bound each psql call.
const PSQL_STMT_TIMEOUT_MS = 15 * 60_000;

// ── env ───────────────────────────────────────────────────────────────────────
// The runner reads .env.local itself (children get it via their own
// --env-file). Never overrides anything launchd already set.
for (const line of (() => {
  try {
    return fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n");
  } catch {
    return [];
  }
})()) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const sql = await (async () => {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { neon } = await import("@neondatabase/serverless");
    return neon(process.env.DATABASE_URL);
  } catch {
    return null; // the ledger is a convenience, not the job
  }
})();

// ── small utilities ───────────────────────────────────────────────────────────
const now = () => new Date();
const stamp = () => now().toISOString().replace(/[:T]/g, "-").slice(0, 16);
const today = () => now().toISOString().slice(0, 10);
const log = (msg) => {
  const line = `[${now().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(path.join(RUN_DIR, "runner.log"), line + "\n");
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function tail(file, lines = 15) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text.split("\n").filter(Boolean).slice(-lines).join("\n");
  } catch {
    return "";
  }
}

// ── ledger (sync_runs, shared with the Vercel matview cron) ───────────────────
async function openRun(job, timeoutMs) {
  if (!sql) return null;
  try {
    // timeout_ms (sql/041) lets /workspace judge "died" against this job's own
    // kill-timeout instead of a flat 30m — a long harvest is no longer false red.
    // trigger is 'cron' for both the Mac runner and the GitHub Actions cloud
    // belt — the sync_runs.trigger CHECK only allows 'cron'|'manual', and a
    // scheduled belt IS a cron. A belt rebuild is told apart from a Mac one by
    // its run time (the belt fires ~11:13 UTC, well after the Mac's window), not
    // by a distinct label (which would have needed a schema migration).
    const [{ id }] = await sql`
      INSERT INTO sync_runs (job, trigger, timeout_ms)
      VALUES (${job}, 'cron', ${timeoutMs ?? null}) RETURNING id`;
    return id;
  } catch {
    return null;
  }
}

// status is 'ok' | 'error' | 'suspect' (sql/041) — 'suspect' is a success the
// runner does not trust (NYS-124), distinct from a process that failed.
async function closeRun(id, status, ms, steps, error) {
  if (!sql || !id) return;
  try {
    await sql`
      UPDATE sync_runs
         SET finished_at = now(), duration_ms = ${ms},
             status = ${status},
             steps = ${JSON.stringify(steps)}::jsonb,
             error = ${error ? String(error).slice(0, 2000) : null}
       WHERE id = ${id}`;
  } catch {
    /* ledger only */
  }
}

// NYS-124 — the median duration of this job's last few trusted (ok) runs, or
// null if it doesn't yet have SUSPECT_MIN_HISTORY of them. 'suspect'/'error'
// runs are excluded so a bad run never poisons the baseline.
export async function baselineMs(ledgerJob) {
  if (!sql) return null;
  try {
    const rows = await sql`
      SELECT duration_ms FROM sync_runs
       WHERE job = ${ledgerJob} AND status = 'ok' AND duration_ms IS NOT NULL
       ORDER BY started_at DESC LIMIT 10`;
    if (rows.length < SUSPECT_MIN_HISTORY) return null;
    const ms = rows.map((r) => r.duration_ms).sort((a, b) => a - b);
    return ms[Math.floor(ms.length / 2)];
  } catch {
    return null;
  }
}

// Returns a human reason string if this ok run is implausibly fast, else null.
// Once a job has a baseline, that baseline is authoritative (self-scaling); the
// absolute floor only guards MRF harvests that have no successful history yet.
export async function suspectFastSuccess(job, ledgerJob, ms) {
  const base = await baselineMs(ledgerJob);
  if (base !== null) {
    if (ms < base * SUSPECT_FRACTION)
      return `finished in ${Math.round(ms / 1000)}s — ${((ms / base) * 100).toFixed(
        1,
      )}% of the ${Math.round(base / 1000)}s baseline over its recent runs`;
    return null;
  }
  if (job._manifest && ms < SUSPECT_FLOOR_MS)
    return `MRF harvest finished in ${Math.round(
      ms / 1000,
    )}s — implausibly fast for a scan+load, and no prior successful run to compare against`;
  return null;
}

// ── failure email (Resend REST — this is plain node, not the Next app) ────────
async function emailFailures(results) {
  const key = process.env.LEUK_RESEND_API_KEY;
  const to = process.env.LEUK_OPS_EMAIL;
  // A 'suspect' run exited 0 but is not trusted (NYS-124) — it needs a human as
  // much as an outright failure does, so it alerts too.
  const failed = results.filter((r) => !r.ok || r.suspect);
  if (!key || !to || failed.length === 0) return;
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks = failed
    .map(
      (r) => `<p style="margin:0 0 4px;"><strong>${esc(r.id)}</strong> — ${esc(r.note)}</p>
        <pre style="margin:0 0 16px;padding:10px;background:#F4F2EC;border-radius:8px;font-size:12px;white-space:pre-wrap;">${esc(tail(r.logFile))}</pre>`,
    )
    .join("");
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.LEUK_EMAIL_FROM ?? "Leuk <onboarding@resend.dev>",
        to,
        subject: `Harvest runner — ${failed.length} of ${results.length} jobs need attention`,
        html: `<p>Overnight run on ${today()}. Logs live in .harvest/runner/logs/.</p>${blocks}`,
      }),
    });
  } catch (e) {
    log(`failure email did not send: ${e.message ?? e}`);
  }
}

// ── Linear report (Farmer John) ───────────────────────────────────────────────
// Plain fetch, same as emailFailures — this is plain node, not the Next app.
// Farmer John's actual Linear token is minted server-side by
// app/api/harvest/report/route.ts (getToken() needs Vercel's own request-time
// infra and only works for code running on Vercel), so the runner just POSTs
// the raw results to that deployed route with the same Bearer CRON_SECRET
// every other machine caller in this app already uses. The route itself
// no-ops when nothing is flagged, so it's safe to call every run.
async function reportFailuresToLinear(results) {
  const url = process.env.LEUK_APP_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) return;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/harvest/report`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ results }),
    });
    if (!res.ok) {
      log(`Linear report failed: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
      return;
    }
    const data = await res.json();
    log(`Linear report: ${data.filed ?? 0} filed, ${data.commented ?? 0} commented`);
  } catch (e) {
    log(`Linear report did not send: ${e.message ?? e}`);
  }
}

// ── job execution ─────────────────────────────────────────────────────────────
function runOnce(job, logFile) {
  return new Promise((resolve) => {
    const fd = fs.openSync(logFile, "a");
    fs.writeSync(fd, `\n── ${job.id} @ ${now().toISOString()} ──\n$ ${job.run}\n`);
    // Own process group so a timeout can kill the whole curl|gunzip|node chain,
    // not just the bash wrapper.
    const child = spawn("/bin/bash", ["-c", job.run], {
      cwd: ROOT,
      env: process.env,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fs.closeSync(fd);
      resolve(result);
    };
    const timeoutMs = (job.timeoutMinutes ?? DEFAULT_TIMEOUT_MIN) * 60_000;
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 30_000).unref();
      finish({ code: null, timedOut: true });
    }, timeoutMs);
    child.on("error", () => finish({ code: 127, timedOut: false }));
    child.on("exit", (code) => finish({ code, timedOut: false }));
  });
}

async function runJob(job) {
  const logFile = path.join(LOG_DIR, `${job.id}-${stamp()}.log`);
  const ledgerJob = `harvest:${job.id}`;
  const timeoutMs = (job.timeoutMinutes ?? DEFAULT_TIMEOUT_MIN) * 60_000;
  const ledgerId = await openRun(ledgerJob, timeoutMs);
  const started = Date.now();
  const attempts = job.attempts ?? DEFAULT_ATTEMPTS;
  let note = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    log(`${job.id}: attempt ${attempt}/${attempts}`);
    const { code, timedOut } = await runOnce(job, logFile);
    const ms = Date.now() - started;
    if (code === 0) {
      // NYS-124 — exit 0 is necessary but not sufficient. A success far faster
      // than this job could legitimately be is not trusted: ledger it 'suspect'
      // and (below) keep its manifest in queue/ instead of filing it to done/.
      const suspectReason = await suspectFastSuccess(job, ledgerJob, ms);
      if (suspectReason) {
        await closeRun(ledgerId, "suspect", ms, [{ step: job.id, ms }], `not trusted: ${suspectReason}`);
        log(`${job.id}: SUSPECT — ${suspectReason} (manifest retained, not filed to done/)`);
        return { id: job.id, ok: true, suspect: true, note: `suspect — ${suspectReason}`, logFile };
      }
      await closeRun(ledgerId, "ok", ms, [{ step: job.id, ms }]);
      log(`${job.id}: ok in ${Math.round(ms / 1000)}s`);
      return { id: job.id, ok: true, note: "ok", logFile };
    }
    note = timedOut ? `timed out after ${job.timeoutMinutes ?? DEFAULT_TIMEOUT_MIN}m` : `exit ${code}`;
    log(`${job.id}: ${note}`);
    // The babysit.sh convention: a DB write error prints KILL SWITCH — retrying
    // would only re-fail against the same database. Stop and tell a human.
    if (tail(logFile, 40).includes("KILL SWITCH")) {
      note += " (KILL SWITCH — not retrying)";
      break;
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
  }

  const ms = Date.now() - started;
  await closeRun(ledgerId, "error", ms, [{ step: job.id, ms, error: note }], note);
  return { id: job.id, ok: false, note, logFile };
}

// ── nightly matview rebuild (NYS-129 — the runner is now the PRIMARY executor)─
// Build libpq env from DATABASE_URL so psql connects WITHOUT the
// credential-bearing URL in argv (where `ps` would expose the password). Same
// connection the neon HTTP client uses, just over a real Postgres session —
// which, unlike the HTTP driver, has no 300s ceiling on a long REFRESH.
function pgEnvFromUrl(urlStr) {
  const u = new URL(urlStr);
  const env = { ...process.env };
  env.PGHOST = u.hostname;
  if (u.port) env.PGPORT = u.port;
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  env.PGDATABASE = u.pathname.replace(/^\//, "");
  env.PGSSLMODE = u.searchParams.get("sslmode") || "require"; // Neon requires SSL
  const cb = u.searchParams.get("channel_binding");
  if (cb) env.PGCHANNELBINDING = cb;
  return env;
}

// Run one statement through psql. ON_ERROR_STOP makes a SQL error a nonzero
// exit; -qAt trims stdout to just the value (used for the count). Never throws
// — a failure is data about the step, like everywhere else here.
function psqlExec(statement, pgEnv, timeoutMs = PSQL_STMT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const child = spawn("psql", ["-v", "ON_ERROR_STOP=1", "-qAt", "-c", statement], {
      cwd: ROOT,
      env: pgEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `psql spawn failed: ${e.message ?? e}` });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ ok: true, stdout: stdout.trim() });
      else resolve({ ok: false, error: (stderr.trim() || `psql exited ${code}`).slice(0, 500) });
    });
  });
}

// The skip-guard. A flat "rebuilt within N hours" window is UNSOUND here: an
// off-cadence rebuild (an operator's manual one, the demoted Vercel route)
// landing within the window of the nightly would make the nightly skip even
// though tonight's loads still need reflecting — staleness, the worst failure.
// So the guard is "nothing has loaded since the last successful rebuild": skip
// only if the newest ok 'daily' row is newer than everything else that ran AND
// is itself recent (the recency bound still forces a periodic rebuild — fresh
// planner stats — on a truly idle stretch). Any load writes a sync_runs row, so
// the moment tonight's jobs run, last_other jumps past the last rebuild and the
// guard correctly declines to skip. Returns the redundant rebuild's timestamp,
// or null if a rebuild is warranted.
async function dailyRebuildRedundant() {
  if (!sql) return null;
  try {
    const [row] = await sql`
      SELECT
        (SELECT max(started_at) FROM sync_runs WHERE job = 'daily' AND status = 'ok') AS last_daily_ok,
        (SELECT max(started_at) FROM sync_runs WHERE job <> 'daily') AS last_other`;
    const lastDailyOk = row?.last_daily_ok ? new Date(row.last_daily_ok) : null;
    if (!lastDailyOk) return null; // never rebuilt → must run
    const lastOther = row?.last_other ? new Date(row.last_other) : null;
    const nothingSince = !lastOther || lastDailyOk >= lastOther;
    const recent = Date.now() - lastDailyOk.getTime() < EVERY_HOURS.day * 3_600_000;
    return nothingSince && recent ? lastDailyOk : null;
  } catch {
    return null;
  }
}

// NYS-129 — the runner IS the nightly matview rebuild now, not a watchdog for
// Vercel's. It runs the shared VIEWS/ANALYZE chain (sync-plan.mjs) via psql
// after the night's loads: a real session has no 300s ceiling (the Vercel
// route's cap now guillotines the full chain at 13.4M rows), it runs inside the
// runner's lock right after the data that should feed it, and it's ledgered as
// job 'daily' so the /workspace sync-health card judges it exactly like the old
// cron. The return shape matches a job result so it rides the same email + bell
// + exit-code path as everything else.
export async function runDailyRebuild() {
  const id = "daily-matviews";
  const logFile = path.join(LOG_DIR, `daily-${stamp()}.log`);
  const appendLog = (line) => fs.appendFileSync(logFile, line + "\n");

  if (!process.env.DATABASE_URL) {
    log("daily rebuild: no DATABASE_URL — skipping");
    return { id, ok: true, note: "no DATABASE_URL — skipped", logFile };
  }
  // Skip cleanly only if nothing has loaded since the last successful rebuild
  // (see dailyRebuildRedundant). DAILY_FORCE=1 overrides — for an operator
  // forcing a rebuild, and for verification.
  if (process.env.DAILY_FORCE !== "1") {
    const fresh = await dailyRebuildRedundant();
    if (fresh) {
      const agoMin = Math.round((Date.now() - fresh.getTime()) / 60_000);
      log(`daily rebuild: nothing loaded since the ok rebuild ${agoMin}m ago — skipping`);
      return { id, ok: true, skipped: true, note: `skipped — nothing changed since rebuild ${agoMin}m ago`, logFile };
    }
  }

  const pgEnv = pgEnvFromUrl(process.env.DATABASE_URL);
  const ledgerId = await openRun("daily", DAILY_TIMEOUT_MS);
  const started = Date.now();
  const steps = [];
  appendLog(`── daily matview rebuild @ ${now().toISOString()} (harvestd/psql, runner-primary) ──`);
  log(`daily rebuild: ${VIEWS.length} views + ${ANALYZE_TABLES.length} analyze via psql`);

  for (const v of VIEWS) {
    if (!IDENT.test(v)) {
      steps.push({ step: v, ms: 0, error: "refused: not a bare identifier" });
      appendLog(`REFRESH ${v} — REFUSED (not a bare identifier)`);
      continue;
    }
    const t0 = Date.now();
    const r = await psqlExec(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${v}`, pgEnv);
    const ms = Date.now() - t0;
    if (!r.ok) {
      // Independent views (sync-plan header): a failure keeps prior contents
      // and the run goes on; the step carries the error and the run closes
      // 'error' so a human is told.
      steps.push({ step: v, ms, error: r.error });
      appendLog(`REFRESH ${v} — ERROR after ${Math.round(ms / 1000)}s: ${r.error}`);
      continue;
    }
    const c = await psqlExec(`SELECT count(*) FROM ${v}`, pgEnv, 120_000);
    const rows = c.ok ? Number.parseInt(c.stdout, 10) : undefined;
    steps.push({ step: v, ms, ...(Number.isFinite(rows) ? { rows } : {}) });
    appendLog(`REFRESH ${v} — ok ${Math.round(ms / 1000)}s${Number.isFinite(rows) ? ` (rows=${rows})` : ""}`);
  }
  for (const tbl of ANALYZE_TABLES) {
    const label = `analyze ${tbl}`;
    if (!IDENT.test(tbl)) {
      steps.push({ step: label, ms: 0, error: "refused: not a bare identifier" });
      continue;
    }
    const t0 = Date.now();
    const r = await psqlExec(`ANALYZE ${tbl}`, pgEnv);
    const ms = Date.now() - t0;
    steps.push(r.ok ? { step: label, ms } : { step: label, ms, error: r.error });
    appendLog(`ANALYZE ${tbl} — ${r.ok ? `ok ${Math.round(ms / 1000)}s` : `ERROR: ${r.error}`}`);
  }

  const ms = Date.now() - started;
  const failed = steps.filter((s) => s.error);
  await closeRun(
    ledgerId,
    failed.length ? "error" : "ok",
    ms,
    steps,
    failed.length ? failed.map((s) => `${s.step}: ${s.error}`).join(" | ") : null,
  );
  const note = failed.length
    ? `${failed.length} of ${steps.length} steps failed`
    : `rebuilt ${VIEWS.length} views + ${ANALYZE_TABLES.length} analyze in ${Math.round(ms / 1000)}s`;
  appendLog(`── done: ${note} ──`);
  log(`daily rebuild: ${note}`);
  return { id, ok: failed.length === 0, note, logFile };
}

// ── the queue: declared jobs + manifest drop-folder ───────────────────────────
export function manifestJobs() {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  return fs
    .readdirSync(QUEUE_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort()
    .flatMap((f) => {
      const name = f.replace(/\.txt$/, "");
      // NYS-117 — refuse a stem with shell metacharacters (it lands inside a
      // `bash -c` string below). Left in queue/ so it stays visible, not run.
      if (!STEM_RE.test(name)) {
        log(`manifest "${f}" rejected — stem must match ${STEM_RE} (shell-safety); skipping`);
        return [];
      }
      const q = path.join(QUEUE_DIR, f);
      const load = `node --env-file=.env.local scripts/mrf/load-rate-signals.mjs --as-of=${today()} .harvest/mrf/${name}/*.csv`;
      let run;
      if (name.startsWith("stream-"))
        run = `bash scripts/mrf/run-stream.sh "${q}" "${name}" ${today()}`;
      else if (name.startsWith("2p-"))
        run = `bash scripts/mrf/run-two-pass.sh "${q}" "${name}" && ${load}`;
      else run = `bash scripts/mrf/run-payer.sh "${q}" "${name}" && ${load}`;
      return {
        id: `mrf-${name}`,
        every: "once",
        run,
        timeoutMinutes: 600,
        attempts: 2,
        _manifest: q,
        _manifestName: f,
      };
    });
}

function due(job, state) {
  const prev = state.jobs[job.id];
  if (job.every === "once") return !(prev?.lastState === "ok");
  const hours = EVERY_HOURS[job.every];
  if (!hours) return false;
  if (!prev?.lastStartedAt) return true;
  return Date.now() - new Date(prev.lastStartedAt).getTime() > hours * 3_600_000;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  // One runner at a time (a manual `install.sh run` must not race the 01:04
  // firing). PID-liveness check, stale locks unlinked — hq's dev-server pattern.
  const lock = readJson(LOCK, null);
  if (lock?.pid) {
    try {
      process.kill(lock.pid, 0);
      log(`another runner is alive (pid ${lock.pid}) — exiting`);
      process.exit(0);
    } catch {
      fs.rmSync(LOCK, { force: true });
    }
  }
  fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, startedAt: now().toISOString() }));

  try {
    // prune old logs
    for (const f of fs.readdirSync(LOG_DIR)) {
      const full = path.join(LOG_DIR, f);
      if (Date.now() - fs.statSync(full).mtimeMs > LOG_KEEP_DAYS * 86_400_000) fs.rmSync(full, { force: true });
    }

    const state = readJson(STATE, { jobs: {} });
    const declared = readJson(JOBS, { jobs: [] }).jobs.filter((j) => !j.disabled);
    const queue = [...declared, ...manifestJobs()];
    const dueJobs = queue.filter((j) => due(j, state));
    log(`runner up — ${queue.length} known jobs, ${dueJobs.length} due`);

    const results = [];
    for (const job of dueJobs) {
      state.jobs[job.id] = { lastStartedAt: now().toISOString(), lastState: "running" };
      fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
      const result = await runJob(job);
      // 'suspect' must not read as 'ok': a `once` manifest job whose lastState is
      // 'ok' would be filtered out of due() forever (see due()), stranding the
      // manifest we deliberately left in queue/. 'suspect' keeps it due next night.
      state.jobs[job.id].lastState = result.suspect ? "suspect" : result.ok ? "ok" : "error";
      fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
      // NYS-124 — only a trusted success files the manifest to done/; a suspect
      // one stays in queue/ to retry (the Emblem class of silent failure).
      if (result.ok && !result.suspect && job._manifest) {
        fs.mkdirSync(DONE_DIR, { recursive: true });
        fs.renameSync(job._manifest, path.join(DONE_DIR, `${today()}-${job._manifestName}`));
      }
      results.push(result);
    }

    // The night's loads are done — rebuild the matviews so everything loaded
    // above is in the app by morning (NYS-129). This is the LAST thing the
    // runner does, on purpose: the rebuild must follow every load, and running
    // it here makes the runner→rebuild ordering a code fact, not a schedule
    // coincidence. Skips itself cleanly if a 'daily' run already succeeded today.
    results.push(await runDailyRebuild());

    await emailFailures(results);
    await reportFailuresToLinear(results);
    // A suspect run needs a human as much as a failure — both raise the bell and
    // both make the runner exit non-zero.
    const flagged = results.filter((r) => !r.ok || r.suspect);
    // The bell (sql/038): pipeline trouble reaches every admin in-app too, not
    // just over email. Best-effort like the rest of the ledger.
    if (sql && flagged.length > 0) {
      try {
        await sql`
          INSERT INTO notifications (user_id, kind, title, body, href)
          SELECT id, 'sync_failure',
                 ${`Harvest runner — ${flagged.length} of ${results.length} jobs need attention`},
                 ${flagged.map((r) => r.id).join(", ")}, '/workspace'
          FROM users WHERE role = 'admin'`;
      } catch {
        /* ledger only */
      }
    }
    log(`runner done — ${results.length} ran, ${flagged.length} need attention`);
    process.exitCode = flagged.length ? 1 : 0;
  } finally {
    fs.rmSync(LOCK, { force: true });
  }
}

// Run the loop only when launchd/install.sh invokes this file directly; when a
// test imports it for the helpers above, main() stays dormant.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
