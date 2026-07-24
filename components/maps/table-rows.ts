// Shared row-capping for a table card, used by both the read-only Schema map
// and the editable Draft canvas — collapsed shows a standard height (`cap`
// rows) regardless of how wide the real table is; expanded shows everything.
// A column that participates in an edge stays visible even collapsed (`keep`)
// — hiding it would make the edge look like it lands on nothing.
export function visibleRows<C extends { name: string; pk: boolean }>(
  columns: C[],
  keep: Set<string>,
  expanded: boolean,
  cap: number,
): { rows: C[]; moreCount: number } {
  if (expanded) return { rows: columns, moreCount: 0 };
  const rows = columns.filter((c, i) => i < cap || c.pk || keep.has(c.name));
  return { rows, moreCount: columns.length - rows.length };
}
