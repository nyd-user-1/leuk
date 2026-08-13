#!/usr/bin/env node
// Manual smoke test for Farmer John (app/api/harvest/report). POSTs one fake
// failed job and one fake ok job straight at the deployed route — the ok job
// proves the no-op path, the failed one should produce a real Linear issue
// titled "[Farmer John] test:smoke-<timestamp> — needs attention" on team NYS.
// Run twice in a row to see it comment on the SAME issue instead of duplicating.
//
// Usage: node --env-file=.env.local scripts/test-harvest-report.mjs

const url = process.env.LEUK_APP_URL;
const secret = process.env.CRON_SECRET;
if (!url || !secret) {
  console.error("Need LEUK_APP_URL and CRON_SECRET in the environment (use --env-file=.env.local).");
  process.exit(1);
}

const jobId = `test:smoke-${Date.now()}`;
const results = [
  { id: jobId, ok: false, note: "smoke test — this is a deliberately fake failure, safe to close", logFile: "n/a" },
  { id: "test:smoke-ok", ok: true, note: "ok" },
];

console.log(`POSTing to ${url}/api/harvest/report ...`);
const res = await fetch(`${url.replace(/\/$/, "")}/api/harvest/report`, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({ results }),
});

const body = await res.text();
console.log(`Status: ${res.status}`);
console.log(body);

if (res.ok) {
  console.log(`\nIf this worked, check Linear team NYS for an issue titled "[Farmer John] ${jobId} — needs attention".`);
}
