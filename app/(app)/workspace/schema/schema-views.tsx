"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/spinner";
import type { SchemaGraph } from "@/lib/repos/schema-map";
import type { SchemaTableMeta } from "@/components/maps/schema-canvas";
import type { SchemaView } from "@/components/maps/schema-view-switcher";
import type { SchemaDraftMeta } from "@/lib/schema-draft";
import { SchemaDraftClient } from "./schema-draft-client";

// Schema map | Draft — the toggle itself now lives INSIDE whichever canvas is
// mounted (a Panel, org-map style) rather than as a page-chrome tab row, so
// this shell just decides which canvas to mount and hands both the same
// view/onViewChange pair.

const SchemaCanvas = dynamic(() => import("@/components/maps/schema-canvas").then((m) => m.SchemaCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center">
      <Spinner size={22} className="text-text-muted" />
    </div>
  ),
});

export function SchemaViews({
  schema,
  meta,
  initialDrafts,
}: {
  schema: SchemaGraph;
  meta: Record<string, SchemaTableMeta>;
  initialDrafts: SchemaDraftMeta[];
}) {
  const [view, setView] = useState<SchemaView>("map");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {view === "map" && <SchemaCanvas schema={schema} meta={meta} view={view} onViewChange={setView} />}
      {view === "draft" && (
        <SchemaDraftClient schema={schema} meta={meta} initialDrafts={initialDrafts} view={view} onViewChange={setView} />
      )}
    </div>
  );
}
