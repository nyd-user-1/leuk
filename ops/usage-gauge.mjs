#!/usr/bin/env node
// ops/usage-gauge.mjs — the fleet fuel gauge (NYS-123).
//
// WHY: we run several Claude accounts as one fleet, and a 5-hour rate-limit
// window is PER ACCOUNT. Tonight we ran three accounts dry mid-tranche with no
// instrument. This is the instrument: "the system reads its own fuel gauge."
//
// WHAT IT READS (per configured account = per config dir under $HOME/.claude*):
//   1. <dir>/hq/statusline-snapshot.json  ← AUTHORITATIVE. Claude Code's status
//      JSON, tee'd to disk by the statusline hook on every render. Carries the
//      REAL rate_limits.five_hour.{used_percentage, resets_at} (+ seven_day).
//      Fresh to the second while a session is active. This is the true gauge.
//   2. <dir>/hq/usage-snapshot.json       ← the SessionStart probe's capture.
//      Carries resets_at + allowed/rejected status, but usually NO percentage
//      (the CLI's rate_limit_event stream omits utilization). Used for the
//      reset time and to force RED when a window is already rejected.
//   3. transcript token-tally PROXY over <dir>/projects/**/*.jsonl in the
//      current 5h window ← fallback when 1 & 2 give no percentage. Weighted by
//      model tier (mirrors hq/lib/usage.ts). Clearly labelled "~proxy"; its %
//      is advisory, not truth. Budgets are calibration knobs (see BUDGET).
//
// KNOWN GAP (flagged, not fixed here — statusline-command.sh is outside ops/):
//   statusline-command.sh writes to a HARDCODED $HOME/.claude/hq, so only the
//   primary account (~/.claude) ever gets a real snapshot. Accounts under
//   ~/.claude-account2/3 fall through to the proxy. Making that hook write to
//   its own $CLAUDE_CONFIG_DIR/hq would upgrade every account to source #1.
//
// USAGE:
//   node ops/usage-gauge.mjs            human table + fleet verdict
//   node ops/usage-gauge.mjs --json     machine JSON (for HQ / other terminals)
//   node ops/usage-gauge.mjs --account nysgpt   filter to one account (substring)
// EXIT CODE encodes the WORST verdict so callers can branch cheaply:
//   0 GREEN · 10 AMBER · 20 RED · 30 UNKNOWN (no signal)
//
// COST: pure fs reads. The proxy only scans transcripts when the real % is
// missing (accounts 2/3, which have few recent files) — cheap enough to call
// mid-tranche on every turn.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ── thresholds (env-overridable) ─────────────────────────────────────────────
const AMBER = Number(process.env.USAGE_GAUGE_AMBER ?? 60);
const RED = Number(process.env.USAGE_GAUGE_RED ?? 85);

// ── proxy calibration knobs ──────────────────────────────────────────────────
// Weighted tokens that ≈ 100% of one 5h window, per rate-limit tier bucket.
// CALIBRATE: these are conservative first guesses. Account 1 has the REAL %, so
// the proxy only ever drives accounts 2/3 (Pro). Tune against one night of
// observed (realPct, weightedTokens) pairs. Override with env, e.g.
//   USAGE_GAUGE_BUDGET_PRO=8e7 USAGE_GAUGE_BUDGET_MAX=5e8
const BUDGET = {
  max: Number(process.env.USAGE_GAUGE_BUDGET_MAX ?? 5e8),
  pro: Number(process.env.USAGE_GAUGE_BUDGET_PRO ?? 1e8),
  unknown: Number(process.env.USAGE_GAUGE_BUDGET_UNKNOWN ?? 2e8),
};

// Per-model rate-limit burn multiplier, Sonnet = 1.0 (mirrors hq/lib/usage.ts).
const MODEL_WEIGHT = [
  ["opus", 5.0],
  ["fable", 5.0],
  ["mythos", 5.0],
  ["sonnet", 1.0],
  ["haiku", 0.33],
];
const modelWeight = (m) => {
  if (!m) return 1.0;
  const s = String(m).toLowerCase();
  for (const [k, w] of MODEL_WEIGHT) if (s.includes(k)) return w;
  return 1.0;
};
// Standard Anthropic within-model token price shape.
const shape = (i, cw, cr, out) => i + 1.25 * cw + 0.1 * cr + 5 * out;

const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
const now = Date.now();

