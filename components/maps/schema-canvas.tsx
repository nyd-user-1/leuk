"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SearchInput } from "@/components/ui/search-input";
import { MAIN_PANEL_ID } from "@/components/shell/main-panel";
import { ExpandToggle } from "./expand-toggle";
import { SchemaViewSwitcher, type SchemaView } from "./schema-view-switcher";
import { GroupBandNode, groupBoxRect, type GroupNodeData } from "./group-band-node";
import { colorForGroup } from "./group-color";
import { visibleRows } from "./table-rows";
import { CardMenu, type CardMenuItem } from "./card-menu";
import type { SchemaGraph } from "@/lib/repos/schema-map";

// The Data dictionary's Schema map — the live database drawn as a canvas.
// Table/matview nodes with column rows (the database-schema-node pattern:
// one handle per column, so FK edges land column-to-column), grouped into
// vertical bands by the dictionary's curated groups. Two edge kinds:
//   * FK (gray, solid, arrowed) — a formal foreign key;
//   * feeds (teal, dashed) — matview lineage from pg_depend: the rollup
//     really is built from that source. In this schema lineage is the story.
// Node-search top-right: type a table or column, fly to it.
//
// Third @xyflow/react importer (with org-map and builder-canvas) — all three
// code-split behind next/dynamic.

const TEAL = "#3F8290";
const NODE_W = 300;
const ROW_H = 21;
const HEADER_H = 40;
const COL_CAP = 8;
const BAND_W = 380;
const BAND_GAP_Y = 28;

export type SchemaTableMeta = { group: string; count: number | null; meaning: string };

type SchemaNodeData = {
  name: string;
  kind: "table" | "matview";
  group: string;
  count: number | null;
  meaning: string;
  columns: Array<{ name: string; type: string; pk: boolean }>;
  keep: Set<string>;
  expanded: boolean;
  minimized: boolean;
  color: { text: string; bg: string; dot: string };
  onToggleExpand: (table: string) => void;
  onToggleMinimize: (table: string) => void;
};

const anchor = "!h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent";

