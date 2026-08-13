#!/usr/bin/env node
// Harvest the five Anthem Plan-Net resources beyond PractitionerRole
// (NYS-53 epic): Location, Organization, OrganizationAffiliation,
// HealthcareService, InsurancePlan. Lands in sql/029 fhir_* tables.
//
//   node --env-file=.env.local scripts/ingest-anthem-resources.mjs \
//     --resource=<location|organization|orgaffiliation|healthcareservice|insuranceplan|all> \
//     [--concurrency=8] [--delay=0] [--limit=N] [--resume]
//
// Work items are enumerated from what we ALREADY know (cheap column reads, no
// jsonb scans): location_ref / org_affiliations.org_ref / payer_networks. Deref
// modes GET one resource per id; search modes page per-org; insuranceplan bulk-
// pages. Idempotent (id PK upsert). Resumable checkpoint in os.tmpdir(). Own
// OAuth client — does NOT touch the running PractitionerRole harvest's process.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? a.slice(n.length + 3) : d;
};
const RESOURCE = arg("resource", "");
const CONC = Number(arg("concurrency", 8));
const DELAY = Number(arg("delay", 0));
const LIMIT = Number(arg("limit", 0)) || 0;
const RESUME = process.argv.includes("--resume");
const BATCH = 500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOKEN_URL = "https://totalview.healthos.elevancehealth.com/client.oauth2/unregistered/api/v1/token";
const FHIR_BASE = "https://totalview.healthos.elevancehealth.com/resources/unregistered/api/v1/fhir/cms_mandate/mcd";
const ID = process.env.ANTHEM_CLIENT_ID, SECRET = process.env.ANTHEM_CLIENT_SECRET;
if (!ID || !SECRET) { console.error("ANTHEM_CLIENT_ID/SECRET not set"); process.exit(1); }

// ── auth (own token, auto-refresh) ───────────────────────────────────────────
let token = null, tokenExp = 0;
async function newToken() {
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: ID, client_secret: SECRET });
  let r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  if (r.status === 400 || r.status === 401) {
    const basic = Buffer.from(`${ID}:${SECRET}`).toString("base64");
    r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: `Basic ${basic}` }, body: new URLSearchParams({ grant_type: "client_credentials" }) });
  }
  const j = await r.json();
  if (!j?.access_token) throw new Error(`token failed HTTP ${r.status}`);
  token = j.access_token; tokenExp = Date.now() + 3300_000;
}
async function tok() { if (!token || Date.now() > tokenExp) await newToken(); return token; }

