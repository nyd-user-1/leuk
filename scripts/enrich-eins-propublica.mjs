#!/usr/bin/env node
// Name unnamed ein-type billing groups from IRS exempt-organization data, via
// the ProPublica Nonprofit Explorer API.
//
//   node --env-file=.env.local scripts/enrich-eins-propublica.mjs            # fetch, then load
//   node --env-file=.env.local scripts/enrich-eins-propublica.mjs --fetch-only
//   node --env-file=.env.local scripts/enrich-eins-propublica.mjs --load-only # from the JSON, no API
//   node --env-file=.env.local scripts/enrich-eins-propublica.mjs --dry-run   # no writes
//
// ── WHY THIS WORKS WHERE THE OTHER ROUTES DON'T ────────────────────────────
// NPPES suppresses EINs — 0 of 9.67M rows carry one — so an ein-type identifier
// cannot be looked up there, at all. scripts/nppes-name-groups.mjs gets at the
// name sideways, through a roster member's practice address, and that inference
// breaks exactly where the groups get interesting: a multi-site faculty practice
// has no shared desk (one EIN spans Boston, Brighton and Rochester), and a
// clinician working inside a CVS gets her EIN named "CVS PHARMACY".
//
// This route has no inference in it. The payer published an EIN; the IRS
// publishes that same EIN's legal name. It is a lookup on the exact identifier,
// which makes it BETTER evidence than anything the address route can produce —
// and it is why the 07-15 report's dismissal of IRS EO data ("nonprofits only")
// was the right reason to reject it as the SPINE and the wrong reason to skip it
// as a supplement.
//
// ── WHAT IT CANNOT DO, BY CONSTRUCTION ─────────────────────────────────────
// Only 501(c) organizations file 990s. Every for-profit LLC / PLLC / MSO group
// — which is most of behavioural health — is simply absent, and will MISS. That
// is expected, not a failure, and the misses are the honest input to a later
// pass (OpenCorporates / state registries). A low hit rate here is information
// about the corpus, not about the script.
//
// Idempotent in two directions: the results JSON is the audit trail AND the
// re-run input (--load-only never touches the network), and every INSERT is
// ON CONFLICT (tin_norm) DO NOTHING, so existing names always win.

import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const argv = process.argv;
const DRY_RUN = argv.includes("--dry-run");
const FETCH_ONLY = argv.includes("--fetch-only");
const LOAD_ONLY = argv.includes("--load-only");
const RESULTS = "scripts/ein-enrichment-results.json";

const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── targets ─────────────────────────────────────────────────────────────────
// The EXACT tin string is carried through to the load. provider_rate_signals
// stores 'ein:010459837' with its leading zero; the API answers on 010459837 and
// echoes 10459837. Reconstructing the key from either of those would miss the
// row it is meant to name — so the DB's own value is the key, start to finish.
async function targets() {
  const rows = await sql`
    SELECT r.tin, replace(r.tin, 'ein:', '') AS ein
    FROM (
      SELECT tin FROM provider_rate_signals
      WHERE lower(billing_class) = 'professional'
        AND negotiated_type NOT ILIKE '%percent%'
        AND negotiated_rate > 5
      GROUP BY tin
    ) r
    LEFT JOIN tin_registry t ON t.tin_norm = r.tin
    WHERE t.business_name IS NULL AND r.tin LIKE 'ein:%'
    ORDER BY r.tin`;
  return rows;
}

// ── one EIN ─────────────────────────────────────────────────────────────────
const URL = (ein) => `https://projects.propublica.org/nonprofits/api/v2/organizations/${ein}.json`;

/** GET with backoff. Returns {status, org} — throws only on a dead network. */
async function get(ein) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(URL(ein), {
        headers: { "user-agent": "leuk-rate-research/1.0 (+brendan@nysgpt.com)" },
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      if (attempt >= 4) throw e;
      await sleep(500 * 2 ** attempt);
      continue;
    }
    // 429/5xx are "ask again later", not answers. 404 IS an answer: not in EO data.
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (res.status !== 200) return { status: res.status, org: null };
    try {
      const j = await res.json();
      return { status: 200, org: j?.organization ?? null };
    } catch {
      return { status: 200, org: null };
    }
  }
}

/**
 * Padded first, then raw. A 9-digit EIN with a leading zero is the whole reason:
 * 7 of our 2,064 targets are stored 8-digit because something upstream ate the
 * zero, and the API only answers on the true 9-digit number.
 */
async function lookup(ein) {
  const padded = ein.padStart(9, "0");
  let r = await get(padded);
  if (r.status === 200 && r.org?.name) return { ...r, tried: padded };
  if (padded !== ein) {
    const r2 = await get(ein);
    if (r2.status === 200 && r2.org?.name) return { ...r2, tried: ein };
  }
  return { ...r, tried: padded };
}

