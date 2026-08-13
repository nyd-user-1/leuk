"use client";

import { useMemo, useState } from "react";
import { SearchInput } from "@/components/ui/search-input";
import { SidePanel } from "@/components/ui/side-panel";
import { Icon, type IconName } from "@/components/ui/icons";

// The card library — the KPI library's pattern (components/analytics/
// kpi-library-panel.tsx) for a record board: search, sections, and rows that
// read ON BOARD / + ADD. Click to add, or drag onto the board.
//
// Generic over what a record's cards ARE: the host passes a catalog. The client
// board is the first caller; /orgs and the provider rail are meant to follow.

export const CARD_DRAG_TYPE = "application/leuk-record-card";

/** A record's card sections, in the order the library lists them. */
export type CardCategory = "Care" | "Money" | "Records";

export interface LibraryCard {
  key: string;
  title: string;
  category: CardCategory;
  icon: IconName;
  /** One line on what the card holds — the row's second line. */
  blurb: string;
}

const CATEGORY_ORDER: CardCategory[] = ["Care", "Money", "Records"];

function CardRow({
  card,
  on,
  onAdd,
  onRemove,
  onDragState,
}: {
  card: LibraryCard;
  on: boolean;
  onAdd: (k: string) => void;
  onRemove: (k: string) => void;
  onDragState: (dragging: boolean) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        // Drop the scrim's guard FIRST: it is what the board sits under, so the
        // drag has to be declared before anything that could throw on the way.
        onDragState(true);
        e.dataTransfer.setData(CARD_DRAG_TYPE, card.key);
        e.dataTransfer.setData("text/plain", card.key);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onDragEnd={() => onDragState(false)}
      onClick={() => (on ? onRemove(card.key) : onAdd(card.key))}
      title={on ? "On the board — click to remove" : "Click to add, or drag onto the board"}
      className={`group flex cursor-grab select-none items-center gap-2.5 rounded-field border px-2.5 py-2 transition-colors ${
        on ? "border-primary/40 bg-primary-wash hover:border-danger/40" : "border-border hover:border-primary hover:bg-canvas"
      }`}
    >
      <span className={`shrink-0 ${on ? "text-primary" : "text-text-muted"}`}>
        <Icon name={card.icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-text">{card.title}</span>
        <span className="block truncate text-[11px] text-text-muted">{card.blurb}</span>
      </span>
      <span
        className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide ${
          on ? "text-primary group-hover:hidden" : "text-text-muted group-hover:text-primary"
        }`}
      >
        {on ? "On board" : "+ Add"}
      </span>
      {on && (
        <span className="hidden shrink-0 text-[9px] font-semibold uppercase tracking-wide text-danger group-hover:inline">
          Remove
        </span>
      )}
    </div>
  );
}

export function CardLibraryPanel({
  open,
  onClose,
  catalog,
  placed,
  onAdd,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  catalog: LibraryCard[];
  placed: string[];
  onAdd: (k: string) => void;
  onRemove: (k: string) => void;
}) {
  const [q, setQ] = useState("");
  // A row being dragged out has to be able to land: the scrim is what the board
  // sits under, so it stops capturing for the length of the drag (NYS-74).
  const [dragging, setDragging] = useState(false);
  const placedSet = useMemo(() => new Set(placed), [placed]);

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase();
    const hit = catalog.filter((c) => !query || `${c.title} ${c.category} ${c.blurb}`.toLowerCase().includes(query));
    return CATEGORY_ORDER.map((c) => ({ category: c, cards: hit.filter((x) => x.category === c) })).filter(
      (g) => g.cards.length > 0,
    );
  }, [catalog, q]);

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      kicker="Card library"
      title="Add cards"
      icon="grid"
      width="max-w-md"
      dragThrough={dragging}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${catalog.length} cards…`}
            aria-label="Search cards"
          />
          <p className="text-[13px] text-text-muted">Click a card to add it, or drag it onto the board.</p>
        </div>

        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">No card matches “{q}”.</p>
        ) : (
          groups.map((g) => (
            <div key={g.category} className="flex flex-col gap-1.5">
              <p className="text-[9px] uppercase tracking-widest text-text-muted">{g.category}</p>
              {g.cards.map((c) => (
                <CardRow
                  key={c.key}
                  card={c}
                  on={placedSet.has(c.key)}
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