// ── account discovery ────────────────────────────────────────────────────────
// Each Claude config dir under $HOME is a configured account. NOTE the layout
// quirk: the DEFAULT dir ~/.claude keeps its big .claude.json at $HOME/.claude.json
// (a sibling, NOT inside the dir), while a CLAUDE_CONFIG_DIR override (~/.claude-*)
// keeps .claude.json inside itself. So we accept a dir if it has an inner
// .claude.json, OR is the default dir with a sibling ~/.claude.json, OR carries a
// live hq/ or projects/ tree. Works from any terminal (HOME is stable across
// CLAUDE_CONFIG_DIR overrides). Override the set with USAGE_GAUGE_DIRS (colon-
// separated absolute paths).
function configJsonFor(dir) {
  const inner = path.join(dir, ".claude.json");
  if (fs.existsSync(inner)) return inner;
  const sibling = path.join(os.homedir(), ".claude.json"); // default-dir layout
  if (dir === path.join(os.homedir(), ".claude") && fs.existsSync(sibling)) return sibling;
  return null;
}
function discoverAccountDirs() {
  const override = process.env.USAGE_GAUGE_DIRS;
  if (override) return override.split(":").filter(Boolean);
  const home = os.homedir();
  const dirs = [];
  for (const name of fs.readdirSync(home)) {
    if (name !== ".claude" && !name.startsWith(".claude-")) continue;
    const full = path.join(home, name);
    try {
      if (!fs.statSync(full).isDirectory()) continue;
    } catch {
      continue;
    }
    const hasIdentity = configJsonFor(full) != null;
    const hasState = fs.existsSync(path.join(full, "hq")) || fs.existsSync(path.join(full, "projects"));
    if (hasIdentity || hasState) dirs.push(full);
  }
  // primary first, then the rest alphabetically
  return dirs.sort((a, b) => (a.endsWith("/.claude") ? -1 : b.endsWith("/.claude") ? 1 : a.localeCompare(b)));
}

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const mtimeMs = (p) => {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return null;
  }
};

// tier bucket for a config dir's organizationRateLimitTier string
function tierBucket(tierStr) {
  const t = String(tierStr ?? "").toLowerCase();
  if (t.includes("max")) return "max";
  if (t.includes("claude_ai") || t.includes("pro")) return "pro";
  return "unknown";
}

// ── source 1: the statusline snapshot (authoritative %) ──────────────────────
function readStatusline(dir) {
  const p = path.join(dir, "hq", "statusline-snapshot.json");
  const j = readJson(p);
  const rl = j?.rate_limits;
  if (!rl?.five_hour) return null;
  return {
    source: "statusline",
    capturedAtMs: mtimeMs(p),
    fiveHourPct: roundOrNull(rl.five_hour.used_percentage),
    fiveHourReset: sanitizeReset(secToMs(rl.five_hour.resets_at)),
    sevenDayPct: roundOrNull(rl.seven_day?.used_percentage),
    sevenDayReset: secToMs(rl.seven_day?.resets_at), // 7d window: no 5h sanity bound
    status: null,
    sessionName: j?.session_name ?? null,
    model: j?.model?.display_name ?? null,
    sessionCostUsd: numOrNull(j?.cost?.total_cost_usd),
  };
}

// ── source 2: the probe snapshot (reset + status, rarely a %) ─────────────────
function readProbe(dir) {
  const p = path.join(dir, "hq", "usage-snapshot.json");
  const j = readJson(p);
  const w = j?.windows?.five_hour;
  if (!w) return null;
  // utilization is a 0..1 fraction when present; scale to a percentage.
  const pct = typeof w.utilization === "number" ? Math.round(w.utilization * 100) : null;
  return {
    source: "probe",
    capturedAtMs: numOrNull(j.capturedAt),
    fiveHourPct: pct,
    fiveHourReset: sanitizeReset(secToMs(w.resetsAt)),
    status: w.status ?? null,
  };
}

