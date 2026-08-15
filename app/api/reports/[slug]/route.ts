import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { localToolsDisabled, localToolsEnabled } from "@/lib/local-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One agent report's markdown, for the /workspace reports viewer/editor.
// Admin-only (the fleet ledger is the founder's), read/written straight off
// docs/reports/. The slug is validated against the report filename shape so it
// can never escape the reports directory. No DB, no PHI.

type Params = { params: Promise<{ slug: string }> };

const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

function pathFor(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return null;
  return join(process.cwd(), "docs", "reports", `${slug}.md`);
}

function titleOf(md: string, slug: string): string {
  const head = md.split("\n").find((l) => l.startsWith("# "));
  return head ? head.replace(/^#\s+/, "").trim() : slug;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    if (!localToolsEnabled()) return localToolsDisabled();
    await requireRole("admin");
    const { slug } = await params;
    const path = pathFor(slug);
    if (!path) return NextResponse.json({ error: "Unknown report." }, { status: 400 });
    let md: string;
    try {
      md = await readFile(path, "utf8");
    } catch {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }
    return NextResponse.json({ slug, title: titleOf(md, slug), subtitle: slug, bodyMd: md });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    if (!localToolsEnabled()) return localToolsDisabled();
    await requireRole("admin");
    const { slug } = await params;
    const path = pathFor(slug);
    if (!path) return NextResponse.json({ error: "Unknown report." }, { status: 400 });
    const { bodyMd } = (await req.json()) as { bodyMd?: unknown };
    if (typeof bodyMd !== "string") return NextResponse.json({ error: "bodyMd required." }, { status: 400 });
    await writeFile(path, bodyMd, "utf8");
    return NextResponse.json({ slug, title: titleOf(bodyMd, slug), subtitle: slug, bodyMd });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