// ── fetch pass ──────────────────────────────────────────────────────────────
async function fetchAll(rows) {
  const out = [];
  let hits = 0, misses = 0, errors = 0, done = 0;
  const CONCURRENCY = 5;
  const MIN_INTERVAL_MS = 200; // 5 req/s across all workers — a free public API.
  let nextSlot = Date.now();
  const slot = () => {
    const wait = Math.max(0, nextSlot - Date.now());
    nextSlot = Math.max(Date.now(), nextSlot) + MIN_INTERVAL_MS;
    return sleep(wait);
  };

  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= rows.length) return;
      const { tin, ein } = rows[i];
      await slot();
      let r;
      try {
        r = await lookup(ein);
      } catch (e) {
        errors++;
        out.push({ tin, ein, hit: false, name: null, city: null, state: null, http_status: 0, error: String(e.message ?? e) });
        // A handful of network blips is normal; a wall of them means the API is
        // gone and every remaining row would be recorded as a miss — which would
        // quietly poison the audit trail. Fail loudly instead.
        if (errors > 20 && errors > done * 0.1) {
          throw new Error(`ProPublica unreachable: ${errors} errors in ${done} calls — aborting rather than recording misses`);
        }
        done++;
        continue;
      }
      const org = r.org;
      const hit = r.status === 200 && !!org?.name;
      if (hit) hits++;
      else misses++;
      out.push({
        tin,
        ein,
        hit,
        name: hit ? org.name : null,
        city: hit ? (org.city ?? null) : null,
        state: hit ? (org.state ?? null) : null,
        http_status: r.status,
      });
      done++;
      if (done % 100 === 0) {
        console.log(`  ${done}/${rows.length} · ${hits} hits (${pct(hits, done)}) · ${misses} misses · ${errors} errors [${elapsed()}]`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`fetch done: ${hits} hits / ${misses} misses / ${errors} errors of ${rows.length} [${elapsed()}]`);
  return out;
}

// ── load pass ───────────────────────────────────────────────────────────────
// ON CONFLICT DO NOTHING: this only ever names the currently-unnamed, and an
// existing name — a seed, an NPPES legal name, an MRF attestation — always wins.
async function load(results) {
  const hits = results.filter((r) => r.hit && r.name);
  if (!hits.length) return 0;
  let inserted = 0;
  for (let i = 0; i < hits.length; i += 500) {
    const c = hits.slice(i, i + 500);
    const r = await sql.query(
      `INSERT INTO tin_registry (tin_norm, business_name, source, first_seen, last_seen)
       SELECT tin, name, 'irs_eo', CURRENT_DATE, CURRENT_DATE
       FROM unnest($1::text[], $2::text[]) AS t(tin, name)
       ON CONFLICT (tin_norm) DO NOTHING
       RETURNING 1`,
      [c.map((x) => x.tin), c.map((x) => x.name)],
    );
    inserted += r.length;
  }
  return inserted;
}

// ── run ─────────────────────────────────────────────────────────────────────
const rows = await targets();
console.log(`• ${rows.length} unnamed ein-type billing groups on the rate corpus [${elapsed()}]`);

let results;
if (LOAD_ONLY) {
  if (!fs.existsSync(RESULTS)) {
    console.error(`--load-only but ${RESULTS} does not exist`);
    process.exit(1);
  }
  results = JSON.parse(fs.readFileSync(RESULTS, "utf8"));
  console.log(`  loaded ${results.length} prior results from ${RESULTS} (no API calls)`);
} else {
  results = await fetchAll(rows);
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 1));
  console.log(`  wrote ${RESULTS} (audit trail + --load-only input)`);
}

const hits = results.filter((r) => r.hit);
const misses = results.filter((r) => !r.hit);

// The join key round-trips or nothing below is trustworthy. Named case, verified
// against the API by hand: ein:010459837 = Eastern Maine Healthcare Systems.
const canary = results.find((r) => r.tin === "ein:010459837");
console.log(
  `\ncanary ein:010459837 -> ${canary ? `${canary.hit ? "HIT" : "MISS"} ${JSON.stringify(canary.name)}` : "NOT IN TARGET SET (already named?)"}`,
);

if (FETCH_ONLY || DRY_RUN) {
  console.log(`\n${DRY_RUN ? "--dry-run" : "--fetch-only"}: no writes. ${hits.length} would be inserted.`);
  process.exit(0);
}

const before = (await sql`SELECT count(*)::int AS n FROM tin_registry`)[0].n;
const inserted = await load(results);
const after = (await sql`SELECT count(*)::int AS n FROM tin_registry`)[0].n;

// Did they actually resolve? Re-ask the original question rather than trusting
// the insert count — a name that lands under the wrong key names nothing.
const stillUnnamed = (
  await sql`
    SELECT count(*)::int AS n
    FROM (
      SELECT tin FROM provider_rate_signals
      WHERE lower(billing_class) = 'professional'
        AND negotiated_type NOT ILIKE '%percent%'
        AND negotiated_rate > 5
      GROUP BY tin
    ) r
    LEFT JOIN tin_registry t ON t.tin_norm = r.tin
    WHERE t.business_name IS NULL AND r.tin LIKE 'ein:%'`
)[0].n;

console.log(`
── result ──────────────────────────────────────────────────────────
attempted        ${results.length}
hits (named)     ${hits.length}  (${pct(hits.length, results.length)})
misses           ${misses.length}  (${pct(misses.length, results.length)})  <- for-profit remainder
tin_registry     ${before} -> ${after}  (+${inserted} inserted, source 'irs_eo')
unnamed ein TINs ${rows.length} -> ${stillUnnamed}
[${elapsed()}]`);
