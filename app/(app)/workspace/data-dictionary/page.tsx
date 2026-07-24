import { redirect } from "next/navigation";
import { BoardTabs } from "@/components/shell/board-tabs";
import { requireUser } from "@/lib/auth";
import { platformInventory } from "@/lib/repos/admin";
import { DataDictionary } from "../../admin/data/data-dictionary";

// The Data Dictionary — the curated Registry (same panel /admin/data
// renders): what each table means, in prose. The live catalog as a canvas
// (Schema map) and the redesign sandbox (Draft) moved to /workspace/schema —
// Registry is prose/tables and reads better on its own, not sharing a page
// with two canvases that want every pixel of width.

export const dynamic = "force-dynamic";

export default async function WorkspaceDataDictionaryPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/workspace");

  const inventory = await platformInventory();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <BoardTabs />
      <div className="mx-auto w-full max-w-[1400px]">
        <DataDictionary groups={inventory.groups} />
      </div>
    </div>
  );
}
