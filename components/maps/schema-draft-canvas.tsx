"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import { Icon } from "@/components/ui/icons";
import { MAIN_PANEL_ID } from "@/components/shell/main-panel";
import { ExpandToggle } from "./expand-toggle";
import { SchemaViewSwitcher, type SchemaView } from "./schema-view-switcher";
import { GroupBandNode, GROUP_PAD, GROUP_HEADER_H, groupBoxRect, type GroupNodeData } from "./group-band-node";
import { colorForGroup, PALETTE } from "./group-color";
import { visibleRows } from "./table-rows";
import { CardMenu, type CardMenuItem } from "./card-menu";
import {
  SCHEMA_DRAFT_MAX_COLUMNS,
  SCHEMA_DRAFT_MAX_TABLES,
  type DraftColumn,
  type DraftEdge,
  type DraftEdgeKind,
  type DraftIndex,
  type DraftTable,
  type SchemaDraftDoc,
} from "@/lib/schema-draft";

// The Data dictionary's schema-DRAFT canvas: unlike the read-only schema map
// (components/maps/schema-canvas.tsx), this one is fiction the user is meant
// to invent — rename/add/drop tables and columns, draw FK or matview-"feeds"
// edges by hand. Nothing here ever touches the live database; a saved draft
// is read back later (by a person, or by an agent) to hand-write an actual
// migration. Fifth @xyflow/react importer (with org-map and the other two
// components/maps/* files), still code-split behind next/dynamic.
//
// Node deletion never rides the keyboard — onNodesChange strips "remove"
// changes so a stray Backspace while renaming a column can't take the whole
// table with it; the trash icon is the only way to delete a table. Edge
// deletion is fine via keyboard (edges hold no text input, nothing to type
// into) and via clicking an edge then Delete/Backspace.

const TEAL = "#3F8290";
const NODE_W = 300;
const ROW_H = 28;
const HEADER_H = 42;
const GROUP_ROW_H = 20;
const COL_CAP = 8;

// Unlike the read-only schema map (whose handles are pure edge anchors —
// nodesConnectable is false there, so nothing ever grabs one), THIS canvas
// needs handles a user can actually see and drag from. A 1px invisible dot
// (the read-only view's `anchor`) is a real bug here, not a style choice —
// it makes dragging a handle possible in code but not in practice.
//
// !transform-none cancels xyflow's own stylesheet, which nudges every handle
// translate(4px, -4px) off its edge — meant for the common case of a node
// with no overflow clipping. Our card wrapper is `overflow-hidden` (for the
// rounded corners), so that nudge pushed the handle mostly outside the
// clipped box: only a sliver of it was ever paintable/clickable. Cancelling
// the nudge keeps the dot flush on the edge, fully inside the clip.
const HANDLE =
  "!h-2 !w-2 !rounded-full !border !border-text-muted/50 !bg-surface hover:!scale-125 hover:!border-primary hover:!bg-primary transition-transform !transform-none";

const FK_STYLE = { stroke: "#b9bec9", strokeOpacity: 0.6, strokeWidth: 1 };
const FEED_STYLE = { stroke: TEAL, strokeOpacity: 0.65, strokeWidth: 1.5, strokeDasharray: "6 4" };
const markerFor = (kind: DraftEdgeKind) => ({
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: kind === "feeds" ? TEAL : "#b9bec9",
});

