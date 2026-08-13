import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { logEvent } from "@/lib/audit";
import { clientForUser, getThread, postMessage } from "@/lib/repos/threads";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
}

/** Post a message to a thread the caller may access. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { threadId, body, agentId } = (await req.json()) as {
      threadId?: string;
      body?: string;
      /** Set when persisting an agent's turn after it finished streaming. */
      agentId?: string;
    };
    if (!threadId || !body?.trim()) {
      return NextResponse.json({ error: "threadId and body are required." }, { status: 400 });
    }
    const detail = await getThread(threadId);
    if (!detail) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (user.role === "client") {
      const client = await clientForUser(user.id);
      if (!client || detail.thread.clientId !== client.id) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      if (detail.thread.status === "closed") {
        return NextResponse.json({ error: "This conversation is closed." }, { status: 400 });
      }
    }
    // An agent turn may only be stored on that agent's own thread, and only by
    // staff. Without this check any caller could forge a message attributed to
    // Bev on someone else's conversation.
    if (agentId) {
      if (user.role === "client") return NextResponse.json({ error: "Not found." }, { status: 404 });
      if (detail.thread.agentId !== agentId) {
        return NextResponse.json({ error: "Agent does not own this thread." }, { status: 400 });
      }
    }
    const message = await postMessage(threadId, user.id, body.trim(), agentId ?? null);
    await logEvent({
      actorId: user.id,
      action: "message.send",
      entity: "message",
      entityId: message.id,
      meta: { thread: threadId, ...(agentId ? { agent: agentId } : {}) },
    });
    return NextResponse.json(message, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
