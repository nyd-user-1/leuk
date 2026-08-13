#!/usr/bin/env node
// db-atlas.mjs — the Database Atlas generator. READ-ONLY introspection of the
// live schema → docs/data/DATABASE.md + one Obsidian note per table (with
// [[wiki-links]] between joined tables, so the founder's graph view shows the
// schema).
//
//   node --env-file=.env.local scripts/db-atlas.mjs
//
// It never writes to the database. Three cheap round trips do the whole job:
//   1. pg_class    — every public table + matview, its kind, and the planner's
//                    row ESTIMATE (reltuples). We never count(*) the 9M-row
//                    tables; big relations report the estimate, small ones get
//                    an exact count in one batched query.
//   2. pg_attribute — every column of every table AND matview (matviews are
//                     absent from information_schema.columns, so this is the
//                     one source that covers both).
//   3. pg_constraint — foreign keys, merged into the hand-maintained join graph.
//
// The domain grouping, per-table meaning, and "which page consumes it" metadata
// below MIRROR lib/repos/admin.ts (platformInventory) — that repo function is
// the app's authority (it powers /workspace' Observatory and /admin/data); this
// is the atlas's copy of the same knowledge. Keep them in step: a table added
// there wants a line here. Tables present in the DB but absent from the metadata
// still appear, under "Unmapped tables", with their columns and count — so the
// atlas can never silently omit something the schema grew.
//
// The matview refresh registry is READ from the shared rebuild plan
// (ops/harvest/sync-plan.mjs VIEWS array) rather than restated, so this stays
// honest if that list changes. The nightly cron and the harvest runner both
// import that one array (NYS-129, the no-fork guarantee), so reading it is the
// same as reading what the cron actually refreshes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { TABLE_GROUPS } from "../lib/table-atlas.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_MD = path.join(ROOT, "docs", "data", "DATABASE.md");
const VAULT_DIR = path.join(os.homedir(), "Vaults", "hq", "leuk", "atlas");
const SYNC_PLAN = path.join(ROOT, "ops", "harvest", "sync-plan.mjs");
const BIG_ROW_THRESHOLD = 500_000; // above this we trust the estimate, never count(*)
const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set — run with node --env-file=.env.local scripts/db-atlas.mjs");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);

// ── the metadata: THE shared registry (lib/table-atlas.mjs) ───────────────────
// Table meaning, domain, page and join graph now live in exactly one module,
// read by both this generator and lib/repos/admin.ts (the /admin/data dictionary
// + the Observatory). This script needs `powers` as the bare href string; the
// shared module carries it as { href, label } for the app, so flatten it here.
// Everything downstream (META, joinsFor, the rendering) is unchanged: it reads
// name, meaning, sql, keys, joins. Matviews are detected from the catalog, not
// declared; join edges are undirected — declaring A→B is enough.
const GROUPS = TABLE_GROUPS.map((g) => ({
  title: g.title,
  blurb: g.blurb,
  tables: g.tables.map((t) => ({
    name: t.name,
    sql: t.sql,
    meaning: t.meaning,
    powers: t.powers ? t.powers.href : null,
    keys: t.keys,
    joins: t.joins,
  })),
}));

// Flatten the metadata into a lookup, and record each table's domain.
const META = new Map();
for (const g of GROUPS) for (const t of g.tables) META.set(t.name, { ...t, domain: g.title });