function SchemaNode(props: NodeProps) {
  const d = props.data as unknown as SchemaNodeData;
  const { rows, moreCount } = visibleRows(d.columns, d.keep, d.expanded, COL_CAP);

  const menuItems: CardMenuItem[] = [
    {
      label: d.expanded ? "Collapse columns" : "Expand columns",
      icon: "chevron-down",
      onClick: () => d.onToggleExpand(props.id),
    },
    {
      label: d.minimized ? "Restore card" : "Minimize card",
      icon: d.minimized ? "eye" : "eye-off",
      onClick: () => d.onToggleMinimize(props.id),
    },
  ];

  const header = (
    <div
      className={`relative flex items-center gap-1.5 border-b border-border px-3 ${d.color.bg}`}
      style={{ height: HEADER_H }}
      title={d.meaning || d.name}
    >
      <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-semibold text-text">{d.name}</span>
      {d.kind === "matview" && (
        <span className="shrink-0 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-text-muted">
          mv
        </span>
      )}
      {d.count != null && (
        <span className="shrink-0 text-[11px] tabular-nums text-text-muted">{d.count.toLocaleString("en-US")}</span>
      )}
      <CardMenu items={menuItems} />
      <Handle type="target" position={Position.Left} id="t" className={anchor} />
      <Handle type="source" position={Position.Right} id="t" className={anchor} />
    </div>
  );

  if (d.minimized) {
    return (
      <div className="overflow-hidden rounded-field border border-border bg-surface shadow-card" style={{ width: NODE_W }}>
        {header}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-field border border-border bg-surface shadow-card" style={{ width: NODE_W }}>
      {header}
      <div className="py-1">
        {rows.map((c) => (
          <div key={c.name} className="relative flex items-center gap-2 px-3" style={{ height: ROW_H }}>
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text-body">{c.name}</span>
            {c.pk && (
              <span className="rounded bg-canvas px-1 text-[9.5px] font-semibold uppercase text-text-muted">pk</span>
            )}
            <span className="max-w-[40%] truncate text-[10.5px] text-text-muted">{c.type}</span>
            <Handle type="target" position={Position.Left} id={`c:${c.name}`} className={anchor} />
            <Handle type="source" position={Position.Right} id={`c:${c.name}`} className={anchor} />
          </div>
        ))}
        {moreCount > 0 && (
          <button
            type="button"
            onClick={() => d.onToggleExpand(props.id)}
            className="nodrag flex w-full items-center px-3 text-[10.5px] italic text-text-muted transition-colors hover:text-primary hover:no-underline"
            style={{ height: ROW_H, lineHeight: `${ROW_H}px` }}
          >
            +{moreCount} more column{moreCount === 1 ? "" : "s"}
          </button>
        )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { schema: SchemaNode, group: GroupBandNode };

function nodeHeight(shownRows: number, hasMore: boolean): number {
  return HEADER_H + 8 + (shownRows + (hasMore ? 1 : 0)) * ROW_H;
}

function nodeHeightFor(d: { columns: SchemaNodeData["columns"]; keep: Set<string>; expanded: boolean; minimized: boolean }): number {
  if (d.minimized) return HEADER_H;
  const { rows, moreCount } = visibleRows(d.columns, d.keep, d.expanded, COL_CAP);
  return nodeHeight(rows.length, moreCount > 0);
}

function SchemaCanvasInner({
  schema,
  meta,
  view,
  onViewChange,
  expanded,
  onToggleExpanded,
}: {
  schema: SchemaGraph;
  meta: Record<string, SchemaTableMeta>;
  view: SchemaView;
  onViewChange: (v: SchemaView) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const { setCenter } = useReactFlow();

  const fkCols = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const fk of schema.fks) {
      (m.get(fk.srcTable) ?? m.set(fk.srcTable, new Set()).get(fk.srcTable)!).add(fk.srcColumn);
      (m.get(fk.dstTable) ?? m.set(fk.dstTable, new Set()).get(fk.dstTable)!).add(fk.dstColumn);
    }
    return m;
  }, [schema.fks]);

  const toggleExpand = useCallback((table: string) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === table ? { ...n, data: { ...n.data, expanded: !(n.data as unknown as SchemaNodeData).expanded } } : n)),
    );
  }, []);
  const toggleMinimize = useCallback((table: string) => {
    setNodes((ns) =>
      ns.map((n) => (n.id === table ? { ...n, data: { ...n.data, minimized: !(n.data as unknown as SchemaNodeData).minimized } } : n)),
    );
  }, []);

  // Base layout seeds once per [schema, meta] (effectively once per page
  // load) — collapse toggles and drags mutate `nodes` state directly
  // afterward, same pattern the Draft canvas uses, so expanding a card never
  // resets anyone's dragged position.
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [heights, setHeights] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    const bandOrder: string[] = [];
    const bandOf = (table: string): string => {
      const g = meta[table]?.group ?? "Other";
      if (!bandOrder.includes(g)) bandOrder.push(g);
      return g;
    };
    const byBand = new Map<string, typeof schema.tables>();
    for (const t of [...schema.tables].sort((a, b) => a.name.localeCompare(b.name))) {
      const g = bandOf(t.name);
      const arr = byBand.get(g) ?? [];
      arr.push(t);
      byBand.set(g, arr);
    }

    const tableNodes: Node[] = [];
    const heights = new Map<string, number>();
    bandOrder.forEach((band, bi) => {
      let y = 0;
      const x = bi * BAND_W;
      for (const t of byBand.get(band) ?? []) {
        const keep = fkCols.get(t.name) ?? new Set<string>();
        const { rows, moreCount } = visibleRows(t.columns, keep, false, COL_CAP);
        const h = nodeHeight(rows.length, moreCount > 0);
        tableNodes.push({
          id: t.name,
          type: "schema",
          position: { x, y },
          data: {
            name: t.name,
            kind: t.kind,
            group: band,
            count: meta[t.name]?.count ?? null,
            meaning: meta[t.name]?.meaning ?? "",
            columns: t.columns,
            keep,
            expanded: false,
            minimized: false,
            color: colorForGroup(band),
            onToggleExpand: toggleExpand,
            onToggleMinimize: toggleMinimize,
          } satisfies SchemaNodeData,
        });
        heights.set(t.name, h);
        y += h + BAND_GAP_Y;
      }
    });

    const present = new Set(tableNodes.map((n) => n.id));
    const newEdges: Edge[] = [];
    for (const fk of schema.fks) {
      if (!present.has(fk.srcTable) || !present.has(fk.dstTable)) continue;
      newEdges.push({
        id: `fk:${fk.srcTable}.${fk.srcColumn}→${fk.dstTable}.${fk.dstColumn}`,
        source: fk.srcTable,
        sourceHandle: `c:${fk.srcColumn}`,
        target: fk.dstTable,
        targetHandle: `c:${fk.dstColumn}`,
        style: { stroke: "#b9bec9", strokeOpacity: 0.6, strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#b9bec9" },
        interactionWidth: 0,
      });
    }
    for (const l of schema.lineage) {
      if (!present.has(l.view) || !present.has(l.source)) continue;
      newEdges.push({
        id: `feed:${l.source}→${l.view}`,
        source: l.source,
        sourceHandle: "t",
        target: l.view,
        targetHandle: "t",
        style: { stroke: TEAL, strokeOpacity: 0.65, strokeWidth: 1.5, strokeDasharray: "6 4" },
        markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: TEAL },
        interactionWidth: 0,
      });
    }

    setNodes(tableNodes);
    setEdges(newEdges);
    setHeights(heights);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, meta]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((gs) => {
      const next = new Set(gs);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  // Group boxes are re-derived from the CURRENT positions/heights of their
  // member cards every render (not stored in `nodes`), so a card minimizing,
  // expanding, or being dragged always leaves an accurate box around it —
  // same split the Draft canvas uses for its bands.
  const displayNodes = useMemo(() => {
    const byGroup = new Map<string, Node[]>();
    for (const n of nodes) {
      const group = (n.data as unknown as SchemaNodeData).group;
      const list = byGroup.get(group) ?? [];
      list.push(n);
      byGroup.set(group, list);
    }
    const bandNodes: Node[] = [];
    const visibleTableNodes: Node[] = [];
    for (const [group, members] of byGroup) {
      const collapsed = collapsedGroups.has(group);
      const rects = members.map((n) => {
        const d = n.data as unknown as SchemaNodeData;
        return { x: n.position.x, y: n.position.y, w: NODE_W, h: nodeHeightFor(d) };
      });
      const rect = groupBoxRect(rects, collapsed);
      const data: GroupNodeData = { name: group, count: members.length, collapsed, onToggle: () => toggleGroup(group) };
      bandNodes.push({
        id: `band:${group}`,
        type: "group",
        position: { x: rect.x, y: rect.y },
        width: rect.width,
        height: rect.height,
        style: { width: rect.width, height: rect.height },
        draggable: false,
        selectable: false,
        zIndex: 1,
        data,
      });
      if (!collapsed) visibleTableNodes.push(...members);
    }
    return [...bandNodes, ...visibleTableNodes];
  }, [nodes, collapsedGroups, toggleGroup]);

  // Node search: table-name (or column) match → fly the viewport to it.
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return [];
    const out: Array<{ table: string; via?: string }> = [];
    for (const t of schema.tables) {
      if (t.name.toLowerCase().includes(needle)) out.push({ table: t.name });
      else {
        const col = t.columns.find((c) => c.name.toLowerCase().includes(needle));
        if (col) out.push({ table: t.name, via: col.name });
      }
      if (out.length >= 8) break;
    }
    return out;
  }, [needle, schema.tables]);
  const flyTo = (table: string) => {
    const n = nodes.find((x) => x.id === table);
    if (n) {
      const h = heights.get(table) ?? 120;
      void setCenter(n.position.x + NODE_W / 2, n.position.y + h / 2, { zoom: 1, duration: 500 });
    }
    setQ("");
  };

  return (
    <div className={expanded ? "absolute inset-0 z-40 bg-[#FAFAFA]" : "min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-[#FAFAFA]"}>
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.06 }}
        minZoom={0.05}
        maxZoom={1.5}
        nodesConnectable={false}
        // onlyRenderVisibleElements dropped: it culled a card from the DOM the
        // instant "minimize" shrank its measured height, and never brought it
        // back — a real bug, not a perf tradeoff worth keeping at ~90 nodes.
      >
        <Panel position="top-left" className="flex items-center gap-1.5">
          <ExpandToggle expanded={expanded} onToggle={onToggleExpanded} />
          <SchemaViewSwitcher view={view} onChange={onViewChange} />
        </Panel>
        <Panel position="top-right">
          <div ref={searchRef} className="relative w-72">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a table or column…"
              className="w-full shadow-card"
            />
            {hits.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-menu">
                {hits.map((h) => (
                  <button
                    key={`${h.table}:${h.via ?? ""}`}
                    type="button"
                    onClick={() => flyTo(h.table)}
                    className="flex w-full items-center gap-2 rounded-field px-2.5 py-1.5 text-left transition-colors hover:bg-[rgba(0,0,0,0.05)]"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] font-medium text-text">{h.table}</span>
                    {h.via && <span className="truncate font-mono text-[11px] text-text-muted">.{h.via}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>
        <Panel position="bottom-right" className="flex items-center gap-3 rounded-field border border-border bg-surface px-3 py-1.5 text-[11.5px] text-text-muted shadow-card">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-6 border-t border-[#b9bec9]" /> foreign key
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0 w-6 border-t-[1.5px] border-dashed border-primary" /> feeds (matview)
          </span>
        </Panel>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.25} color="#D4D4D4" bgColor="#FAFAFA" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}

export function SchemaCanvas(props: {
  schema: SchemaGraph;
  meta: Record<string, SchemaTableMeta>;
  view: SchemaView;
  onViewChange: (v: SchemaView) => void;
}) {
  // Full-container mode lives here, not in the Inner component, because the
  // PORTAL decision (render into the shell's floating panel vs. inline) has
  // to happen at this level — same split org-map avoids by not having an
  // Inner/Outer split at all; this file needs one for ReactFlowProvider.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const canvas = (
    <ReactFlowProvider>
      <SchemaCanvasInner {...props} expanded={expanded} onToggleExpanded={() => setExpanded((e) => !e)} />
    </ReactFlowProvider>
  );

  const host = expanded && typeof document !== "undefined" ? document.getElementById(MAIN_PANEL_ID) : null;
  return host ? createPortal(canvas, host) : canvas;
}