// ── source 3: transcript token-tally proxy (fallback %) ──────────────────────
function proxyPct(dir, windowStartMs, windowEndMs, bucket) {
  const root = path.join(dir, "projects");
  let files;
  try {
    files = [];
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const dp = path.join(root, d.name);
      for (const f of fs.readdirSync(dp)) {
        if (!f.endsWith(".jsonl")) continue;
        const full = path.join(dp, f);
        const mt = mtimeMs(full);
        if (mt != null && mt >= windowStartMs) files.push(full);
      }
    }
  } catch {
    return null; // no projects/ here
  }
  if (!files.length) return { weighted: 0, pct: 0, files: 0 };

  const recs = new Map(); // dedupe by requestId (last-wins = final streamed totals)
  for (const file of files) {
    let text;
    try {
      const size = fs.statSync(file).size;
      if (size > 400 * 1024 * 1024) continue; // guard against a pathological file
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line.includes('"usage"')) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      const u = e?.message?.usage;
      const ts = Date.parse(e?.timestamp);
      if (!u || Number.isNaN(ts)) continue;
      if (ts < windowStartMs || ts > windowEndMs) continue;
      const id = e?.requestId ?? e?.message?.id ?? `_n${recs.size}`;
      recs.set(id, {
        model: e?.message?.model,
        input: u.input_tokens ?? 0,
        cw: u.cache_creation_input_tokens ?? 0,
        cr: u.cache_read_input_tokens ?? 0,
        out: u.output_tokens ?? 0,
      });
    }
  }
  let weighted = 0;
  for (const r of recs.values()) weighted += modelWeight(r.model) * shape(r.input, r.cw, r.cr, r.out);
  const budget = BUDGET[bucket] ?? BUDGET.unknown;
  return { weighted: Math.round(weighted), pct: Math.round((100 * weighted) / budget), files: files.length };
}

// ── verdict ──────────────────────────────────────────────────────────────────
function verdictOf(pct, status) {
  const s = String(status ?? "").toLowerCase();
  if (s && s !== "allowed") return "RED"; // rejected / out_of_credits / limited
  if (pct == null) return "UNKNOWN";
  if (pct >= RED) return "RED";
  if (pct >= AMBER) return "AMBER";
  return "GREEN";
}
const VERDICT_RANK = { GREEN: 0, AMBER: 10, RED: 20, UNKNOWN: 30 };