// ── introspection ────────────────────────────────────────────────────────────
async function introspect() {
  const relations = await sql`
    SELECT c.relname AS name, c.relkind AS kind, GREATEST(c.reltuples, -1)::bigint AS est
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'm')
    ORDER BY c.relname`;

  const cols = await sql`
    SELECT c.relname AS tbl, a.attname AS col, format_type(a.atttypid, a.atttypmod) AS type, a.attnum AS ord
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'm') AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY c.relname, a.attnum`;

  const fks = await sql`
    SELECT c.relname AS tbl, cf.relname AS ref
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_class cf ON cf.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE con.contype = 'f' AND n.nspname = 'public'`;

  // Exact counts only for the small relations (never the big ones).
  const present = relations.filter((r) => SAFE_IDENT.test(r.name));
  const small = present.filter((r) => Number(r.est) < BIG_ROW_THRESHOLD).map((r) => r.name);
  let exact = {};
  if (small.length) {
    const q = "SELECT " + small.map((t) => `(SELECT count(*) FROM ${t}) AS "${t}"`).join(", ");
    exact = (await sql.query(q, []))[0] ?? {};
  }

  const columns = new Map();
  for (const c of cols) {
    if (!columns.has(c.tbl)) columns.set(c.tbl, []);
    columns.get(c.tbl).push({ name: c.col, type: c.type });
  }

  const fkEdges = new Map();
  for (const f of fks) {
    if (f.tbl === f.ref) continue;
    if (!fkEdges.has(f.tbl)) fkEdges.set(f.tbl, new Set());
    fkEdges.get(f.tbl).add(f.ref);
  }

  return present.map((r) => {
    const big = Number(r.est) >= BIG_ROW_THRESHOLD;
    const exactN = exact[r.name];
    return {
      name: r.name,
      kind: r.kind === "m" ? "matview" : "table",
      rows: big || exactN == null ? Number(r.est) : Number(exactN),
      rowKind: big || exactN == null ? "estimate" : "exact",
      columns: columns.get(r.name) ?? [],
      fkRefs: fkEdges.get(r.name) ?? new Set(),
    };
  });
}

// Read the shared rebuild plan's VIEWS array — the refresh registry, not
// restated. The array lives in ops/harvest/sync-plan.mjs as
// `export const VIEWS = [ … ];` (the cron route imports it), so slice from the
// declaration to its closing `];`.
function cronViews() {
  try {
    const src = fs.readFileSync(SYNC_PLAN, "utf8");
    const start = src.indexOf("const VIEWS");
    if (start < 0) return new Set();
    const block = src.slice(start, src.indexOf("];", start));
    return new Set([...block.matchAll(/"([a-z_][a-z0-9_]*)"/g)].map((m) => m[1]));
  } catch {
    return new Set();
  }
}

// ── formatting ────────────────────────────────────────────────────────────────
const commas = (n) => Number(n).toLocaleString("en-US");
function rowLabel(rel) {
  if (rel.rows < 0) return "—";
  return rel.rowKind === "estimate" ? `≈ ${commas(rel.rows)}` : commas(rel.rows);
}

// Undirected join graph, restricted to relations that actually exist, merging
// declared joins with detected FKs. Returns [{table, via}] for one table.
function joinsFor(name, liveNames) {
  const out = new Map();
  const add = (other, via) => {
    if (other === name || !liveNames.has(other)) return;
    if (!out.has(other) || (via && !out.get(other))) out.set(other, via ?? out.get(other) ?? null);
  };
  const m = META.get(name);
  const myKeys = new Set(m?.keys ?? []);
  // declared (this side)
  for (const j of m?.joins ?? []) {
    const om = META.get(j);
    const via = om ? (om.keys ?? []).find((k) => myKeys.has(k)) : null;
    add(j, via ?? null);
  }
  // declared (other side pointing here)
  for (const [other, om] of META) {
    if (other === name) continue;
    if ((om.joins ?? []).includes(name)) {
      const via = (om.keys ?? []).find((k) => myKeys.has(k));
      add(other, via ?? null);
    }
  }
  return [...out.entries()].map(([table, via]) => ({ table, via })).sort((a, b) => a.table.localeCompare(b.table));
}

