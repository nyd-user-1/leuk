"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { ChatInput } from "@/components/directory/chat-input";
import { Icon, type IconName } from "@/components/ui/icons";
import { ThinkingOrb } from "@/components/directory/thinking-orb";
import { TextLink } from "@/components/ui/text-link";
import { AssistantMessage, isSessionExpiredError } from "@/components/agents/assistant-message";
import { commandsFor } from "@/lib/agents/registry";

// /chat — chat surface for the care-directory agent. Streams from
// POST /api/ai/directory (AI SDK UI message stream): text renders as it
// generates and tool calls surface live as status lines. Reference data only,
// no PHI. Message anatomy (ruling 2026-07-22): answer → footer icons →
// suggested follow-ups (accordion, + in the footer toggles; default set via
// the input's settings gear, persisted) → the orb, which trails the stream
// and rests last on the newest answer. No page H1 (ownsPageTitle).

const STARTERS: Array<{ icon: IconName; label: string; prompt: string }> = [
  { icon: "dollar", label: "Cigna 60-min rate", prompt: "What does Cigna pay for a 60-minute therapy session?" },
  { icon: "map-pin", label: "Psychiatrists in Brooklyn", prompt: "Find psychiatrists in Brooklyn accepting new patients" },
  { icon: "activity", label: "Oxford vs Empire", prompt: "Compare Oxford and Empire rates for medication management" },
  { icon: "id-card", label: "Top-paid groups", prompt: "Which group practices get paid the most for intakes?" },
  { icon: "pill-bottle", label: "Med-management rates", prompt: "Which insurer pays the most for medication management (99214)?" },
  { icon: "users-round", label: "Therapists in Manhattan", prompt: "Find therapists in Manhattan accepting new patients" },
  { icon: "id-card", label: "Map Headway", prompt: "Show me the relationship map for Headway — who bills under it and which insurance plans pay it" },
];

const FOLLOWUPS_KEY = "leuk-chat-followups";


export default function ChatPage() {
  const [model, setModel] = useState("claude-haiku-4-5");
  const modelRef = useRef(model);
  modelRef.current = model;

  // Default visibility of suggested follow-ups — toggled via the input's
  // settings gear, persisted per browser.
  const [followUpsDefault, setFollowUpsDefault] = useState(true);
  useEffect(() => {
    const v = localStorage.getItem(FOLLOWUPS_KEY);
    if (v !== null) setFollowUpsDefault(v === "1");
  }, []);
  const changeFollowUpsDefault = (v: boolean) => {
    setFollowUpsDefault(v);
    localStorage.setItem(FOLLOWUPS_KEY, v ? "1" : "0");
  };

  const { messages, sendMessage, stop, status, error, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/ai/directory",
      body: () => ({ model: modelRef.current }),
    }),
  });

  const isStreaming = status === "submitted" || status === "streaming";

  // Sticky-bottom scrolling: follow the stream only while the reader is at the
  // bottom. Scroll up mid-stream and the thread stays put (content keeps
  // streaming below the fold) with a jump-to-latest button as the way back.
  const endRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const atBottomRef = useRef(true);
  const handleScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
  };
  useEffect(() => {
    if (atBottomRef.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);
  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });

  const send = (text: string) => {
    if (!text.trim() || isStreaming) return;
    void sendMessage({ text });
  };

  const [inputPing, setInputPing] = useState(0);
  const pingInput = () => setInputPing((p) => p + 1);

  const input = (
    <ChatInput
              showPrompts
              mentions
              commands={commandsFor("directory")}
              agentId="directory"
      onSend={send}
      onStop={stop}
      isStreaming={isStreaming}
      selectedModelId={model}
      onModelChange={setModel}
      followUpsDefault={followUpsDefault}
      onFollowUpsDefaultChange={changeFollowUpsDefault}
      ping={inputPing}
      autoFocus
    />
  );

  // Empty thread: input centered vertically; short iconed prompt chips wrap
  // beneath it, left-aligned to the input container's edge (chat-vue layout).
  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="w-full">{input}</div>
        <div className="w-full px-1.5 sm:px-4">
          {/* Single line, width-matched to the input above it (same 770px/mx-auto
              frame) — a fade to --color-surface on each edge signals there's more
              to scroll instead of wrapping to a second row. */}
          <div className="relative mx-auto w-full max-w-[770px]">
            <div className="no-scrollbar flex w-full flex-nowrap gap-2 overflow-x-auto scroll-smooth">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => send(s.prompt)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-text transition-colors hover:border-primary hover:text-primary"
                >
                  <Icon name={s.icon} size={14} className="text-primary" />
                  {s.label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent" />
          </div>
        </div>
      </div>
    );
  }

  // With messages: scrollable thread (scrollbar hidden — everyone knows a chat
  // scrolls) + input pinned to the bottom.
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-4">
          {messages.map((message, mi) =>
            message.role === "user" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-card rounded-br-sm bg-primary px-3.5 py-2 text-[13.5px] text-white">
                  {message.parts.map((part, i) => (part.type === "text" ? <span key={i}>{part.text}</span> : null))}
                </div>
              </div>
            ) : (
              <AssistantMessage
                key={message.id}
                message={message}
                isCurrent={mi === messages.length - 1}
                isStreaming={isStreaming}
                followUpsDefault={followUpsDefault}
                onSend={send}
                onRegenerate={() => void regenerate()}
                onOrbActivate={pingInput}
              />
            ),
          )}
          {status === "submitted" && (
            <div className="px-1 py-2">
              <ThinkingOrb size={30} isThinking tooltip="Hi, I'm Leuk. How can I help you today?" onActivate={pingInput} />
            </div>
          )}
          {error && isSessionExpiredError(error.message) ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-field border border-warning/30 bg-warning-tint px-3 py-2.5 text-[13px] text-text">
              <span className="flex items-center gap-2">
                <Icon name="lock" size={15} className="shrink-0 text-warning" />
                Your session ended after 15 minutes idle, for security — sign in again to keep chatting.
              </span>
              <TextLink href="/sign-in" className="shrink-0">
                Sign in
              </TextLink>
            </div>
          ) : (
            error && (
              <p className="rounded-field bg-danger-tint px-3 py-2 text-[13px] text-danger">
                {error.message || "The directory assistant is temporarily unavailable."}
              </p>
            )
          )}
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
      <div className="shrink-0">{input}</div>
    </div>
  );
}