// ── assemble one account ─────────────────────────────────────────────────────
function readAccount(dir) {
  const cfgPath = configJsonFor(dir);
  const cfg = cfgPath ? readJson(cfgPath) : null;
  const email = cfg?.oauthAccount?.emailAddress ?? path.basename(dir);
  const tierStr = cfg?.oauthAccount?.organizationRateLimitTier ?? cfg?.oauthAccount?.organizationType ?? null;
  const bucket = tierBucket(tierStr);

  const status = readStatusline(dir);
  const probe = readProbe(dir);

  // pick the percentage source in priority order
  let pct = status?.fiveHourPct ?? probe?.fiveHourPct ?? null;
  let pctSource = pct != null ? (status?.fiveHourPct != null ? "statusline" : "probe") : null;
  let reset = status?.fiveHourReset ?? probe?.fiveHourReset ?? null;
  const rejected = probe?.status && String(probe.status).toLowerCase() !== "allowed" ? probe.status : null;

  // proxy fallback only when we have no real percentage
  let proxy = null;
  if (pct == null) {
    const windowEnd = now;
    const windowStart = reset ? reset - FIVE_HOUR_MS : now - FIVE_HOUR_MS;
    proxy = proxyPct(dir, windowStart, windowEnd, bucket);
    if (proxy && proxy.pct != null) {
      pct = proxy.pct;
      pctSource = "proxy";
    }
  }

  const capturedAt = status?.capturedAtMs ?? probe?.capturedAtMs ?? null;
  return {
    dir,
    email,
    tier: tierStr,
    bucket,
    fiveHourPct: pct,
    pctSource,
    isProxy: pctSource === "proxy",
    fiveHourReset: reset,
    sevenDayPct: status?.sevenDayPct ?? null,
    sevenDayReset: status?.sevenDayReset ?? null,
    status: rejected,
    capturedAt,
    ageMs: capturedAt ? now - capturedAt : null,
    sessionName: status?.sessionName ?? null,
    model: status?.model ?? null,
    sessionCostUsd: status?.sessionCostUsd ?? null,
    proxyWeighted: proxy?.weighted ?? null,
    verdict: verdictOf(pct, rejected),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function numOrNull(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}
function roundOrNull(v) {
  const n = numOrNull(v);
  return n == null ? null : Math.round(n);
}
function secToMs(v) {
  // rate-limit timestamps are unix seconds (~1.78e9). Guard against ms just in case.
  if (typeof v !== "number") return null;
  return v > 1e12 ? v : v * 1000;
}
// A valid 5h-window reset lies in the near future — from just-passed (grace for
// clock skew / a reset that just fired) up to a full 5h+ ahead. Anything older is
// STALE: the SessionStart hook memorializes the PREVIOUS window's reset from
// usage-snapshot.json (observed showing 02:00 ET when the live window actually
// resets 07:40 ET), so we reject a past reset rather than display a wrong time.
function sanitizeReset(ms) {
  if (ms == null) return null;
  const GRACE = 15 * 60 * 1000;
  if (ms < now - GRACE) return null; // stale / already elapsed
  if (ms > now + FIVE_HOUR_MS + GRACE) return null; // implausibly far out
  return ms;
}
function fmtReset(ms) {
  if (!ms) return "—";
  const mins = Math.round((ms - now) / 60000);
  const when = new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (mins <= 0) return `${when} (now)`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const rel = h > 0 ? `${h}h${m}m` : `${m}m`;
  return `${when} (in ${rel})`;
}
function fmtAge(ms) {
  if (ms == null) return "no snapshot";
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}
const useColor = process.stdout.isTTY && !process.argv.includes("--no-color");
const paint = (v) => {
  if (!useColor) return v;
  const c = { GREEN: 32, AMBER: 33, RED: 31, UNKNOWN: 90 }[v] ?? 0;
  return `[${c}m${v}[0m`;
};

// ── main ─────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const filterIdx = args.indexOf("--account");
  const filter = filterIdx >= 0 ? args[filterIdx + 1] : null;

  let dirs = discoverAccountDirs();
  let accounts = dirs.map(readAccount);
  if (filter) accounts = accounts.filter((a) => a.email.includes(filter) || a.dir.includes(filter));

  const worst = accounts.reduce((w, a) => Math.max(w, VERDICT_RANK[a.verdict] ?? 0), 0);
  const fleetVerdict = Object.entries(VERDICT_RANK).find(([, r]) => r === worst)?.[0] ?? "GREEN";

  if (asJson) {
    process.stdout.write(
      JSON.stringify(
        {
          generatedAt: new Date(now).toISOString(),
          thresholds: { amber: AMBER, red: RED },
          fleet: { verdict: fleetVerdict },
          accounts: accounts.map((a) => ({
            email: a.email,
            tier: a.tier,
            fiveHourPct: a.fiveHourPct,
            source: a.pctSource,
            isProxy: a.isProxy,
            fiveHourResetsAt: a.fiveHourReset ? new Date(a.fiveHourReset).toISOString() : null,
            sevenDayPct: a.sevenDayPct,
            status: a.status,
            snapshotAgeMs: a.ageMs,
            sessionName: a.sessionName,
            verdict: a.verdict,
          })),
        },
        null,
        2
      ) + "\n"
    );
    process.exit(worst);
  }

  // human table
  const rows = accounts.map((a) => {
    const email = a.email.length > 26 ? a.email.slice(0, 25) + "…" : a.email;
    const pct = a.fiveHourPct == null ? "  ?" : `${a.isProxy ? "~" : " "}${String(a.fiveHourPct).padStart(2)}%`;
    return {
      v: a.verdict,
      cells: [
        email.padEnd(26),
        (a.bucket === "max" ? "Max" : a.bucket === "pro" ? "Pro" : "?").padEnd(4),
        pct.padStart(5),
        (a.pctSource ?? "none").padEnd(10),
        fmtReset(a.fiveHourReset).padEnd(18),
        (a.sevenDayPct == null ? "—" : `${a.sevenDayPct}%`).padStart(4),
        fmtAge(a.ageMs).padEnd(12),
      ],
    };
  });

  const head = ["ACCOUNT", "TIER", "5H", "SOURCE", "5H RESET", "7D", "SNAPSHOT"];
  const widths = [26, 4, 5, 10, 18, 4, 12];
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
  const out = [];
  out.push("Leuk fleet fuel gauge  ·  " + new Date(now).toLocaleString());
  out.push("─".repeat(88));
  out.push(" ".repeat(9) + line(head)); // 9 = verdict col (8) + gap, so header aligns with data
  out.push("─".repeat(88));
  for (const r of rows) out.push(paint(r.v.padEnd(8)) + " " + r.cells.join("  "));
  out.push("─".repeat(88));
  out.push(`FLEET: ${paint(fleetVerdict)}   (thresholds: AMBER ≥${AMBER}%, RED ≥${RED}% of the 5h window)`);
  const anyProxy = accounts.some((a) => a.isProxy);
  if (anyProxy) out.push("~ = proxy estimate from transcript tokens (no live snapshot for that account; advisory only).");
  out.push("Policy: docs/ops/PACING.md   ·   JSON: node ops/usage-gauge.mjs --json");
  process.stdout.write(out.join("\n") + "\n");
  process.exit(worst);
}

main();
