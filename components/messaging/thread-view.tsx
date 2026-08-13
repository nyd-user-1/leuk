"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { ChatInput } from "@/components/directory/chat-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { formatDateTime } from "@/lib/format";
import type { AvatarHue, Message, Thread } from "@/lib/types";

// Shared secure-messaging thread view (catalog §4 Inbox thread pane) — used
// by the practitioner Inbox and the client portal Messages page. Bubbles:
// mine = teal tint, right-aligned; theirs = white surface, left-aligned.

export interface SenderInfo {
  name: string;
  hue: AvatarHue;
}

// In-app destinations a message body may reference. Agent findings must carry
// an href that resolves (docs/TASK-PRACTICE-AGENTS.md: "a number a clinician
// cannot click through to is a number they will not trust twice"), so this is
// the app's link surface, not just the portal's.
const LINKABLE = /(\/(?:portal|inbox|clients|notes|rates|directory|orgs|billing|networks|plans|calendar)\/?[\w/-]*)/g;

/** Render message bodies with tappable in-app links. */
function MessageBody({ body }: { body: string }) {
  const parts = body.split(LINKABLE);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("/") && p.length > 1 ? (
          <Link key={i} href={p} className="font-medium text-primary underline underline-offset-2">
            {p}
          </Link>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function ThreadView({
  thread,
  messages,
  senders,
  meId,
  canManage,
  frameless,
}: {
  thread: Thread & { clientName: string };
  messages: Message[];
  senders: Record<string, SenderInfo>;
  meId: string;
  /** Practitioner-side: shows the Close / Reopen action. */
  canManage?: boolean;
  /** Skip the card chrome — for panes that already draw the border. */
  frameless?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const sendText = async (text: string) => {
    const draft = text;
    if (!draft.trim() || busy) return;
    setBusy(true);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, body: draft.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast(data?.error ?? "Could not send the message.", "danger");
      return;
    }
    setDraft("");
    router.refresh();
  };

  const setStatus = async (status: "open" | "closed") => {
    setBusy(true);
    const res = await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Could not update the conversation.", "danger");
      return;
    }
    toast(status === "closed" ? "Conversation closed." : "Conversation reopened.", "success");
    router.refresh();
  };

  const closed = thread.status === "closed";

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        frameless ? "bg-surface" : "rounded-card border border-border bg-surface shadow-card"
      }`}
    >
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        {thread.agentId ? <AgentAvatar agentId={thread.agentId} size="md" /> : <Avatar name={thread.clientName} size="md" />}
        {/* Name and the Close control, nothing else. The status badge said
            what the button already says, and the subject repeats the list row
            you clicked to get here. */}
        <div className="min-w-0 flex-1">
          <span className="truncate text-[15px] font-semibold text-text">{thread.clientName}</span>
        </div>
        {canManage && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setStatus(closed ? "open" : "closed")}>
            {closed ? "Reopen" : "Close"}
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.map((m) => {
          const mine = !m.senderAgentId && m.senderId === meId;
          const sender = senders[m.senderAgentId ? `agent:${m.senderAgentId}` : m.senderId];
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`flex max-w-[75%] items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                {m.senderAgentId ? (
                  <AgentAvatar agentId={m.senderAgentId} />
                ) : (
                  <Avatar name={sender?.name ?? "User"} hue={sender?.hue} size="sm" />
                )}
                <div>
                  <div
                    className={`whitespace-pre-wrap rounded-card px-4 py-2.5 text-[15px] text-text ${
                      mine ? "bg-teal-100" : "border border-border bg-surface"
                    }`}
                  >
                    <MessageBody body={m.body} />
                  </div>
                  <p className={`mt-1 text-[13px] text-text-muted ${mine ? "text-right" : ""}`}>
                    {sender?.name ?? "User"} · {formatDateTime(m.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {closed ? (
        <p className="border-t border-border px-5 py-4 text-sm text-text-muted">
          This conversation is closed{canManage ? " — reopen it to reply." : "."}
        </p>
      ) : (
        // The composer /chat and the agent threads use. No model picker and no
        // "/" skills — a patient thread has neither — so ChatInput renders just
        // the field, the "+" and Send. One container, three surfaces.
        <div className="border-t border-border">
          <ChatInput
            onSend={(text) => void sendText(text)}
            onStop={() => {}}
            isStreaming={busy}
            placeholder="Write a message…"
          />
        </div>
      )}
    </div>
  );
}
