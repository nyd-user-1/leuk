import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { localToolsDisabled, localToolsEnabled } from "@/lib/local-tools";
import { RULES } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One rule's source document (docs/rules/<id>.md), opened from the Rules grid on
// /workspace. Admin-only, read/written straight off disk — the same contract the
// fleet's agent identity files use, so one DocSheet serves both. The id is
// checked against the RULES manifest rather than a regex, so nothing outside the
// known set can be addressed at all.

type Params = { params: Promise<{ id: string }> };

function ruleFor(id: string) {
  return RULES.find((r) => r.id === id) ?? null;
}

const pathFor = (id: string) => join(process.cwd(), "docs", "rules", `${id}.md`);

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    if (!localToolsEnabled()) return localToolsDisabled();
    await requireRole("admin");
    const { id } = await params;
    const rule = ruleFor(id);
    if (!rule) return NextResponse.json({ error: "Unknown rule." }, { status: 400 });
    let md: string;
    try {
      md = await readFile(pathFor(id), "utf8");
    } catch {
      return NextResponse.json({ error: "No source document for this rule." }, { status: 404 });
    }
    return NextResponse.json({ title: rule.title, subtitle: `docs/rules/${id}.md`, bodyMd: md });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    if (!localToolsEnabled()) return localToolsDisabled();
    await requireRole("admin");
    const { id } = await params;
    const rule = ruleFor(id);
    if (!rule) return NextResponse.json({ error: "Unknown rule." }, { status: 400 });
    const { bodyMd } = (await req.json()) as { bodyMd?: unknown };
    if (typeof bodyMd !== "string") return NextResponse.json({ error: "bodyMd required." }, { status: 400 });
    await writeFile(pathFor(id), bodyMd, "utf8");
    return NextResponse.json({ title: rule.title, subtitle: `docs/rules/${id}.md`, bodyMd });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
