import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { localToolsDisabled, localToolsEnabled } from "@/lib/local-tools";

// One docs/ markdown file, for the /workspace Docs gallery editor. Admin-only
// (the docs tree is the founder's), read/written straight off docs/. The path
// segments are resolved and confined to docs/ so a request can never climb out
// of it, and only .md files are editable here. GET → {title, subtitle, bodyMd}
// (the DocSheet shape); PATCH {bodyMd} saves. No DB, no PHI.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCS_ROOT = join(process.cwd(), "docs");

/** Resolve the request's path array to an absolute .md path inside docs/, or
 *  null if it would escape the tree or isn't a markdown file. */
function pathFor(parts: string[]): string | null {
  const rel = parts.map((p) => decodeURIComponent(p)).join("/");
  if (!rel.endsWith(".md")) return null;
  const abs = resolve(DOCS_ROOT, rel);
  if (abs !== DOCS_ROOT && !abs.startsWith(DOCS_ROOT + sep)) return null;
  return abs;
}

function titleOf(md: string, fallback: string): string {
  const head = md.split("\n").find((l) => l.startsWith("# "));
  return head ? head.replace(/^#\s+/, "").trim() : fallback;
}

type Params = { params: Promise<{ path: string[] }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    if (!localToolsEnabled()) return localToolsDisabled();
    await requireRole("admin");
    const { path } = await params;
    const abs = pathFor(path);
    if (!abs) return NextResponse.json({ error: "Unknown document." }, { status: 400 });
    const rel = path.map((p) => decodeURIComponent(p)).join("/");
    let md: string;
    try {
      md = await readFile(abs, "utf8");
    } catch {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }
    return NextResponse.json({ title: titleOf(md, rel), subtitle: `docs/${rel}`, bodyMd: md });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    if (!localToolsEnabled()) return localToolsDisabled();
    await requireRole("admin");
    const { path } = await params;
    const abs = pathFor(path);
    if (!abs) return NextResponse.json({ error: "Unknown document." }, { status: 400 });
    const rel = path.map((p) => decodeURIComponent(p)).join("/");
    const { bodyMd } = (await req.json()) as { bodyMd?: unknown };
    if (typeof bodyMd !== "string") return NextResponse.json({ error: "bodyMd required." }, { status: 400 });
    await writeFile(abs, bodyMd, "utf8");
    return NextResponse.json({ title: titleOf(bodyMd, rel), subtitle: `docs/${rel}`, bodyMd });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
