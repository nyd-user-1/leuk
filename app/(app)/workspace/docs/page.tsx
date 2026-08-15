import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { notFound, redirect } from "next/navigation";
import { BoardTabs } from "@/components/shell/board-tabs";
import { requireUser } from "@/lib/auth";
import { localToolsEnabled } from "@/lib/local-tools";
import { DocsGallery, type DocMeta } from "./docs-gallery";

// The Docs tab — every markdown file under docs/ as a card, grouped by its
// top-level folder; clicking one opens it in the DocSheet editor (same editable
// pattern as the night report and agent reports, via /api/docs). Server-reads
// the tree the way fleet.tsx reads the agent files; a file that won't read just
// drops out of the listing. Images / CSV / JSON under docs/ aren't markdown-
// editable, so the gallery lists .md only.

export const dynamic = "force-dynamic";

const DOCS_ROOT = join(process.cwd(), "docs");

/** First H1, else the filename prettified — the card title. */
function titleOf(md: string, file: string): string {
  const head = md.split("\n").find((l) => l.startsWith("# "));
  if (head) return head.replace(/^#\s+/, "").trim();
  return file.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

/** Walk docs/ for .md files, newest-first within each top-level group. Best
 *  effort: an unreadable file is skipped, never fatal. */
async function readDocs(): Promise<DocMeta[]> {
  const out: DocMeta[] = [];
  async function walk(dir: string, rel: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        await walk(abs, childRel);
      } else if (e.name.endsWith(".md")) {
        try {
          const [md, s] = await Promise.all([readFile(abs, "utf8"), stat(abs)]);
          const group = childRel.includes("/") ? childRel.slice(0, childRel.indexOf("/")) : "General";
          out.push({ path: childRel, title: titleOf(md, e.name), group, updatedAt: s.mtime.toISOString() });
        } catch {
          // unreadable — leave it out of the gallery
        }
      }
    }
  }
  await walk(DOCS_ROOT, "");
  return out;
}

export default async function WorkspaceDocsPage() {
  if (!localToolsEnabled()) notFound();
  const user = await requireUser();
  if (user.role !== "admin") redirect("/workspace");

  const docs = await readDocs();
  return (
    <div className="mx-auto flex min-w-0 max-w-[1400px] flex-col gap-6">
      <BoardTabs />
      <DocsGallery docs={docs} />
    </div>
  );
}
