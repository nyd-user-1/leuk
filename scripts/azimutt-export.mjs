#!/usr/bin/env node
// azimutt-export.mjs — emit docs/leuk-schema.azimutt.json for import into
// Azimutt (azimutt.app). READ-ONLY introspection of the live Neon schema, in the
// exact same spirit as scripts/db-atlas.mjs. It never writes to the database.
//
//   node --env-file=.env.local scripts/azimutt-export.mjs
//
// Why this exists: our schema is ingest-heavy and declares almost no foreign-key
// constraints (the rate/directory/reference tables are bulk-loaded, not
// transactional), so Azimutt — which only draws DECLARED relations — renders the
// tables as a field of unconnected islands. This script emits the tables AND a
// rich `relations` array so the founder gets a connected map:
//
//   1. Real FK constraints from pg_catalog (pg_constraint contype='f').
//   2. Inferred relations from the join knowledge in lib/table-atlas.mjs (the
//      shared registry that also feeds db-atlas + the /admin data dictionary),
//      expressed as convention hubs below (npi, tin, ein, billing_code, …).
//   3. Convention-inferred relations from column-name matches we can defend
//      (client_id → clients.id, actor_id → users.id, naic → insurer_companies, …).
//
// Precedence: a real FK always wins. A column that already carries a real FK is
// never given a second, inferred edge, and no table-pair is connected twice.
//
// Output shape mirrors Azimutt's legacy JSON importer (the shape the existing
// docs/leuk-schema.azimutt.json already imports cleanly):
//   { tables:   [{ schema, table, columns:[{name,type,nullable}], primaryKey:{name,columns}, comment }],
//     relations:[{ name, src:{schema,table,column}, ref:{schema,table,column} }] }
//
// Only docs/leuk-schema.azimutt.json is written (overwritten). The
// docs/leuk-schema.authoritative.azimutt.json variant is left untouched.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { TABLE_GROUPS } from "../lib/table-atlas.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "leuk-schema.azimutt.json");
const SCHEMA = "public";
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set — run with node --env-file=.env.local scripts/azimutt-export.mjs");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// Table meaning → Azimutt table `comment`, from the shared registry (same source
// db-atlas reads). Tables absent from the registry fall back to a DB comment.
const MEANING = new Map();
for (const g of TABLE_GROUPS) for (const t of g.tables) MEANING.set(t.name, t.meaning);

// ── inferred-relation hubs ────────────────────────────────────────────────────
// Each hub says: any table carrying `col` (that isn't the hub itself, and doesn't
// already carry a real FK on that column) references `ref.table(ref.col)`. This
// encodes both the lib/table-atlas.mjs join graph (npi/tin/ein/billing_code/
// insurer_id/network_id/payer_source_id) and defensible column-name conventions.
// The ref column is the hub's real identity column (verified live before use).
const HUBS = [
  // — the ingest-side stars the atlas is built around —
  { col: "npi", ref: { table: "directory_providers", col: "npi" } }, // the NY provider book everything keys on
  { col: "tin", ref: { table: "tin_registry", col: "tin_norm" } }, // billing-TIN → business-name registry
  { col: "ein", ref: { table: "employers", col: "ein" } }, // plan sponsor (EIN is employers' PK)
  { col: "billing_code", ref: { table: "cpt_codes", col: "code" } }, // our behavioral CPT label set
  // — the insurance graph —
  { col: "insurer_id", ref: { table: "insurers", col: "id" } },
  { col: "network_id", ref: { table: "networks", col: "id" } }, // canonical networks (fires only where no FK claims it)
  { col: "payer_source_id", ref: { table: "payer_sources", col: "id" } },
  // — EHR / app foreign-key-shaped columns not declared as constraints —
  { col: "client_id", ref: { table: "clients", col: "id" } },
  { col: "user_id", ref: { table: "users", col: "id" } },
  { col: "payer_id", ref: { table: "payers", col: "id" } },
  { col: "actor_id", ref: { table: "users", col: "id" } }, // audit_events actor
  // — reference-vocabulary joins (de-island the code/taxonomy/insurer tables) —
  { col: "hcpcs_code", ref: { table: "cpt_codes", col: "code" } }, // cms_rvu → the code label set
  { col: "primary_taxonomy", ref: { table: "nucc_taxonomy", col: "code" } }, // provider taxonomy → NUCC vocab
  { col: "naic", ref: { table: "insurer_companies", col: "naic" } }, // dfs_insurers → NAIC company record
];

// ── introspection (read-only) ─────────────────────────────────────────────────
async function introspect() {
  const rels = await sql`
    SELECT c.relname AS name, c.relkind AS kind
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${SCHEMA} AND c.relkind IN ('r', 'm')
    ORDER BY c.relname`;

  const cols = await sql`
    SELECT c.relname AS tbl, a.attname AS col,
           format_type(a.atttypid, a.atttypmod) AS type, NOT a.attnotnull AS nullable, a.attnum AS ord
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = ${SCHEMA} AND c.relkind IN ('r', 'm') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum`;

  // Primary keys (tables only; matviews have none).
  const pks = await sql`
    SELECT c.relname AS tbl, con.conname AS name,
           (SELECT array_agg(att.attname ORDER BY k.ord)
              FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
              JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum) AS cols
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'p' AND n.nspname = ${SCHEMA}`;

  // Foreign keys, expanded to aligned (src col ↔ ref col) pairs.
  const fkRows = await sql`
    SELECT con.conname AS name, c.relname AS src_tbl, cf.relname AS ref_tbl,
           con.conkey AS src_attnums, con.confkey AS ref_attnums,
           c.oid AS src_oid, cf.oid AS ref_oid
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_class cf ON cf.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f' AND n.nspname = ${SCHEMA}
    ORDER BY con.conname`;

  // Table comments, only for tables not covered by the atlas meaning.
  const comments = await sql`
    SELECT c.relname AS tbl, obj_description(c.oid) AS comment
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${SCHEMA} AND c.relkind IN ('r', 'm') AND obj_description(c.oid) IS NOT NULL`;

  // attnum → name map per relation oid, so we can resolve FK column numbers.
  const attByOid = new Map();
  const oidRows = await sql`
    SELECT c.oid, a.attnum, a.attname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = ${SCHEMA} AND c.relkind IN ('r', 'm') AND a.attnum > 0 AND NOT a.attisdropped`;
  for (const r of oidRows) {
    if (!attByOid.has(r.oid)) attByOid.set(r.oid, new Map());
    attByOid.get(r.oid).set(Number(r.attnum), r.attname);
  }

  return { rels, cols, pks, fkRows, comments, attByOid };
}

