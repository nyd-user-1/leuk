import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { listAgentSkills } from "@/lib/repos/agent-skills";

export const dynamic = "force-dynamic";

/** GET /api/agent-skills?agent=bev — the "/" menu's catalogue. Reference data,
 *  not PHI, so no logEvent; practitioner-gated only because the whole
 *  workspace is. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("practitioner");
    const agent = req.nextUrl.searchParams.get("agent") ?? undefined;
    return NextResponse.json({ skills: await listAgentSkills(agent) });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
