"use client";

import { type ReactNode, useState } from "react";
import { DrillDownScaffold } from "@/components/shell/drill-down-scaffold";

export interface EmployerTab {
  key: string;
  label: string;
  count?: number;
  content: ReactNode;
}

// The employer drill-down record (DrillDownScaffold): the identity rail rides
// in as the object panel; tab content is rendered server-side in page.tsx and
// slotted here. Inactive tabs stay MOUNTED (hidden) so nothing re-fetches —
// distinct from the orgs/provider records, which single-render with TabReveal.
export function EmployerTabs({
  tabs,
  initialTab,
  object,
}: {
  tabs: EmployerTab[];
  initialTab?: string;
  object: ReactNode;
}) {
  const valid = (k?: string) => (k && tabs.some((t) => t.key === k) ? k : undefined);
  const [active, setActive] = useState<string>(valid(initialTab) ?? tabs[0]?.key ?? "");

  return (
    <DrillDownScaffold
      object={object}
      tabs={tabs.map(({ key, label, count }) => ({ key, label, count }))}
      active={active}
      onChange={setActive}
    >
      {tabs.map((t) => (
        <div key={t.key} hidden={t.key !== active} className="h-full min-h-0">
          {t.content}
        </div>
      ))}
    </DrillDownScaffold>
  );
}
