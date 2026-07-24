// The schema-redesign draft SHAPE — types only, db-free (mirrors lib/canvas.ts;
// the repo that persists it lives in lib/repos/schema-drafts.ts).
//
// Unlike every other canvas doc in this app (org map, /maps), a draft is
// allowed to be fiction: the user invents tables, columns, and edges freely.
// Nothing here ever runs as DDL — a draft is read back later (by a person or
// by an agent) to hand-write an actual migration, the same way every existing
// migration in sql/ got written.

import type { SchemaGraph } from "@/lib/repos/schema-map";

export type DraftColumn = { id: string; name: string; type: string; pk: boolean };

// A secondary (non-PK) index. `columns` is free-text, comma-separated column
// NAMES (not ids) — a draft's indexes describe intent for a future migration,
// not a live-linked structure, so a plain editable string is enough; nothing
// here enforces that the names still match if a column gets renamed.
export type DraftIndex = { id: string; unique: boolean; columns: string };

export type DraftTable = {
  /** Canvas-local id (stable within the doc, independent of `name`). */
  id: string;
  name: string;
  kind: "table" | "matview";
  columns: DraftColumn[];
  indexes: DraftIndex[];
  /** Free-text domain tag (e.g. "Rates", "Practice management (EHR)") — the
   *  canvas bands/collapses tables by this. Baked in at fork time from the
   *  Data dictionary's curated groups; freely renamable afterward like
   *  everything else in a draft. */
  group: string;
  x: number;
  y: number;
};

export type DraftEdgeKind = "fk" | "feeds";

export type DraftEdge = {
  id: string;
  kind: DraftEdgeKind;
  srcTable: string;
  /** Column id, or null for a table-level "feeds" (matview lineage) edge. */
  srcColumn: string | null;
  dstTable: string;
  dstColumn: string | null;
};

export type SchemaDraftDoc = { tables: DraftTable[]; edges: DraftEdge[] };

export type SchemaDraftMeta = { id: string; name: string; updatedAt: string };

export const SCHEMA_DRAFT_MAX_TABLES = 60;
export const SCHEMA_DRAFT_MAX_COLUMNS = 40;

/** Structural check for a client-submitted doc (API layer runs this before
 *  any write; route modules can't export helpers, so it lives here). */
export function validSchemaDraftDoc(doc: unknown): doc is SchemaDraftDoc {
  if (!doc || typeof doc !== "object") return false;
  const d = doc as SchemaDraftDoc;
  if (!Array.isArray(d.tables) || d.tables.length > SCHEMA_DRAFT_MAX_TABLES) return false;
  if (!Array.isArray(d.edges)) return false;
  const tableIds = new Set<string>();
  for (const t of d.tables) {
    if (!t || typeof t !== "object") return false;
    if (typeof t.id !== "string" || typeof t.name !== "string") return false;
    if (typeof t.group !== "string") return false;
    if (t.kind !== "table" && t.kind !== "matview") return false;
    if (typeof t.x !== "number" || typeof t.y !== "number") return false;
    if (!Array.isArray(t.columns) || t.columns.length > SCHEMA_DRAFT_MAX_COLUMNS) return false;
    for (const c of t.columns) {
      if (!c || typeof c.id !== "string" || typeof c.name !== "string" || typeof c.type !== "string") return false;
      if (typeof c.pk !== "boolean") return false;
    }
    if (!Array.isArray(t.indexes) || t.indexes.length > SCHEMA_DRAFT_MAX_COLUMNS) return false;
    for (const idx of t.indexes) {
      if (!idx || typeof idx.id !== "string" || typeof idx.columns !== "string") return false;
      if (typeof idx.unique !== "boolean") return false;
    }
    tableIds.add(t.id);
  }
  for (const e of d.edges) {
    if (!e || typeof e.id !== "string") return false;
    if (e.kind !== "fk" && e.kind !== "feeds") return false;
    if (!tableIds.has(e.srcTable) || !tableIds.has(e.dstTable)) return false;
    if (e.srcColumn !== null && typeof e.srcColumn !== "string") return false;
    if (e.dstColumn !== null && typeof e.dstColumn !== "string") return false;
  }
  return true;
}

/** Seed a fresh draft from the live introspected schema — a starting point,
 *  not a sync: once forked, a draft never looks at the live catalog again.
 *  `groupOf` is the Data dictionary's curated table→group map (the same one
 *  the read-only Schema map bands by) — passed in rather than looked up here
 *  because that lookup is a DB read (platformInventory) and this function is
 *  db-free by design. Ungrouped tables (new to the catalog) land in "Other". */
export function forkFromLiveSchema(schema: SchemaGraph, groupOf: Record<string, string>): SchemaDraftDoc {
  const GRID_W = 340;
  const GRID_H = 320;
  const PER_ROW = 4;
  const colId = (table: string, col: string) => `${table}.${col}`;

  const indexesByTable = new Map<string, DraftIndex[]>();
  for (const idx of schema.indexes) {
    const list = indexesByTable.get(idx.table) ?? [];
    list.push({ id: `${idx.table}:${idx.name}`, unique: idx.unique, columns: idx.columns.join(", ") });
    indexesByTable.set(idx.table, list);
  }

  const tables: DraftTable[] = [...schema.tables]
    .sort((a, b) => (groupOf[a.name] ?? "Other").localeCompare(groupOf[b.name] ?? "Other") || a.name.localeCompare(b.name))
    .map((t, i) => ({
      id: t.name,
      name: t.name,
      kind: t.kind,
      columns: t.columns.map((c) => ({ id: colId(t.name, c.name), name: c.name, type: c.type, pk: c.pk })),
      indexes: indexesByTable.get(t.name) ?? [],
      group: groupOf[t.name] ?? "Other",
      x: (i % PER_ROW) * GRID_W,
      y: Math.floor(i / PER_ROW) * GRID_H,
    }));

  const present = new Set(tables.map((t) => t.id));
  const edges: DraftEdge[] = [];
  for (const fk of schema.fks) {
    if (!present.has(fk.srcTable) || !present.has(fk.dstTable)) continue;
    edges.push({
      id: `fk:${fk.srcTable}.${fk.srcColumn}→${fk.dstTable}.${fk.dstColumn}`,
      kind: "fk",
      srcTable: fk.srcTable,
      srcColumn: colId(fk.srcTable, fk.srcColumn),
      dstTable: fk.dstTable,
      dstColumn: colId(fk.dstTable, fk.dstColumn),
    });
  }
  for (const l of schema.lineage) {
    if (!present.has(l.view) || !present.has(l.source)) continue;
    edges.push({
      id: `feed:${l.source}→${l.view}`,
      kind: "feeds",
      srcTable: l.source,
      srcColumn: null,
      dstTable: l.view,
      dstColumn: null,
    });
  }

  return { tables, edges };
}
