import { hasDb, sql } from "@/lib/db";

// Live schema introspection for the Data dictionary's Schema-map view — the
// real database drawn as a canvas (tables + matviews, columns, PKs, FK edges,
// and matview LINEAGE from pg_depend). Lineage matters more than FKs here:
// the rate corpus mostly links by convention (tin/npi columns, no formal
// constraints), but every matview's true sources are recorded in pg_rewrite —
// provider_rate_signals → org_tin_rate_summary is a real, queryable edge.
// Catalog reads only — no table data, no PHI.

export type SchemaColumn = { name: string; type: string; pk: boolean };
export type SchemaTable = { name: string; kind: "table" | "matview"; columns: SchemaColumn[] };
export type SchemaFk = { srcTable: string; srcColumn: string; dstTable: string; dstColumn: string };
export type SchemaLineage = { view: string; source: string };
/** A non-PK index (unique or not). Expression/functional indexes (e.g. an
 *  index on `lower(tin)`) are excluded — `columns` can't represent them
 *  faithfully, and the schema-draft canvas only needs plain-column indexes. */
export type SchemaIndex = { table: string; name: string; unique: boolean; columns: string[] };
export type SchemaGraph = {
  tables: SchemaTable[];
  fks: SchemaFk[];
  lineage: SchemaLineage[];
  indexes: SchemaIndex[];
};

const MOCK: SchemaGraph = {
  tables: [
    {
      name: "provider_rate_signals",
      kind: "table",
      columns: [
        { name: "id", type: "uuid", pk: true },
        { name: "npi", type: "text", pk: false },
        { name: "tin", type: "text", pk: false },
        { name: "payer", type: "text", pk: false },
        { name: "negotiated_rate", type: "numeric", pk: false },
      ],
    },
    {
      name: "org_tin_rate_summary",
      kind: "matview",
      columns: [
        { name: "tin", type: "text", pk: false },
        { name: "payer", type: "text", pk: false },
        { name: "distinct_rates", type: "integer", pk: false },
      ],
    },
  ],
  fks: [],
  lineage: [{ view: "org_tin_rate_summary", source: "provider_rate_signals" }],
  indexes: [{ table: "provider_rate_signals", name: "idx_prs_payer", unique: false, columns: ["payer"] }],
};

export async function getSchemaGraph(): Promise<SchemaGraph> {
  if (!hasDb) return MOCK;

  const [colsRaw, pksRaw, fksRaw, lineageRaw, indexesRaw] = await Promise.all([
    sql`
      SELECT cl.relname AS table_name,
             CASE cl.relkind WHEN 'm' THEN 'matview' ELSE 'table' END AS kind,
             a.attname AS column_name,
             format_type(a.atttypid, a.atttypmod) AS data_type,
             a.attnum
      FROM pg_class cl
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum > 0 AND NOT a.attisdropped
      WHERE n.nspname = 'public' AND cl.relkind IN ('r', 'm')
      ORDER BY cl.relname, a.attnum
    `,
    sql`
      SELECT cl.relname AS table_name, a.attname AS column_name
      FROM pg_index i
      JOIN pg_class cl ON cl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = ANY(i.indkey)
      WHERE n.nspname = 'public' AND i.indisprimary
    `,
    sql`
      SELECT tc.table_name AS src_table, kcu.column_name AS src_column,
             ccu.table_name AS dst_table, ccu.column_name AS dst_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = 'public'
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = 'public'
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    `,
    sql`
      SELECT DISTINCT dependent.relname AS view, source.relname AS source
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid
      JOIN pg_class dependent ON dependent.oid = r.ev_class
      JOIN pg_class source ON source.oid = d.refobjid
      JOIN pg_namespace n ON n.oid = dependent.relnamespace
      WHERE n.nspname = 'public'
        AND dependent.relkind = 'm'
        AND source.relkind IN ('r', 'm')
        AND dependent.relname <> source.relname
    `,
    // Non-PK indexes only (the PK is already carried on SchemaColumn.pk).
    // bool_and(attnum > 0) drops expression/functional indexes — an index on
    // e.g. lower(tin) has a 0 in indkey with no matching pg_attribute row, so
    // a plain join would silently omit that column from the array; catching
    // it explicitly here means we skip the whole index rather than show it
    // with a column missing.
    sql`
      SELECT cl.relname AS table_name, ic.relname AS index_name, i.indisunique AS is_unique,
             array_agg(a.attname ORDER BY x.n) AS columns
      FROM pg_index i
      JOIN pg_class cl ON cl.oid = i.indrelid
      JOIN pg_class ic ON ic.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS x(attnum, n) ON true
      LEFT JOIN pg_attribute a ON a.attrelid = cl.oid AND a.attnum = x.attnum
      WHERE n.nspname = 'public' AND cl.relkind IN ('r', 'm') AND NOT i.indisprimary
      GROUP BY cl.relname, ic.relname, i.indisunique
      HAVING bool_and(x.attnum > 0)
      ORDER BY cl.relname, ic.relname
    `,
  ]);

  // The neon serverless HTTP driver returns array_agg as the raw wire string
  // ("{payer,billing_code}"), not a parsed JS array like a native pg driver
  // would — handle both so this doesn't throw the moment a table has an index.
  const toArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return v.replace(/^\{|\}$/g, "").split(",").filter(Boolean);
    return [];
  };

  const pkSet = new Set(
    (pksRaw as Array<{ table_name: string; column_name: string }>).map((r) => `${r.table_name}.${r.column_name}`),
  );
  const byTable = new Map<string, SchemaTable>();
  for (const r of colsRaw as Array<{ table_name: string; kind: "table" | "matview"; column_name: string; data_type: string }>) {
    const t = byTable.get(r.table_name) ?? { name: r.table_name, kind: r.kind, columns: [] };
    t.columns.push({ name: r.column_name, type: r.data_type, pk: pkSet.has(`${r.table_name}.${r.column_name}`) });
    byTable.set(r.table_name, t);
  }

  return {
    tables: [...byTable.values()],
    fks: (fksRaw as Array<{ src_table: string; src_column: string; dst_table: string; dst_column: string }>).map((r) => ({
      srcTable: r.src_table,
      srcColumn: r.src_column,
      dstTable: r.dst_table,
      dstColumn: r.dst_column,
    })),
    lineage: (lineageRaw as Array<{ view: string; source: string }>).map((r) => ({ view: r.view, source: r.source })),
    indexes: (indexesRaw as Array<{ table_name: string; index_name: string; is_unique: boolean; columns: unknown }>).map(
      (r) => ({ table: r.table_name, name: r.index_name, unique: r.is_unique, columns: toArray(r.columns) }),
    ),
  };
}