function build({ rels, cols, pks, fkRows, comments, attByOid }) {
  const present = rels.filter((r) => SAFE_IDENT.test(r.name));
  const liveNames = new Set(present.map((r) => r.name));

  const colsByTable = new Map();
  for (const c of cols) {
    if (!colsByTable.has(c.tbl)) colsByTable.set(c.tbl, []);
    colsByTable.get(c.tbl).push({ name: c.col, type: c.type, nullable: c.nullable });
  }
  const colNames = new Map(); // table → Set(column)
  for (const [t, cs] of colsByTable) colNames.set(t, new Set(cs.map((c) => c.name)));

  const pkByTable = new Map();
  for (const p of pks) pkByTable.set(p.tbl, { name: p.name, columns: p.cols ?? [] });

  const dbComment = new Map();
  for (const c of comments) dbComment.set(c.tbl, c.comment);

  // ── tables[] in Azimutt shape ──
  const tables = present.map((r) => {
    const t = {
      schema: SCHEMA,
      table: r.name,
      columns: colsByTable.get(r.name) ?? [],
    };
    const pk = pkByTable.get(r.name);
    if (pk && pk.columns.length) t.primaryKey = pk;
    const comment = MEANING.get(r.name) ?? dbComment.get(r.name);
    if (comment) t.comment = comment;
    return t;
  });

  // ── relations[] ──
  const relations = [];
  const claimed = new Set(); // `table.column` already used as an FK source
  const pairKey = (a, b) => [a, b].sort().join("|");
  const seenPairs = new Set(); // unordered table-column pairs (no duplicate lines)

  const has = (table, col) => colNames.get(table)?.has(col);

  // (1) real FK constraints
  let fkCount = 0;
  for (const fk of fkRows) {
    if (!liveNames.has(fk.src_tbl) || !liveNames.has(fk.ref_tbl)) continue;
    const srcAtt = attByOid.get(fk.src_oid);
    const refAtt = attByOid.get(fk.ref_oid);
    const srcNums = fk.src_attnums ?? [];
    const refNums = fk.ref_attnums ?? [];
    for (let i = 0; i < srcNums.length; i++) {
      const srcCol = srcAtt?.get(Number(srcNums[i]));
      const refCol = refAtt?.get(Number(refNums[i]));
      if (!srcCol || !refCol) continue;
      relations.push({
        name: fk.name,
        src: { schema: SCHEMA, table: fk.src_tbl, column: srcCol },
        ref: { schema: SCHEMA, table: fk.ref_tbl, column: refCol },
      });
      claimed.add(`${fk.src_tbl}.${srcCol}`);
      seenPairs.add(pairKey(`${fk.src_tbl}.${srcCol}`, `${fk.ref_tbl}.${refCol}`));
      fkCount++;
    }
  }

  // (2)+(3) inferred hubs — skip any source column already carrying a real FK,
  // any hub whose ref column isn't live, and any pair already connected.
  let inferredCount = 0;
  const liveHubs = HUBS.filter((h) => has(h.ref.table, h.ref.col));
  for (const r of present) {
    const cset = colNames.get(r.name);
    if (!cset) continue;
    for (const h of liveHubs) {
      if (r.name === h.ref.table) continue; // no self-reference
      if (!cset.has(h.col)) continue;
      const srcId = `${r.name}.${h.col}`;
      if (claimed.has(srcId)) continue; // a real FK already owns this column
      const refId = `${h.ref.table}.${h.ref.col}`;
      const pk = pairKey(srcId, refId);
      if (seenPairs.has(pk)) continue;
      relations.push({
        name: `logical_${r.name}_${h.col}`,
        src: { schema: SCHEMA, table: r.name, column: h.col },
        ref: { schema: SCHEMA, table: h.ref.table, column: h.ref.col },
      });
      claimed.add(srcId);
      seenPairs.add(pk);
      inferredCount++;
    }
  }

  // islands: tables touched by no relation
  const connected = new Set();
  for (const rel of relations) {
    connected.add(rel.src.table);
    connected.add(rel.ref.table);
  }
  const islands = present.map((r) => r.name).filter((n) => !connected.has(n));

  return { doc: { tables, relations }, stats: { tables: tables.length, matviews: present.filter((r) => r.kind === "m").length, fkCount, inferredCount, islands } };
}

// ── run ───────────────────────────────────────────────────────────────────────
const intro = await introspect();
const { doc, stats } = build(intro);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");

console.log(`azimutt-export: ${stats.tables} tables (${stats.matviews} matviews), ${doc.relations.length} relations — ${stats.fkCount} real FK + ${stats.inferredCount} inferred.`);
console.log(`  → ${path.relative(ROOT, OUT)}`);
if (stats.islands.length) {
  console.log(`  ${stats.islands.length} island tables (no relation): ${stats.islands.join(", ")}`);
}
