import { Icon } from "@/components/ui/icons";
import type { NodeProps } from "@xyflow/react";
import { colorForGroup } from "./group-color";

// A group's bounding box — a dashed-border rectangle around its current
// members (recomputed every render from wherever they currently sit), with a
// collapsible header. This is the "dotted line" version from earlier in the
// build; a later pass replaced it with a label-only treatment, which turned
// out to be a miscommunication — restored per founder correction 2026-07-24.
export const GROUP_PAD = 28;
export const GROUP_HEADER_H = 34;
export const GROUP_COLLAPSED_W = 220;

export type GroupNodeData = { name: string; count: number; collapsed: boolean; onToggle: () => void };

/** Bounding rect for a group's box from its members' current positions/sizes,
 *  or the fixed collapsed size when the group is collapsed. */
export function groupBoxRect(
  members: Array<{ x: number; y: number; w: number; h: number }>,
  collapsed: boolean,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of members) {
    minX = Math.min(minX, m.x);
    minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x + m.w);
    maxY = Math.max(maxY, m.y + m.h);
  }
  return {
    x: minX - GROUP_PAD,
    y: minY - GROUP_PAD - GROUP_HEADER_H,
    width: collapsed ? GROUP_COLLAPSED_W : maxX - minX + GROUP_PAD * 2,
    height: collapsed ? GROUP_HEADER_H : maxY - minY + GROUP_PAD * 2 + GROUP_HEADER_H,
  };
}

export function GroupBandNode(props: NodeProps) {
  const d = props.data as unknown as GroupNodeData;
  const color = colorForGroup(d.name);
  return (
    <div className="h-full w-full rounded-2xl border-2 border-dashed border-field-border/70 bg-black/[0.012]">
      <button
        type="button"
        onClick={d.onToggle}
        className={`nodrag pointer-events-auto flex items-center gap-1.5 rounded-t-2xl rounded-br-lg border-b-2 border-dashed border-field-border/70 bg-surface px-3 text-[12.5px] font-semibold shadow-card ${color.text}`}
        style={{ height: GROUP_HEADER_H }}
      >
        <Icon name="chevron-down" size={13} className={`shrink-0 transition-transform ${d.collapsed ? "-rotate-90" : ""}`} />
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color.dot }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">{d.name}</span>
        <span className="shrink-0 font-normal text-text-muted">({d.count})</span>
      </button>
    </div>
  );
}
