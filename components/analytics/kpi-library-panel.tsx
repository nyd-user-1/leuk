"use client";

import { useMemo, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { SidePanel } from "@/components/ui/side-panel";
import { CATEGORIES, type BoardView, type MetricDef, type MetricKind } from "@/lib/analytics/metrics";

// The KPI library — hq's kpi-panel.tsx, image-faithful, in Leuk's light kit
// and the reskinned SidePanel (kicker "KPI LIBRARY").
//
// Kept from hq: the search field, a VIEWS list above the metrics (name + "N
// CARDS"), metrics grouped by category, and each row = shape glyph + label +
// kind + state (ON BOARD / + ADD). Rows are draggable onto the board AND
// click-to-add — both, because hq does both and they suit different moods.

export const DRAG_TYPE = "application/leuk-metric";

/** The shape glyphs — hq's ShapeGlyph, same silhouettes, currentColor. */
function ShapeGlyph({ kind }: { kind: MetricKind }) {
  const p = { width: 14, height: 14, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (kind === "series" || kind === "area")
    return (
      <svg {...p} fill={kind === "area" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {kind === "area" ? <path d="M3 18l5-7 4 3 5-8 4 5v8H3z" opacity="0.9" /> : <path d="M3 15l5-6 4 4 6-8" />}
      </svg>
    );
  if (kind === "ranking")
    return (
      <svg {...p} fill="currentColor">
        <rect x="3" y="4" width="18" height="3" rx="1.5" />
        <rect x="3" y="10.5" width="12" height="3" rx="1.5" />
        <rect x="3" y="17" width="7" height="3" rx="1.5" />
      </svg>
    );
  if (kind === "distribution")
    return (
      <svg {...p} fill="currentColor">
        <rect x="3" y="11" width="3.5" height="9" rx="1" />
        <rect x="8.5" y="6" width="3.5" height="14" rx="1" />
        <rect x="14" y="13" width="3.5" height="7" rx="1" />
        <rect x="19.5" y="9" width="3.5" height="11" rx="1" />
      </svg>
    );
  if (kind === "table" || kind === "agenda")
    return (
      <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </svg>
    );
  // stat
  return (
    <svg {...p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h2v12" />
      <path d="M14 6h2a2 2 0 0 1 0 4h-2a2 2 0 0 0 0 4h2" />
    </svg>
  );
}

function MetricRow({
  def,
  on,
  onAdd,
  onRemove,
  onDragState,
}: {
  def: MetricDef;
  on: boolean;
  onAdd: (k: string) => void;
  onRemove: (k: string) => void;
  onDragState: (dragging: boolean) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        // Drop the scrim's guard FIRST — see the card library's note.
        onDragState(true);
        e.dataTransfer.setData(DRAG_TYPE, def.key);
        e.dataTransfer.setData("text/plain", def.key);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={() => onDragState(false)}
      onClick={() => (on ? onRemove(def.key) : onAdd(def.key))}
      title={on ? "On the board — click to remove" : "Click to add, or drag onto the board"}
      className={`group flex cursor-grab select-none items-center gap-2.5 rounded-field border px-2.5 py-2 transition-colors ${
        on ? "border-primary/40 bg-primary-wash hover:border-danger/40" : "border-border hover:border-primary hover:bg-canvas"
      }`}
    >
      <span className={`shrink-0 ${on ? "text-primary" : "text-text-muted"}`}>
        <ShapeGlyph kind={def.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-text">{def.label}</span>
        <span className="block truncate text-[9px] uppercase tracking-widest text-text-muted">{def.kind}</span>
      </span>
      <span
        className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide ${
          on ? "text-primary group-hover:hidden" : "text-text-muted group-hover:text-primary"
        }`}
      >
        {on ? "On board" : "+ Add"}
      </span>
      {on && <span className="hidden shrink-0 text-[9px] font-semibold uppercase tracking-wide text-danger group-hover:inline">Remove</span>}
    </div>
  );
}

export function KpiLibraryPanel({
  open,
  onClose,
  catalog,
  placed,
  views,
  activeView,
  onAdd,
  onRemove,
  onApplyView,
}: {
  open: boolean;
  onClose: () => void;
  catalog: MetricDef[];
  placed: string[];
  views: BoardView[];
  activeView: string;
  onAdd: (k: string) => void;
  onRemove: (k: string) => void;
  onApplyView: (v: BoardView) => void;
}) {
  const [q, setQ] = useState("");
  // A metric dragged out has to be able to land: the scrim is what the board
  // sits under, so it stops capturing for the length of the drag (NYS-74).
  const [dragging, setDragging] = useState(false);
  const placedSet = useMemo(() => new Set(placed), [placed]);

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const hit = catalog.filter(
      (d) => !query || `${d.label} ${d.category} ${d.kind} ${d.description} ${d.sourceTable}`.toLowerCase().includes(query),
    );
    return CATEGORIES.map((c) => ({ category: c, metrics: hit.filter((m) => m.category === c) })).filter((g) => g.metrics.length > 0);
  }, [catalog, q]);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      kicker="KPI library"
      title="Add metrics"
      icon="grid"
      width="max-w-md"
      dragThrough={dragging}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${catalog.length} metrics…`}
            aria-label="Search metrics"
          />
          <p className="text-[13px] text-text-muted">Drag a metric onto the board, or click to add.</p>
        </div>

        {views.length > 0 && !q.trim() && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[9px] uppercase tracking-widest text-text-muted">Views</p>
            {views.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => onApplyView(v)}
                title="Load this view onto the board"
                className={`flex items-center gap-2.5 rounded-field border px-2.5 py-2 text-left transition-colors ${
                  v.name === activeView ? "border-primary bg-primary-wash" : "border-border hover:border-primary hover:bg-canvas"
                }`}
              >
                <span className="shrink-0 text-text-muted">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{v.name}</span>
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-text-muted">{v.ids.length} cards</span>
              </button>
            ))}
          </div>
        )}

        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">No metric matches “{q}”.</p>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="flex flex-col gap-1.5">
              <p className="text-[9px] uppercase tracking-widest text-text-muted">{g.category}</p>
              {g.metrics.map((m) => (
                <MetricRow
                  key={m.key}
                  def={m}
                  on={placedSet.has(m.key)}
                  onAdd={onAdd}
                  onRemove={onRemove}
                  onDragState={setDragging}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </SidePanel>
  );
}
