"use client";

import { AgendaList } from "@/components/calendar/agenda-list";
import { BoardCard } from "@/components/board/board-card";
import { Badge } from "@/components/ui/badge";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { MenuDivider, MenuItem } from "@/components/ui/dropdown-menu";
import { Table, Td, Tr } from "@/components/ui/table";
import type { AppointmentStatus } from "@/lib/types";
import type { MetricDef, MetricValue } from "@/lib/analytics/metrics";
import { DistBody, LineChart, OfferBody, RankingBody, StatBody } from "./charts";

// One metric on the board: a BoardCard (which owns the chrome and the whole
// drag/resize/remove affordance pack) filled with this metric's body. The meta
// row is the source-table chip (opens the dictionary) opposite the kind label,
// which is hq's uppercase shape tag.
//
// The card owns no data. It renders whatever MetricValue the repo produced for
// its key, and reports interactions (remove/resize/about) upward.

function Body({ def, value }: { def: MetricDef; value: MetricValue | undefined }) {
  if (!value) return <p className="text-sm text-text-muted">No data.</p>;
  switch (value.kind) {
    case "missing":
      return (
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
          <Badge variant="warning" className="self-start">
            Not built yet
          </Badge>
          <p className="text-sm text-text-muted">{value.note}</p>
        </div>
      );
    case "stat":
      return <StatBody v={value} />;
    case "ranking":
      return <RankingBody v={value} />;
    case "distribution":
      return <DistBody v={value} />;
    case "series":
    case "area":
      return <LineChart v={value} />;
    case "offer":
      return <OfferBody v={value} />;
    case "agenda":
      return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AgendaList
            groups={[{ key: "next", label: "", items: value.items.map((i) => ({ ...i, status: i.status as AppointmentStatus })) }]}
            emptyText="Nothing left today."
          />
        </div>
      );
    case "table":
      return (
        <div className="min-h-0 flex-1 overflow-auto">
          <Table head={value.cols}>
            {value.rows.map((r, i) => (
              <Tr key={i}>
                {r.map((cell, j) => (
                  <Td key={j} className={j === 0 ? "whitespace-nowrap font-medium" : "whitespace-nowrap tabular-nums"}>
                    {cell}
                  </Td>
                ))}
              </Tr>
            ))}
          </Table>
        </div>
      );
    default:
      return null;
  }
}

export function MetricCard({
  def,
  value,
  onRemove,
  onAbout,
}: {
  def: MetricDef;
  value: MetricValue | undefined;
  onRemove: () => void;
  onAbout: () => void;
}) {
  return (
    <BoardCard
      label={def.label}
      title={def.label}
      titleText={def.label}
      onRemove={onRemove}
      menu={
        <KebabMenu label={`${def.label} actions`} align="right">
          <MenuItem icon="info" label="About this data" onClick={onAbout} />
          {def.poweredPage && <MenuItem icon="arrow-right" label={`Open ${def.poweredPage.label}`} onClick={() => (window.location.href = def.poweredPage!.href)} />}
          <MenuDivider />
          <MenuItem icon="trash" label="Remove from board" onClick={onRemove} danger />
        </KebabMenu>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onAbout}
            data-source-chip={def.sourceTable}
            title={`${def.sourceTable} — what is this?`}
            className="min-w-0 truncate rounded-field font-mono text-[11px] tracking-wide text-text-muted transition-colors hover:text-primary"
          >
            {def.sourceTable}
          </button>
          <span className="shrink-0 text-[9px] uppercase tracking-widest text-text-muted">{def.kind}</span>
        </>
      }
    >
      <Body def={def} value={value} />
    </BoardCard>
  );
}
