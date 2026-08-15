"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { AssistantMessage, isSessionExpiredError } from "@/components/agents/assistant-message";
import { ChatInput } from "@/components/directory/chat-input";
import { MentionText } from "@/components/messaging/mention-text";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { DEFAULT_MODEL_ID } from "@/lib/ai/model-options";
import { commandsFor, getAgent } from "@/lib/agents/registry";
import type { Message, Thread } from "@/lib/types";

// An Inbox thread whose counterparty is a practice agent. This is the /chat
// experience, not a second-class version of it: the SAME AssistantMessage
// renderer, so reasoning, grouped tool status lines and markdown tables stream
// in live rather than the clinician watching a spinner for fifteen seconds.
//
// Two halves that have to agree:
//   • useChat owns the LIVE turn — it streams from the agent's endpoint.
//   • Postgres owns the RECORD — after a turn settles both sides are persisted
//     via /api/messages so the thread survives a reload.
// Stored history seeds useChat on mount, so a reopened thread reads the same
// whether its turns were streamed a second ago or last week.

// Stored turns are markdown, but older rows (and anything an agent wrote before
// the seeds were rewritten) carry bare paths, phone numbers and emails. Promote
// those to real markdown links on the way in, so a replayed turn reads exactly
// like a live one — the Markdown renderer only linkifies [label](href).
const APP_PATH = /(^|[\s(])(\/(?:clients|notes|rates|directory|orgs|billing|networks|plans|calendar|settings)\/?[\w/-]*)/g;
const PHONE = /(^|[\s(])(\(\d{3}\)\s?\d{3}-\d{4}|\d{3}-\d{3}-\d{4})/g;
const EMAIL = /(^|\s)([\w.+-]+@[\w-]+\.[\w.-]+)/g;

function enrich(md: string): string {
  return md
    .replace(/\[[^\]]*\]\([^)]*\)/g, (m) => m) // leave existing links alone
    .replace(APP_PATH, (_m, lead, path) => `${lead}[${path}](${path})`)
    .replace(PHONE, (_m, lead, num) => `${lead}[${num}](tel:${num.replace(/\D/g, "")})`)
    .replace(EMAIL, (_m, lead, addr) => `${lead}[${addr}](mailto:${addr})`);
}

/** DB rows → the shape useChat renders. Reasoning and tool parts were transient
 *  and aren't persisted, so a stored turn replays as enriched markdown. */
function toUIMessages(messages: Message[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.senderAgentId ? ("assistant" as const) : ("user" as const),
    parts: [{ type: "text" as const, text: m.senderAgentId ? enrich(m.body) : m.body }],
  }));
}

export function AgentThreadView({
  thread,
  messages,
  frameless,
}: {
  thread: Thread & { clientName: string };
  messages: Message[];
  frameless?: boolean;
}) {
  const router = useRouter();
  const agent = getAgent(thread.agentId ?? "");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const modelRef = useRef(modelId);
  modelRef.current = modelId;
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);

  const { messages: live, sendMessage, stop, status, error } = useChat({
    id: `thread:${thread.id}`,
    messages: toUIMessages(messages),
    transport: new DefaultChatTransport({
      api: agent.endpoint ?? "/api/ai/directory",
      body: () => ({ agent: agent.id, model: modelRef.current }),
    }),
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Same rule as /chat: follow the stream only while the reader is already at
  // the bottom. Scroll up mid-answer and the view stays put; the FAB is the way
  // back. Yanking someone to the bottom while they're reading is the bug.
  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = near;
    setAtBottom(near);
  };
  useEffect(() => {
    if (atBottomRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [live]);
  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });

  // Persist a settled turn exactly once. Keyed on message id so a re-render
  // (or the effect re-running) can't write the same turn twice.
  const saved = useRef(new Set(messages.map((m) => m.id)));
  useEffect(() => {
    if (isStreaming) return;
    for (const m of live) {
      if (saved.current.has(m.id)) continue;
      const text = m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
        .trim();
      if (!text) continue;
      saved.current.add(m.id);
      void fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          body: text,
          ...(m.role === "assistant" ? { agentId: agent.id } : {}),
        }),
      }).catch(() => {
        // The turn is on screen; losing the write only costs it on reload.
        saved.current.delete(m.id);
      });
    }
  }, [live, isStreaming, thread.id, agent.id]);

  const closed = thread.status === "closed";
  const setStatus = async (status: "open" | "closed") => {
    await fetch(`/api/threads/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  };
  const errText = error
    ? isSessionExpiredError(error.message)
      ? "Your session timed out. Reload the page to sign back in."
      : `${agent.name} is temporarily unavailable.`
    : null;

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        frameless ? "bg-surface" : "rounded-card border border-border bg-surface shadow-card"
      }`}
    >
      {/* Identical to the client thread header: avatar, name, Close. The rule
          is back now that the list pane carries its own search header. */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <AgentAvatar agentId={agent.id} size="md" />
        <div className="min-w-0 flex-1">
          <span className="truncate text-[15px] font-semibold text-text">{agent.name}</span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void setStatus(closed ? "open" : "closed")}>
          {closed ? "Reopen" : "Close"}
        </Button>
      </div>

      <div className="relative min-h-0 flex-1">
      <div ref={scrollerRef} onScroll={handleScroll} className="h-full overflow-y-auto px-5 py-5">
      <div className="mx-auto w-full max-w-[772px] space-y-5">
        {live.map((m, i) =>
          m.role === "user" ? (
            <p
              key={m.id}
              className="ml-auto w-fit max-w-[75%] whitespace-pre-wrap rounded-card bg-teal-100 px-4 py-2.5 text-[15px] text-text"
            >
              <MentionText
                text={m.parts
                  .filter((p): p is { type: "text"; text: string } => p.type === "text")
                  .map((p) => p.text)
                  .join("\n")}
              />
            </p>
          ) : (
            <AssistantMessage
              key={m.id}
              message={m}
              isCurrent={i === live.length - 1}
              isStreaming={isStreaming}
              followUpsDefault
              onSend={(q) => sendMessage({ text: q })}
              onRegenerate={() => {}}
              onOrbActivate={() => {}}
              agentId={agent.id}
            />
          ),
        )}
        {errText && <p className="text-[13px] text-danger">{errText}</p>}
        <div ref={endRef} />
      </div>
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
          className="absolute bottom-4 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-surface text-text-body shadow-card transition-colors hover:text-text"
        >
          <Icon name="chevron-down" size={16} />
        </button>
      )}
      </div>

      <div>
        {/* The /chat composer, not a second one — model picker included, sample
            prompts left off (those are the directory agent's). It carries a
            `leading` slot and hides the model picker when no handler is given,
            so a patient thread can use the same container. */}
        <ChatInput
          onSend={(text) => sendMessage({ text })}
          onStop={stop}
          isStreaming={isStreaming}
          selectedModelId={modelId}
          onModelChange={setModelId}
          placeholder={agent.placeholder}
          mentions
          showPrompts
          commands={commandsFor(agent.id)}
          agentId={agent.id}
        />
      </div>
    </div>
  );
}