function main(relations) {
  const live = new Map(relations.map((r) => [r.name, r]));
  const liveNames = new Set(live.keys());
  const views = cronViews();
  const mapped = new Set(META.keys());
  const unmapped = relations.filter((r) => !mapped.has(r.name));
  const matviews = relations.filter((r) => r.kind === "matview");
  const genDate = new Date().toISOString().slice(0, 10);

  // ── DATABASE.md ──
  const L = [];
  L.push("# Leuk Database Atlas", "");
  L.push(`> **Generated** by \`scripts/db-atlas.mjs\` on ${genDate} — do not hand-edit. Re-run \`node --env-file=.env.local scripts/db-atlas.mjs\` to refresh. Row counts on tables above ${commas(BIG_ROW_THRESHOLD)} rows are planner estimates (\`≈\`), never \`count(*)\`.`, "");
  L.push(`The live public schema holds **${relations.length}** relations — ${relations.filter((r) => r.kind === "table").length} tables and ${matviews.length} materialized views. Grouped by domain below; the graph of how they join is in the per-table Obsidian notes under \`~/Vaults/hq/leuk/atlas/\`.`, "");

  // Contents
  L.push("## Contents", "");
  for (const g of GROUPS) L.push(`- [${g.title}](#${slug(g.title)})`);
  if (unmapped.length) L.push(`- [Unmapped tables](#unmapped-tables)`);
  L.push(`- [Matview lineage](#matview-lineage)`, "");

  // Domains
  for (const g of GROUPS) {
    L.push(`## ${g.title}`, "", `_${g.blurb}_`, "");
    for (const t of g.tables) {
      const rel = live.get(t.name);
      if (!rel) {
        L.push(`### \`${t.name}\` · _not yet loaded_`, "", t.meaning, `Defined in ${t.sql}; the loader hasn't populated it in this database yet.`, "");
        continue;
      }
      const isView = rel.kind === "matview";
      L.push(`### \`${t.name}\``, "");
      L.push(t.meaning, "");
      const facts = [`**${isView ? "Matview" : "Table"}**`, `${rowLabel(rel)} rows`, `defined in ${t.sql}`];
      if (t.powers) facts.push(`powers \`${t.powers}\``);
      if (isView) facts.push(views.has(t.name) ? "refreshed nightly by the 04:12 cron" : "refreshed on ingest (not in the nightly cron)");
      L.push(facts.join(" · "), "");
      const js = joinsFor(t.name, liveNames);
      if (js.length) L.push(`**Joins:** ${js.map((j) => `\`${j.table}\`${j.via ? ` (\`${j.via}\`)` : ""}`).join(" · ")}`, "");
      L.push(columnTable(rel.columns), "");
    }
  }

  // Unmapped
  if (unmapped.length) {
    L.push(`## Unmapped tables`, "", "_In the database but not yet in the atlas metadata (mirror `lib/repos/admin.ts`). Structure + count only._", "");
    for (const rel of unmapped) {
      L.push(`### \`${rel.name}\``, "", `**${rel.kind === "matview" ? "Matview" : "Table"}** · ${rowLabel(rel)} rows · ${rel.columns.length} columns`, "");
      L.push(columnTable(rel.columns), "");
    }
  }

  // Matview lineage
  L.push(`## Matview lineage`, "", "The derived views the app reads instead of the base tables. The nightly 04:12 cron (`app/api/cron/daily/route.ts`) rebuilds the ones marked ✓, `CONCURRENTLY`, in dependency order.", "");
  L.push("| Matview | Defined in | Rebuilt by nightly cron | Reads |", "| --- | --- | --- | --- |");
  for (const rel of matviews) {
    const m = META.get(rel.name);
    const reads = m ? joinsFor(rel.name, liveNames).map((j) => `\`${j.table}\``).slice(0, 4).join(", ") : "—";
    L.push(`| \`${rel.name}\` | ${m?.sql ?? "—"} | ${views.has(rel.name) ? "✓" : "on ingest"} | ${reads || "—"} |`);
  }
  L.push("");
  const notRefreshed = matviews.filter((r) => !views.has(r.name) && META.has(r.name));
  if (notRefreshed.length) {
    L.push(`> Matviews **not** in the nightly cron (${notRefreshed.map((r) => `\`${r.name}\``).join(", ")}) are rebuilt as part of a script's post-ingest routine — see \`docs/ops/SCRIPTS.md\`.`, "");
  }

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, L.join("\n"));

  // ── Obsidian notes ──
  fs.mkdirSync(VAULT_DIR, { recursive: true });
  let noteCount = 0;
  for (const rel of relations) {
    const m = META.get(rel.name);
    const isView = rel.kind === "matview";
    const N = [];
    N.push("---");
    N.push(`table: ${rel.name}`);
    N.push(`domain: ${m?.domain ?? "Unmapped"}`);
    N.push(`kind: ${isView ? "matview" : "table"}`);
    N.push(`rows: ${rowLabel(rel).replace(/^≈ /, "~")}`);
    if (m?.sql) N.push(`sql: ${m.sql}`);
    if (m?.powers) N.push(`powers: ${m.powers}`);
    N.push(`tags: [leuk-atlas]`);
    N.push(`generated: ${genDate}`);
    N.push("---", "");
    N.push(`# ${rel.name}`, "");
    if (m) N.push(m.meaning, "");
    const facts = [`**Kind:** ${isView ? "matview" : "table"}`, `**Rows:** ${rowLabel(rel)}`];
    if (m?.sql) facts.push(`**Defined in:** ${m.sql}`);
    if (m?.powers) facts.push(`**Powers:** ${m.powers}`);
    if (isView) facts.push(`**Refresh:** ${views.has(rel.name) ? "nightly 04:12 cron" : "on ingest"}`);
    N.push(facts.join(" · "), "");
    const js = joinsFor(rel.name, liveNames);
    if (js.length) {
      N.push("## Joins", "");
      for (const j of js) N.push(`- [[${j.table}]]${j.via ? ` — via \`${j.via}\`` : ""}`);
      N.push("");
    }
    N.push("## Columns", "", columnTable(rel.columns), "");
    fs.writeFileSync(path.join(VAULT_DIR, `${rel.name}.md`), N.join("\n"));
    noteCount++;
  }

  // Index note for the graph
  const idx = ["---", "tags: [leuk-atlas]", `generated: ${genDate}`, "---", "", "# Leuk Atlas", "", `${relations.length} relations, generated ${genDate} by \`scripts/db-atlas.mjs\`. Full reference: \`docs/data/DATABASE.md\` in the repo.`, ""];
  for (const g of GROUPS) {
    idx.push(`## ${g.title}`, "");
    for (const t of g.tables) if (liveNames.has(t.name)) idx.push(`- [[${t.name}]]`);
    idx.push("");
  }
  if (unmapped.length) {
    idx.push("## Unmapped", "");
    for (const rel of unmapped) idx.push(`- [[${rel.name}]]`);
    idx.push("");
  }
  fs.writeFileSync(path.join(VAULT_DIR, "_atlas.md"), idx.join("\n"));

  return { relations: relations.length, tables: relations.length - matviews.length, matviews: matviews.length, unmapped: unmapped.length, notes: noteCount + 1 };
}

function columnTable(cols) {
  if (!cols.length) return "_no columns_";
  return ["| column | type |", "| --- | --- |", ...cols.map((c) => `| \`${c.name}\` | ${c.type} |`)].join("\n");
}
function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── run ───────────────────────────────────────────────────────────────────────
const relations = await introspect();
const stats = main(relations);
console.log(`db-atlas: ${stats.relations} relations (${stats.tables} tables, ${stats.matviews} matviews), ${stats.unmapped} unmapped.`);
console.log(`  → ${path.relative(ROOT, OUT_MD)}`);
console.log(`  → ${stats.notes} Obsidian notes in ${VAULT_DIR}`);
