import { redirect } from "next/navigation";
import { BoardTabs } from "@/components/shell/board-tabs";
import { requireUser } from "@/lib/auth";
import { platformInventory } from "@/lib/repos/admin";
import { getSchemaGraph } from "@/lib/repos/schema-map";
import { listSchemaDrafts } from "@/lib/repos/schema-drafts";
import type { SchemaTableMeta } from "@/components/maps/schema-canvas";
import { SchemaViews } from "./schema-views";

// Schema map | Draft — two canvases over the same live catalog: the map is
// read-only (the real database, drawn); the draft is a redesign sandbox
// (user-invented tables/columns/edges, never applied). Split out of the Data
// dictionary (which is Registry-only now) because both of these want the
// full page, not a third of one shared with prose.

export const dynamic = "force-dynamic";

export default async function WorkspaceSchemaPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/workspace");

  const [inventory, schema, drafts] = await Promise.all([
    platformInventory(),
    getSchemaGraph(),
    listSchemaDrafts(user.id),
  ]);

  // Curated group/meaning/count per table — the canvas bands and tooltips.
  const meta: Record<string, SchemaTableMeta> = {};
  for (const g of inventory.groups) {
    for (const t of g.tables) {
      meta[t.name] = { group: g.title, count: t.count, meaning: t.meaning };
    }
  }

  return (
    // h-full, not flex-1: the app shell's own content wrapper (a real,
    // computed-height div) isn't itself a flex container, so flex-1 here has
    // nothing to size against — h-full rides its parent's actual pixel
    // height instead, same fix /maps' root already relies on.
    <div className="flex h-full min-w-0 flex-col gap-6">
      <BoardTabs />
      <SchemaViews schema={schema} meta={meta} initialDrafts={drafts} />
    </div>
  );
}
