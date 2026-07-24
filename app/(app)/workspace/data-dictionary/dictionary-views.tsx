"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui/spinner";
import { DataDictionary } from "../../admin/data/data-dictionary";
import type { DictionaryGroup } from "@/lib/repos/admin";
import type { SchemaGraph } from "@/lib/repos/schema-map";
import type { SchemaTableMeta } from "@/components/maps/schema-canvas";
import type { SchemaDraftMeta } from "@/lib/schema-draft";
import { SchemaDraftClient } from "./schema-draft-client";

// Registry | Schema map | Draft — three views of the same truth. The
// registry is curated prose; the map is the live catalog as a read-only
// canvas; the draft is a redesign sandbox — user-invented tables/columns/
// edges, never applied to the real schema. Toggle is the org-map segmented
// pattern.

const SchemaCanvas = dynamic(() => import("@/components/maps/schema-canvas").then((m) => m.SchemaCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-[72vh] items-center justify-center">
      <Spinner size={22} className="text-text-muted" />
    </div>
  ),
});

export function DictionaryViews({
  groups,
  schema,
  meta,
  initialDrafts,
}: {
  groups: DictionaryGroup[];
  schema: SchemaGraph;
  meta: Record<string, SchemaTableMeta>;
  initialDrafts: SchemaDraftMeta[];
}) {
  const [view, setView] = useState<"registry" | "map" | "draft">("registry");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-9 w-fit items-center overflow-hidden rounded-field border border-border bg-surface shadow-card">
        {(
          [
            ["registry", "Registry"],
            ["map", "Schema map"],
            ["draft", "Draft"],
          ] as const
        ).map(([key, label], i) => (
          <span key={key} className="flex h-full items-center">
            {i > 0 && <span className="h-5 w-px bg-border" aria-hidden />}
            <button
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`h-full px-3 text-[13px] font-medium transition-colors ${
                view === key ? "bg-[rgba(0,0,0,0.05)] text-text" : "text-text-body hover:text-primary"
              }`}
            >
              {label}
            </button>
          </span>
        ))}
      </div>
      {/* Registry is prose/tables — capped for readability. Map/Draft are
          canvases that want every pixel of available width, so the cap
          (and the mx-auto that centers it) applies only here, not at the
          page level — otherwise collapsing the sidebar frees real width
          that the canvases below could use but wouldn't. */}
      {view === "registry" && (
        <div className="mx-auto w-full max-w-[1400px]">
          <DataDictionary groups={groups} />
        </div>
      )}
      {view === "map" && (
        <div className="flex h-[72vh] min-h-[480px] flex-col">
          <SchemaCanvas schema={schema} meta={meta} />
        </div>
      )}
      {view === "draft" && <SchemaDraftClient schema={schema} meta={meta} initialDrafts={initialDrafts} />}
    </div>
  );
}