async function fhirRaw(pathOrUrl) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${FHIR_BASE}${pathOrUrl}`;
  for (let attempt = 0; ; attempt++) {
    const t = await tok();
    let r;
    try { r = await fetch(url, { headers: { Accept: "application/fhir+json", Authorization: `Bearer ${t}` } }); }
    catch (e) { if (attempt >= 6) throw e; await sleep(1000 * 2 ** attempt); continue; }
    if (r.status === 401) { token = null; if (attempt < 4) { await sleep(400); continue; } }
    if (r.status === 429 || r.status >= 500) { if (attempt >= 6) throw new Error(`HTTP ${r.status}`); await sleep(1000 * 2 ** attempt); continue; }
    if (r.status === 404 || r.status === 410) return { status: r.status, json: null };
    const txt = await r.text();
    try { return { status: r.status, json: JSON.parse(txt) }; }
    catch { throw new Error(`non-JSON HTTP ${r.status}: ${txt.slice(0, 120)}`); }
  }
}
async function fhirOne(p) { return (await fhirRaw(p)).json; }
async function searchAll(p) {
  const out = []; let url = p, pages = 0;
  while (url && pages < 500) {
    const b = (await fhirRaw(url)).json;
    for (const e of b?.entry ?? []) if (e.resource) out.push(e.resource);
    url = (b?.link ?? []).find((l) => l.relation === "next")?.url ?? null;
    pages++;
    if (LIMIT && out.length >= LIMIT) break;
  }
  return out;
}

// ── parse helpers ─────────────────────────────────────────────────────────────
const iso = (s) => (s ? new Date(s).toISOString() : null);
const nz = (a) => (a && a.length ? [...new Set(a)] : null);
const phone = (r) => (r.telecom ?? []).find((t) => t.system === "phone")?.value ?? null;
const addr = (a) => (a ? { address: (a.line ?? []).join(", ") || null, city: a.city ?? null, state: a.state ?? null, zip: (a.postalCode ?? "").replace(/[^0-9]/g, "").slice(0, 5) || null } : { address: null, city: null, state: null, zip: null });
const codings = (arr) => nz((arr ?? []).flatMap((cc) => (cc.coding ?? []).map((c) => c.display || c.code)).filter(Boolean));

function parseLoc(r) {
  const a = addr(r.address); const acc = [];
  for (const e of r.extension ?? []) if (typeof e.url === "string" && e.url.endsWith("/accessibility")) { const c = e.valueCodeableConcept?.coding?.[0]; if (c) acc.push(c.display || c.code); }
  return { id: r.id, name: r.name ?? null, phone: phone(r), ...a, lat: r.position?.latitude ?? null, lng: r.position?.longitude ?? null, accessibility: nz(acc), hours: r.hoursOfOperation ?? null, last_updated: iso(r.meta?.lastUpdated), raw: r };
}
function parseOrg(r) {
  const a = addr((r.address ?? [])[0]);
  const npi = (r.identifier ?? []).find((i) => /us-npi/i.test(i.system || "") || (i.type?.coding ?? []).some((c) => c.code === "NPI"))?.value ?? null;
  let tax = null;
  for (const e of r.extension ?? []) if (typeof e.url === "string" && e.url.endsWith("/qualification")) { let spec = false, code = null; for (const s of e.extension ?? []) { if (s.url === "identifier" && String(s.valueIdentifier?.value).toLowerCase() === "specialty") spec = true; if (s.url === "code") code = s.valueCodeableConcept?.coding?.[0]?.code; } if (spec && code) { tax = code; break; } }
  const type = r.type?.[0]?.coding?.[0]?.code ?? null;
  return { id: r.id, npi, name: r.name ?? null, org_type: type, is_network: type === "ntwk", taxonomy: tax, ...a, phone: phone(r), last_updated: iso(r.meta?.lastUpdated), raw: r };
}
function parseOrgAff(r) {
  return { id: r.id, primary_org_ref: r.organization?.reference ?? null, primary_org_display: r.organization?.display ?? null, participating_org_ref: r.participatingOrganization?.reference ?? null, participating_display: r.participatingOrganization?.display ?? null, network_refs: nz((r.network ?? []).map((n) => n.reference).filter(Boolean)), network_names: nz((r.network ?? []).map((n) => n.display).filter(Boolean)), location_refs: nz((r.location ?? []).map((l) => l.reference).filter(Boolean)), service_refs: nz((r.healthcareService ?? []).map((h) => h.reference).filter(Boolean)), specialties: codings(r.specialty), last_updated: iso(r.meta?.lastUpdated), raw: r };
}
function parseHcs(r) {
  const dm = [];
  for (const e of r.extension ?? []) if (typeof e.url === "string" && e.url.endsWith("/delivery-method")) for (const s of e.extension ?? []) if (s.url === "type") { const c = s.valueCodeableConcept?.coding?.[0]; if (c) dm.push(c.code || c.display); }
  return { id: r.id, org_ref: r.providedBy?.reference ?? null, location_refs: nz((r.location ?? []).map((l) => l.reference).filter(Boolean)), name: r.name ?? null, categories: codings(r.category), service_types: codings(r.type), specialties: codings(r.specialty), delivery_methods: nz(dm), telehealth: dm.some((x) => /virtual|telehealth/i.test(x)), languages: codings(r.communication), last_updated: iso(r.meta?.lastUpdated), raw: r };
}
function parsePlan(r) {
  const key = (r.identifier ?? []).find((i) => /plan/i.test(i.system || ""))?.value ?? r.identifier?.[0]?.value ?? null;
  return { id: r.id, plan_key: key, name: r.name ?? null, plan_type: r.type?.[0]?.coding?.[0]?.code ?? null, owned_by_ref: r.ownedBy?.reference ?? null, coverage_area: nz((r.coverageArea ?? []).map((c) => c.reference).filter(Boolean)), network_refs: nz((r.network ?? []).map((n) => n.reference).filter(Boolean)), last_updated: iso(r.meta?.lastUpdated), raw: r };
}

// ── generic batched upsert via jsonb_to_recordset ─────────────────────────────
const SPECS = {
  location: { table: "fhir_locations", cols: [["id", "text"], ["name", "text"], ["phone", "text"], ["address", "text"], ["city", "text"], ["state", "text"], ["zip", "text"], ["lat", "num"], ["lng", "num"], ["accessibility", "arr"], ["hours", "json"], ["last_updated", "ts"], ["raw", "json"]], parse: parseLoc },
  organization: { table: "fhir_organizations", cols: [["id", "text"], ["npi", "text"], ["name", "text"], ["org_type", "text"], ["is_network", "bool"], ["taxonomy", "text"], ["address", "text"], ["city", "text"], ["state", "text"], ["zip", "text"], ["phone", "text"], ["last_updated", "ts"], ["raw", "json"]], parse: parseOrg },
  orgaffiliation: { table: "fhir_org_affiliations", cols: [["id", "text"], ["primary_org_ref", "text"], ["primary_org_display", "text"], ["participating_org_ref", "text"], ["participating_display", "text"], ["network_refs", "arr"], ["network_names", "arr"], ["location_refs", "arr"], ["service_refs", "arr"], ["specialties", "arr"], ["last_updated", "ts"], ["raw", "json"]], parse: parseOrgAff },
  healthcareservice: { table: "fhir_healthcare_services", cols: [["id", "text"], ["org_ref", "text"], ["location_refs", "arr"], ["name", "text"], ["categories", "arr"], ["service_types", "arr"], ["specialties", "arr"], ["delivery_methods", "arr"], ["telehealth", "bool"], ["languages", "arr"], ["last_updated", "ts"], ["raw", "json"]], parse: parseHcs },
  insuranceplan: { table: "fhir_insurance_plans", cols: [["id", "text"], ["plan_key", "text"], ["name", "text"], ["plan_type", "text"], ["owned_by_ref", "text"], ["coverage_area", "arr"], ["network_refs", "arr"], ["last_updated", "ts"], ["raw", "json"]], parse: parsePlan },
};
const PGTYPE = { text: "text", num: "double precision", ts: "timestamptz", bool: "boolean", arr: "jsonb", json: "jsonb" };
function insertSql(spec) {
  const defs = spec.cols.map(([n, k]) => `${n} ${PGTYPE[k]}`).join(", ");
  const sel = spec.cols.map(([n, k]) => (k === "arr" ? `CASE WHEN jsonb_typeof(x.${n})='array' THEN ARRAY(SELECT jsonb_array_elements_text(x.${n})) END AS ${n}` : `x.${n}`)).join(", ");
  const names = spec.cols.map(([n]) => n).join(", ");
  const upd = spec.cols.filter(([n]) => n !== "id").map(([n]) => `${n}=EXCLUDED.${n}`).concat("ingested_at=now()").join(", ");
  return `INSERT INTO ${spec.table} (${names}) SELECT ${sel} FROM jsonb_to_recordset($1::jsonb) AS x(${defs}) ON CONFLICT (id) DO UPDATE SET ${upd}`;
}
async function upsert(spec, rows) {
  if (!rows.length) return 0;
  const byId = new Map(); for (const r of rows) byId.set(r.id, r); // dedup within batch
  const uniq = [...byId.values()];
  await sql.query(insertSql(spec), [JSON.stringify(uniq)]);
  return uniq.length;
}

// ── enumeration (cheap column reads) ──────────────────────────────────────────
const srcRow = await sql`SELECT id FROM payer_sources WHERE slug='anthem'`;
const anthemId = srcRow[0].id;
async function orgIds() {
  const rows = await sql`
    SELECT DISTINCT ref FROM (
      SELECT org_ref AS ref FROM org_affiliations WHERE payer_source_id=${anthemId}
      UNION
      SELECT raw_network_id FROM payer_networks WHERE payer_source_id=${anthemId} AND raw_network_id IS NOT NULL
    ) u WHERE ref LIKE 'Organization/%'`;
  return rows.map((r) => r.ref);
}
async function locIds() {
  const rows = await sql`SELECT DISTINCT location_ref AS ref FROM provider_network_participation WHERE payer_source_id=${anthemId} AND location_ref LIKE 'Location/%'`;
  return rows.map((r) => r.ref);
}
const bare = (ref) => ref.split("/").pop();
const RES = {
  location: { enumerate: locIds, fetch: async (ref) => { const j = await fhirOne(`/${ref}`); return j ? [j] : []; } },
  organization: { enumerate: orgIds, fetch: async (ref) => { const j = await fhirOne(`/${ref}`); return j ? [j] : []; } },
  orgaffiliation: { enumerate: orgIds, fetch: async (ref) => { const id = bare(ref); return [...await searchAll(`/OrganizationAffiliation?participating-organization=${id}&_count=100`), ...await searchAll(`/OrganizationAffiliation?primary-organization=${id}&_count=100`)]; } },
  healthcareservice: { enumerate: orgIds, fetch: async (ref) => searchAll(`/HealthcareService?organization=${bare(ref)}&_count=100`) },
  insuranceplan: { enumerate: async () => ["*"], fetch: async () => searchAll(`/InsurancePlan?_count=100`) },
};

// ── runner ────────────────────────────────────────────────────────────────────
async function runOne(name) {
  const cfg = RES[name], spec = SPECS[name];
  const ckPath = path.join(os.tmpdir(), `leuk-anthem-${name}.json`);
  const done = RESUME && fs.existsSync(ckPath) ? new Set(JSON.parse(fs.readFileSync(ckPath, "utf8"))) : new Set();
  let items = await cfg.enumerate();
  items = items.filter((i) => !done.has(i));
  if (LIMIT) items = items.slice(0, LIMIT);
  console.log(`\n▶ ${name}: ${items.length} work items${done.size ? ` (${done.size} already done)` : ""}`);
  let idx = 0, processed = 0, upserted = 0, pending = [];
  async function flush() { if (pending.length) { upserted += await upsert(spec, pending); pending = []; } }
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      try {
        const resources = await cfg.fetch(item);
        for (const r of resources) { const row = spec.parse(r); if (row?.id) pending.push(row); }
        if (pending.length >= BATCH) await flush();
      } catch (e) { console.error(`  ! ${item}: ${e.message}`); }
      done.add(item); processed++;
      if (processed % 100 === 0) { fs.writeFileSync(ckPath, JSON.stringify([...done])); process.stdout.write(`\r  ${processed}/${items.length} · ${upserted} rows…`); }
      if (DELAY) await sleep(DELAY);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONC) }, worker));
  await flush();
  fs.writeFileSync(ckPath, JSON.stringify([...done]));
  console.log(`\n✓ ${name}: ${processed} items processed · ${upserted} rows upserted → ${spec.table}`);
}

const targets = RESOURCE === "all" ? Object.keys(RES) : [RESOURCE];
if (!targets.every((t) => RES[t])) { console.error(`--resource must be one of: ${Object.keys(RES).join(", ")}, all`); process.exit(1); }
for (const t of targets) await runOne(t);
console.log("\nDONE.");
