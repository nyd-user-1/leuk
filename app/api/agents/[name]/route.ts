import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { localToolsDisabled, localToolsEnabled } from "@/lib/local-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One agent's identity file (~/.claude/agents/<name>-agent.md), opened from the
// fleet roster. Admin-only, read/written straight off disk. The name is
// validated against a strict slug so it can't escape the agents directory.

type Params = { params: Promise<{ name: string }> };

const NAME_RE = /^[a-z][a-z0-9-]*$/;

function pathFor(name: string): string | null {
  if (!NAME_RE.test(name)) return null;
  return join(os.homedir(), ".claude", "agents", `${name}-agent.md`);
}

function titleOf(md: string, name: string): string {
  const head = md.split("\n").find((l) => l.startsWith("# "));
  if (head) return head.replace(/^#\s+/, "").trim();
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} agent`;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    if (!localToolsEnabled()) return localToolsDisabled();
    await requireRole("admin");
    const { name } = await params;
    const path = pathFor(name);
    if (!path) return NextResponse.json({ error: "Unknown agent." }, { status: 400 });
    let md: string;
    try {
      md = await readFile(path, "utf8");
    } catch {
      return NextResponse.json({ error: "No identity file for this agent." }, { status: 404 });
    }
    return NextResponse.json({ name, title: titleOf(md, name), subtitle: `${name}-agent`, bodyMd: md });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    if (!localToolsEnabled()) return localToolsDisabled();
    await requireRole("admin");
    const { name } = await params;
    const path = pathFor(name);
    if (!path) return NextResponse.json({ error: "Unknown agent." }, { status: 400 });
    const { bodyMd } = (await req.json()) as { bodyMd?: unknown };
    if (typeof bodyMd !== "string") return NextResponse.json({ error: "bodyMd required." }, { status: 400 });
    await writeFile(path, bodyMd, "utf8");
    return NextResponse.json({ name, title: titleOf(bodyMd, name), subtitle: `${name}-agent`, bodyMd });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
