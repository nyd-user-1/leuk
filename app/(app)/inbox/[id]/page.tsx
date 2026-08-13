import { notFound, redirect } from "next/navigation";
import { AgentThreadView } from "@/components/messaging/agent-thread-view";
import { ThreadView } from "@/components/messaging/thread-view";
import { getAgent } from "@/lib/agents/registry";
import { TextLink } from "@/components/ui/text-link";
import { logEvent } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { getThread, markRead } from "@/lib/repos/threads";

// Practitioner thread view — fills the right pane of the inbox split view
// (inbox/layout.tsx). Below lg it takes the whole screen, so it carries a
// back link to the list.

export const dynamic = "force-dynamic";

export default async function InboxThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const { id } = await params;
  const detail = await getThread(id);
  if (!detail) notFound();

  await markRead(id, user.id);
  await logEvent({ actorId: user.id, action: "thread.view", entity: "thread", entityId: id });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-2.5 lg:hidden">
        <TextLink href="/inbox" icon="arrow-left">
          All conversations
        </TextLink>
      </div>
      <div className="min-h-0 flex-1">
        {/* An agent thread streams live (same renderer as /chat) rather than
            posting and waiting; a client thread stays plain secure messaging.
            An agent with no endpoint yet falls through to the read-only view. */}
        {detail.thread.agentId && getAgent(detail.thread.agentId).endpoint ? (
          <AgentThreadView thread={detail.thread} messages={detail.messages} frameless />
        ) : (
        <ThreadView
          thread={detail.thread}
          messages={detail.messages}
          senders={detail.senders}
          meId={user.id}
          canManage
          frameless
        />
        )}
      </div>
    </div>
  );
}