type DraftNodeActions = {
  onRename: (id: string, name: string) => void;
  onToggleKind: (id: string) => void;
  onDeleteTable: (id: string) => void;
  onGroupChange: (id: string, group: string) => void;
  onColumnChange: (id: string, colId: string, patch: Partial<DraftColumn>) => void;
  onAddColumn: (id: string) => void;
  onRemoveColumn: (id: string, colId: string) => void;
  onAddIndex: (id: string) => void;
  onIndexChange: (id: string, indexId: string, patch: Partial<DraftIndex>) => void;
  onRemoveIndex: (id: string, indexId: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleMinimize: (id: string) => void;
  onSetGroupColor: (group: string, paletteIndex: number) => void;
};

type DraftNodeData = {
  name: string;
  kind: "table" | "matview";
  columns: DraftColumn[];
  indexes: DraftIndex[];
  group: string;
  /** Which of THIS table's own columns are keep-visible-when-collapsed
   *  because an edge lands on them — derived from `edges` at display time,
   *  never persisted (see the doc/display split below). */
  keep: Set<string>;
  /** Collapsed-vs-expanded, minimized, and the group color override are all
   *  session-local UI state (see collapsedGroups' comment) — merged in at
   *  display time, never part of the saved doc. */
  expanded: boolean;
  minimized: boolean;
  color: { text: string; bg: string; dot: string };
} & DraftNodeActions;

function DraftTableNode(props: NodeProps) {
  const d = props.data as unknown as DraftNodeData;
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
    { label: "Delete table", icon: "trash", onClick: () => d.onDeleteTable(props.id), destructive: true },
  ];
  const swatches = (
    <div className="flex items-center gap-1.5">
      {PALETTE.map((c, i) => (
        <button
          key={i}
          type="button"
          onClick={() => d.onSetGroupColor(d.group, i)}
          aria-label={`Set group color ${i + 1}`}
          className={`h-5 w-5 shrink-0 rounded-full border transition-transform hover:scale-110 ${
            c.dot === d.color.dot ? "border-text" : "border-border/60"
          }`}
          style={{ background: c.dot }}
        />
      ))}
    </div>
  );

  const header = (
    <div
      className={`relative flex items-center gap-1.5 border-b border-border px-2.5 ${d.color.bg}`}
      style={{ height: HEADER_H }}
    >
      <input
        value={d.name}
        onChange={(e) => d.onRename(props.id, e.target.value)}
        placeholder="table_name"
        aria-label="Table name"
        className="nodrag nopan min-w-0 flex-1 truncate bg-transparent font-mono text-[12.5px] font-semibold text-text outline-none placeholder:text-text-muted"
      />
      <button
        type="button"
        onClick={() => d.onToggleKind(props.id)}
        title="Toggle table / materialized view"
        className="nodrag shrink-0 rounded-full bg-black/[0.06] px-1.5 py-0.5 text-[9.5px] font-semibold uppercase text-text-muted transition-colors hover:bg-black/[0.1]"
      >
        {d.kind === "matview" ? "mv" : "tbl"}
      </button>
      <CardMenu items={menuItems} extra={swatches} />
      <Handle type="target" position={Position.Left} id="t" className={HANDLE} />
      <Handle type="source" position={Position.Right} id="t" className={HANDLE} />
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
      <div className="flex items-center border-b border-border/70 bg-black/[0.015] px-2.5" style={{ height: GROUP_ROW_H }}>
        <Icon name="grid" size={10} className="mr-1 shrink-0 text-text-muted/70" />
        <input
          value={d.group}
          onChange={(e) => d.onGroupChange(props.id, e.target.value)}
          placeholder="group"
          aria-label="Table group"
          title="Which band this table is drawn in — edit to move it to another group"
          className="nodrag nopan min-w-0 flex-1 truncate bg-transparent text-[10px] uppercase tracking-wide text-text-muted outline-none placeholder:text-text-muted/50"
        />
      </div>
      <div className="py-1">
        {rows.map((c) => (
          <div key={c.id} className="relative flex items-center gap-1.5 px-2.5" style={{ height: ROW_H }}>
            <input
              value={c.name}
              onChange={(e) => d.onColumnChange(props.id, c.id, { name: e.target.value })}
              placeholder="column"
              aria-label="Column name"
              className="nodrag nopan min-w-0 flex-1 truncate bg-transparent font-mono text-[11.5px] text-text-body outline-none placeholder:text-text-muted"
            />
            <input
              value={c.type}
              onChange={(e) => d.onColumnChange(props.id, c.id, { type: e.target.value })}
              placeholder="type"
              aria-label="Column type"
              className="nodrag nopan w-[64px] shrink-0 truncate bg-transparent text-right text-[10.5px] text-text-muted outline-none placeholder:text-text-muted/60"
            />
            <button
              type="button"
              onClick={() => d.onColumnChange(props.id, c.id, { pk: !c.pk })}
              title="Toggle primary key"
              className={`nodrag shrink-0 rounded px-1 text-[9.5px] font-semibold uppercase transition-colors ${
                c.pk ? "bg-primary/15 text-primary" : "bg-transparent text-text-muted/40 hover:bg-canvas"
              }`}
            >
              pk
            </button>
            <button
              type="button"
              onClick={() => d.onRemoveColumn(props.id, c.id)}
              aria-label="Remove column"
              className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted/60 transition-colors hover:bg-danger-tint hover:text-danger"
            >
              <Icon name="x" size={11} />
            </button>
            <Handle type="target" position={Position.Left} id={`c:${c.id}`} className={HANDLE} />
            <Handle type="source" position={Position.Right} id={`c:${c.id}`} className={HANDLE} />
          </div>
        ))}
        {moreCount > 0 && (
          <button
            type="button"
            onClick={() => d.onToggleExpand(props.id)}
            className="nodrag flex w-full items-center px-2.5 text-[10.5px] italic text-text-muted transition-colors hover:text-primary"
            style={{ height: ROW_H }}
          >
            +{moreCount} more column{moreCount === 1 ? "" : "s"}
          </button>
        )}
        {moreCount === 0 && (
          <button
            type="button"
            onClick={() => d.onAddColumn(props.id)}
            disabled={d.columns.length >= SCHEMA_DRAFT_MAX_COLUMNS}
            className="nodrag flex w-full items-center gap-1.5 px-2.5 text-[10.5px] text-text-muted transition-colors hover:text-primary disabled:opacity-40"
            style={{ height: ROW_H }}
          >
            <Icon name="plus" size={11} /> Add column
          </button>
        )}
      </div>
      <div className="border-t border-border py-1">
        {d.indexes.map((idx) => (
          <div key={idx.id} className="flex items-center gap-1.5 px-2.5" style={{ height: ROW_H }}>
            <button
              type="button"
              onClick={() => d.onIndexChange(props.id, idx.id, { unique: !idx.unique })}
              title="Toggle unique"
              className={`nodrag shrink-0 rounded px-1 text-[9.5px] font-semibold uppercase transition-colors ${
                idx.unique ? "bg-primary/15 text-primary" : "bg-canvas text-text-muted"
              }`}
            >
              {idx.unique ? "unique" : "idx"}
            </button>
            <input
              value={idx.columns}
              onChange={(e) => d.onIndexChange(props.id, idx.id, { columns: e.target.value })}
              placeholder="col_a, col_b"
              aria-label="Index columns"
              className="nodrag nopan min-w-0 flex-1 truncate bg-transparent font-mono text-[11px] text-text-body outline-none placeholder:text-text-muted"
            />
            <button
              type="button"
              onClick={() => d.onRemoveIndex(props.id, idx.id)}
              aria-label="Remove index"
              className="nodrag flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted/60 transition-colors hover:bg-danger-tint hover:text-danger"
            >
              <Icon name="x" size={11} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => d.onAddIndex(props.id)}
          className="nodrag flex w-full items-center gap-1.5 px-2.5 text-[10.5px] text-text-muted transition-colors hover:text-primary"
          style={{ height: ROW_H }}
        >
          <Icon name="plus" size={11} /> Add index
        </button>
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { draft: DraftTableNode, group: GroupBandNode };

// ── doc ↔ canvas ─────────────────────────────────────────────────────────────

function edgeFromDraft(e: DraftEdge): Edge {
  return {
    id: e.id,
    source: e.srcTable,
    sourceHandle: e.srcColumn ? `c:${e.srcColumn}` : "t",
    target: e.dstTable,
    targetHandle: e.dstColumn ? `c:${e.dstColumn}` : "t",
    style: e.kind === "feeds" ? FEED_STYLE : FK_STYLE,
    markerEnd: markerFor(e.kind),
    interactionWidth: 20,
    data: { kind: e.kind },
  };
}

function fromDraftDoc(doc: SchemaDraftDoc | null, actions: DraftNodeActions): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = (doc?.tables ?? []).map((t) => {
    const group = t.group ?? "Other"; // older saved drafts predate this field
    return {
      id: t.id,
      type: "draft",
      position: { x: t.x, y: t.y },
      data: {
        name: t.name,
        kind: t.kind,
        columns: t.columns,
        indexes: t.indexes,
        group,
        keep: new Set<string>(),
        expanded: false,
        minimized: false,
        color: colorForGroup(group),
        ...actions,
      } satisfies DraftNodeData,
    };
  });
  const edges: Edge[] = (doc?.edges ?? []).map(edgeFromDraft);
  return { nodes, edges };
}

function toDraftDoc(nodes: Node[], edges: Edge[]): SchemaDraftDoc {
  return {
    tables: nodes.map((n) => {
      const d = n.data as unknown as DraftNodeData;
      return {
        id: n.id,
        name: d.name,
        kind: d.kind,
        columns: d.columns,
        indexes: d.indexes,
        group: d.group,
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      kind: (e.data as { kind?: DraftEdgeKind } | undefined)?.kind ?? (e.sourceHandle === "t" ? "feeds" : "fk"),
      srcTable: e.source,
      srcColumn: e.sourceHandle && e.sourceHandle !== "t" ? e.sourceHandle.slice(2) : null,
      dstTable: e.target,
      dstColumn: e.targetHandle && e.targetHandle !== "t" ? e.targetHandle.slice(2) : null,
    })),
  };
}

const ADD_GRID_W = 340;
const ADD_GRID_H = 320;
const ADD_PER_ROW = 4;

// Cascades new tables through the same grid forkFromLiveSchema uses, keyed
// on how many tables are already on the canvas — otherwise every added
// table lands at a fixed (40, 40) and stacks exactly on the last one.
function blankTable(index: number): DraftTable {
  return {
    id: crypto.randomUUID(),
    name: "",
    kind: "table",
    columns: [{ id: crypto.randomUUID(), name: "id", type: "uuid", pk: true }],
    indexes: [],
    group: "Other",
    x: (index % ADD_PER_ROW) * ADD_GRID_W,
    y: Math.floor(index / ADD_PER_ROW) * ADD_GRID_H,
  };
}

// ── auto-arrange (Dagre, per group) ─────────────────────────────────────────
// The fork's grid (forkFromLiveSchema) is index order, not topology — fine as
// a starting point, useless once you're trying to read 90 tables' worth of
// FK/feeds structure. Dagre is the right tool here, not overkill: this graph
// is sparse (the live schema is ~90 tables over ~80 edges total, well under
// one edge per node on average), exactly the shape a layered DAG layout
// handles well. Two deliberately NOT used, for the actual data shape rather
// than scale: ElkJS adds nested/compound-region layout this flat table list
// never needs; D3 Hierarchy requires a single-parent TREE, and a table here
// can have several inbound AND outbound FKs, which a tree can't represent
// without silently dropping edges to force-fit one parent per node.
//
// Dagre runs once PER GROUP (using only that group's internal edges) rather
// than once over the whole graph — bands you can actually read, not one
// 90-table hairball. Cross-group edges still draw fine afterward; React Flow
// doesn't require same-parent nodes to connect, they just cross between
// bands on the canvas instead of staying inside one.
function nodeHeightFor(d: { columns: unknown[]; indexes: unknown[]; expanded?: boolean; minimized?: boolean }): number {
  if (d.minimized) return HEADER_H;
  const shown = d.expanded ? d.columns.length : Math.min(d.columns.length, COL_CAP);
  const more = d.expanded ? 0 : d.columns.length - shown > 0 ? 1 : 0;
  return HEADER_H + GROUP_ROW_H + (shown + more + 1) * ROW_H + (d.indexes.length + 1) * ROW_H;
}

function layoutGrouped(nodes: Node[], edges: Edge[]): Node[] {
  const byGroup = new Map<string, Node[]>();
  for (const n of nodes) {
    const group = (n.data as unknown as DraftNodeData).group || "Other";
    const list = byGroup.get(group) ?? [];
    list.push(n);
    byGroup.set(group, list);
  }

  const result: Node[] = [];
  let xOffset = 0;
  for (const group of [...byGroup.keys()].sort()) {
    const members = byGroup.get(group)!;
    const memberIds = new Set(members.map((n) => n.id));
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 70 });
    for (const n of members) {
      g.setNode(n.id, { width: NODE_W, height: nodeHeightFor(n.data as unknown as DraftNodeData) });
    }
    for (const e of edges) {
      if (memberIds.has(e.source) && memberIds.has(e.target) && e.source !== e.target) g.setEdge(e.source, e.target);
    }
    dagre.layout(g);

    let bandWidth = NODE_W;
    for (const n of members) {
      const pos = g.node(n.id);
      if (pos) bandWidth = Math.max(bandWidth, pos.x + pos.width / 2);
    }
    for (const n of members) {
      const pos = g.node(n.id);
      // Dagre positions are node CENTERS; React Flow positions are top-left.
      result.push(pos ? { ...n, position: { x: xOffset + pos.x - pos.width / 2, y: pos.y - pos.height / 2 } } : n);
    }
    xOffset += bandWidth + GROUP_PAD * 3; // gap between bands
  }
  return result;
}

// ── controls menu (Add table / Arrange) ─────────────────────────────────────
// Folded into one compact dropdown rather than two permanently-visible
// buttons — same click-outside/Escape pattern already used by the My-drafts
// switcher, the CodeSwitcher, etc. Leaves room to add more actions later
// without the top-left corner growing a new button per feature.
function ControlsMenu({ onAddTable, onArrange }: { onAddTable: () => void; onArrange: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Canvas controls"
        title="Canvas controls"
        className={`flex h-9 w-9 items-center justify-center rounded-field border border-border bg-surface shadow-card transition-colors ${
          open ? "text-primary" : "text-text-body hover:text-primary"
        }`}
      >
        <Icon name="menu" size={16} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onAddTable)}
            className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[14px] font-medium text-text-body transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-text"
          >
            <Icon name="plus" size={16} className="text-text-muted" />
            Add table
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick(onArrange)}
            className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[14px] font-medium text-text-body transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-text"
          >
            <Icon name="grid" size={16} className="text-text-muted" />
            Arrange
          </button>
        </div>
      )}
    </div>
  );
}

// ── The draft canvas ─────────────────────────────────────────────────────────

function DraftCanvasInner({
  initialDoc,
  onDocChange,
  view,
  onViewChange,
  expanded,
  onToggleExpanded,
  toolbar,
}: {
  initialDoc: SchemaDraftDoc | null;
  onDocChange: (doc: SchemaDraftDoc) => void;
  view: SchemaView;
  onViewChange: (v: SchemaView) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  toolbar: ReactNode;
}) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow();

  const renameTable = useCallback((id: string, name: string) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n)));
  }, []);
  const toggleKind = useCallback((id: string) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as unknown as DraftNodeData;
        return { ...n, data: { ...d, kind: d.kind === "matview" ? "table" : "matview" } };
      }),
    );
  }, []);
  const deleteTable = useCallback((id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  }, []);
  const groupChange = useCallback((id: string, group: string) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, group } } : n)));
  }, []);
  const columnChange = useCallback((id: string, colId: string, patch: Partial<DraftColumn>) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as unknown as DraftNodeData;
        return { ...n, data: { ...d, columns: d.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)) } };
      }),
    );
  }, []);
  const addColumn = useCallback((id: string) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as unknown as DraftNodeData;
        if (d.columns.length >= SCHEMA_DRAFT_MAX_COLUMNS) return n;
        return {
          ...n,
          data: { ...d, columns: [...d.columns, { id: crypto.randomUUID(), name: "", type: "text", pk: false }] },
        };
      }),
    );
  }, []);
  const removeColumn = useCallback((id: string, colId: string) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as unknown as DraftNodeData;
        return { ...n, data: { ...d, columns: d.columns.filter((c) => c.id !== colId) } };
      }),
    );
    setEdges((es) => es.filter((e) => e.sourceHandle !== `c:${colId}` && e.targetHandle !== `c:${colId}`));
  }, []);
  const addIndex = useCallback((id: string) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as unknown as DraftNodeData;
        return { ...n, data: { ...d, indexes: [...d.indexes, { id: crypto.randomUUID(), unique: false, columns: "" }] } };
      }),
    );
  }, []);
  const indexChange = useCallback((id: string, indexId: string, patch: Partial<DraftIndex>) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as unknown as DraftNodeData;
        return {
          ...n,
          data: { ...d, indexes: d.indexes.map((idx) => (idx.id === indexId ? { ...idx, ...patch } : idx)) },
        };
      }),
    );
  }, []);
  const removeIndex = useCallback((id: string, indexId: string) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as unknown as DraftNodeData;
        return { ...n, data: { ...d, indexes: d.indexes.filter((idx) => idx.id !== indexId) } };
      }),
    );
  }, []);

  // Card collapse/expand, minimize, and per-group color overrides are all
  // session-local (like collapsedGroups below), not part of the saved doc —
  // how you're looking at a design isn't the design.
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const toggleExpandTable = useCallback((id: string) => {
    setExpandedTables((ts) => {
      const next = new Set(ts);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [minimizedTables, setMinimizedTables] = useState<Set<string>>(new Set());
  const toggleMinimizeTable = useCallback((id: string) => {
    setMinimizedTables((ts) => {
      const next = new Set(ts);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [groupColorOverrides, setGroupColorOverrides] = useState<Record<string, number>>({});
  const setGroupColor = useCallback((group: string, paletteIndex: number) => {
    setGroupColorOverrides((o) => ({ ...o, [group]: paletteIndex }));
  }, []);

  const actions = useMemo<DraftNodeActions>(
    () => ({
      onRename: renameTable,
      onToggleKind: toggleKind,
      onDeleteTable: deleteTable,
      onGroupChange: groupChange,
      onColumnChange: columnChange,
      onAddColumn: addColumn,
      onRemoveColumn: removeColumn,
      onAddIndex: addIndex,
      onIndexChange: indexChange,
      onRemoveIndex: removeIndex,
      onToggleExpand: toggleExpandTable,
      onToggleMinimize: toggleMinimizeTable,
      onSetGroupColor: setGroupColor,
    }),
    [
      renameTable,
      toggleKind,
      deleteTable,
      groupChange,
      columnChange,
      addColumn,
      removeColumn,
      addIndex,
      indexChange,
      removeIndex,
      toggleExpandTable,
      toggleMinimizeTable,
      setGroupColor,
    ],
  );

  // Seeds once per mount; the parent remounts this component (key) on every
  // load/new/fork, matching the /maps builder's canvasKey pattern.
  useEffect(() => {
    const seeded = fromDraftDoc(initialDoc, actions);
    setNodes(seeded.nodes);
    setEdges(seeded.edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    // Table deletion is trash-icon only — never let a stray keyboard Delete
    // (e.g. while renaming a column) take a whole table with it.
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== "remove"), ns));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((es) => applyEdgeChanges(changes, es));
  }, []);
  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || !conn.sourceHandle || !conn.targetHandle) return;
    const kind: DraftEdgeKind = conn.sourceHandle === "t" && conn.targetHandle === "t" ? "feeds" : "fk";
    setEdges((es) => [
      ...es,
      {
        id: `e:${crypto.randomUUID()}`,
        source: conn.source!,
        sourceHandle: conn.sourceHandle,
        target: conn.target!,
        targetHandle: conn.targetHandle,
        style: kind === "feeds" ? FEED_STYLE : FK_STYLE,
        markerEnd: markerFor(kind),
        interactionWidth: 20,
        data: { kind },
      },
    ]);
  }, []);

  const addTable = useCallback(() => {
    setNodes((ns) => {
      if (ns.length >= SCHEMA_DRAFT_MAX_TABLES) return ns;
      const t = blankTable(ns.length);
      return [...ns, { id: t.id, type: "draft", position: { x: t.x, y: t.y }, data: { ...t, ...actions } }];
    });
  }, [actions]);

  const arrange = useCallback(() => {
    setNodes((ns) => layoutGrouped(ns, edges));
    // Positions just moved a lot — wait a frame so React Flow has measured
    // the new layout before asking it to fit the viewport to it.
    requestAnimationFrame(() => fitView({ padding: 0.15, maxZoom: 1, duration: 300 }));
  }, [edges, fitView]);

  // Report the serializable doc upward on every structural change.
  useEffect(() => {
    onDocChange(toDraftDoc(nodes, edges));
  }, [nodes, edges, onDocChange]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((gs) => {
      const next = new Set(gs);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }, []);

  // Column ids that carry an edge — kept visible even when a card is
  // collapsed, so an edge never appears to land on nothing.
  const keepByTable = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const add = (table: string, handle: string | null | undefined) => {
      if (!handle || handle === "t" || !handle.startsWith("c:")) return;
      const set = m.get(table) ?? new Set<string>();
      set.add(handle.slice(2));
      m.set(table, set);
    };
    for (const e of edges) {
      add(e.source, e.sourceHandle);
      add(e.target, e.targetHandle);
    }
    return m;
  }, [edges]);

  // Bands + collapse + per-card expand + edge-derived `keep` are all merged
  // in at DISPLAY time, never mutated into `nodes` state directly — the same
  // "how you're looking isn't the design" split as the read-only map.
  const { bandNodes, visibleNodes } = useMemo(() => {
    const byGroup = new Map<string, Node[]>();
    for (const n of nodes) {
      const group = (n.data as unknown as DraftNodeData).group || "Other";
      const list = byGroup.get(group) ?? [];
      list.push(n);
      byGroup.set(group, list);
    }
    const bandNodes: Node[] = [];
    const visibleNodes: Node[] = [];
    for (const [group, members] of byGroup) {
      const collapsed = collapsedGroups.has(group);
      const rects = members.map((n) => {
        const d = n.data as unknown as DraftNodeData;
        return {
          x: n.position.x,
          y: n.position.y,
          w: NODE_W,
          h: nodeHeightFor({
            columns: d.columns,
            indexes: d.indexes,
            expanded: expandedTables.has(n.id),
            minimized: minimizedTables.has(n.id),
          }),
        };
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
      if (!collapsed) {
        for (const n of members) {
          const d = n.data as unknown as DraftNodeData;
          visibleNodes.push({
            ...n,
            data: {
              ...d,
              keep: keepByTable.get(n.id) ?? new Set<string>(),
              expanded: expandedTables.has(n.id),
              minimized: minimizedTables.has(n.id),
              color: colorForGroup(group, groupColorOverrides),
            },
          });
        }
      }
    }
    return { bandNodes, visibleNodes };
  }, [nodes, collapsedGroups, toggleGroup, keepByTable, expandedTables, minimizedTables, groupColorOverrides]);

  return (
    <ReactFlow
      nodes={[...bandNodes, ...visibleNodes]}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      connectionMode={ConnectionMode.Loose}
      deleteKeyCode={["Backspace", "Delete"]}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      minZoom={0.1}
      maxZoom={1.5}
    >
      <Panel position="top-left" className="flex items-center gap-1.5">
        <ExpandToggle expanded={expanded} onToggle={onToggleExpanded} />
        <SchemaViewSwitcher view={view} onChange={onViewChange} />
        <ControlsMenu onAddTable={addTable} onArrange={arrange} />
      </Panel>
      <Panel position="top-right">{toolbar}</Panel>
      <Panel
        position="bottom-right"
        className="flex items-center gap-3 rounded-field border border-border bg-surface px-3 py-1.5 text-[11.5px] text-text-muted shadow-card"
      >
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
  );
}

export function SchemaDraftCanvas(props: {
  initialDoc: SchemaDraftDoc | null;
  onDocChange: (doc: SchemaDraftDoc) => void;
  view: SchemaView;
  onViewChange: (v: SchemaView) => void;
  toolbar: ReactNode;
}) {
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
    <div
      className={
        expanded
          ? "absolute inset-0 z-40 bg-[#FAFAFA]"
          : "min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-[#FAFAFA]"
      }
    >
      <ReactFlowProvider>
        <DraftCanvasInner {...props} expanded={expanded} onToggleExpanded={() => setExpanded((e) => !e)} />
      </ReactFlowProvider>
    </div>
  );

  const host = expanded && typeof document !== "undefined" ? document.getElementById(MAIN_PANEL_ID) : null;
  return host ? createPortal(canvas, host) : canvas;
}
