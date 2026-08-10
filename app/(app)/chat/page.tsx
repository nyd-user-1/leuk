"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { ChatInput } from "@/components/directory/chat-input";
import { Markdown } from "@/components/directory/markdown";
import { RelationshipMap } from "@/components/directory/relationship-map";
import { ThinkingOrb } from "@/components/directory/thinking-orb";
import { Icon, type IconName } from "@/components/ui/icons";
import { TextLink } from "@/components/ui/text-link";
import type { OrgGraph } from "@/lib/org-graph";

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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// requireUser() (lib/auth.ts) throws AuthError("Sign in required.", 401) when
// the 15-minute idle timeout has quietly expired mid-page — useChat surfaces
// that as error.message set to the route's raw JSON body
// (`{"error":"Sign in required."}`), which read as a broken app rather than
// an expected security timeout. Caught here so it renders as the latter.
function isSessionExpiredError(message: string | undefined): boolean {
  if (!message) return false;
  try {
    return (JSON.parse(message) as { error?: string })?.error === "Sign in required.";
  } catch {
    return message.includes("Sign in required");
  }
}

// One status line per GROUP of consecutive same-tool calls — parallel calls
// merge their subjects ("Checked Oxford and Empire published rates") instead
// of listing the same tool twice.
function joinSubjects(vals: Array<string | undefined>): string {
  const uniq = [...new Set(vals.filter((v): v is string => !!v).map((v) => cap(v.trim())))];
  if (!uniq.length) return "";
  if (uniq.length === 1) return ` ${uniq[0]}`;
  return ` ${uniq.slice(0, -1).join(", ")} and ${uniq[uniq.length - 1]}`;
}

function groupToolLabel(type: string, inputs: Array<Record<string, unknown>>, running: boolean): string | null {
  switch (type) {
    case "tool-market_rates": {
      const s = joinSubjects(inputs.map((i) => (typeof i.payer === "string" ? i.payer : undefined)));
      return running ? `Checking${s} published rates…` : `Checked${s} published rates`;
    }
    case "tool-search_providers": {
      const s = joinSubjects(
        inputs.map((i) => [i.city, i.county, i.zip].find((v) => typeof v === "string" && v) as string | undefined),
      );
      const suffix = s ? ` in${s}` : "";
      return running ? `Searching providers${suffix}…` : `Searched providers${suffix}`;
    }
    case "tool-get_provider": {
      const n = inputs.length;
      if (n > 1) return running ? `Pulling ${n} provider records…` : `Pulled ${n} provider records`;
      return running ? "Pulling provider record…" : "Pulled provider record";
    }
    case "tool-relationship_map": {
      const s = joinSubjects(inputs.map((i) => (typeof i.org === "string" ? i.org : undefined)));
      return running ? `Mapping${s} relationships…` : `Mapped${s} relationships`;
    }
    case "tool-directory_facets":
      return running ? "Loading filters…" : "Loaded filters";
    default:
      return null;
  }
}

// The model ends each answer with a FOLLOW_UPS: block (see DIRECTORY_SYSTEM);
// strip it from the rendered body and surface the questions as links.
function splitFollowUps(text: string): { body: string; followUps: string[] } {
  const idx = text.search(/\n?FOLLOW_UPS:\s*(\n|$)/);
  if (idx === -1) return { body: text, followUps: [] };
  const followUps = text
    .slice(idx)
    .replace(/^\n?FOLLOW_UPS:\s*\n?/, "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*\d.)]+\s*)?/, "").replace(/^<|>$/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return { body: text.slice(0, idx).trimEnd(), followUps };
}

// Chain-of-thought: collapsed accordion always — just the "Thinking" label,
// shimmering gray→black while the model reasons, settling to teal when done.
// Expand it to read the full internal chain of thought (works mid-stream too).
function ReasoningBlock({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  if (!text.trim() && !live) return null;
  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide"
      >
        <span className={live ? "text-shimmer" : "text-primary"}>Thinking</span>
        <Icon
          name="chevron-down"
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""} ${live ? "text-text-muted" : "text-primary"}`}
        />
      </button>
      {open && text.trim() && (
        <div className="mt-1 border-l-2 border-primary/30 pl-3">
          <p className="whitespace-pre-wrap text-[12.5px] italic leading-relaxed text-text-muted">{text}</p>
        </div>
      )}
    </div>
  );
}

// Kit has no thumbs glyphs — inline lucide paths, page-local.
const THUMB_UP = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 10v12" />
    <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
  </svg>
);
const THUMB_DOWN = (
  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 14V2" />
    <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
  </svg>
);

// Minimalist footer: [+ follow-ups toggle] copy · thumbs · retry.
function AnswerFooter({
  text,
  isLast,
  busy,
  onRegenerate,
  hasFollowUps,
  followUpsOpen,
  onToggleFollowUps,
}: {
  text: string;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
  hasFollowUps: boolean;
  followUpsOpen: boolean;
  onToggleFollowUps: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const copy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const btn = "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-canvas hover:text-text";
  return (
    <div className="mt-1.5 flex items-center gap-0.5 text-text-muted">
      {hasFollowUps && (
        <button
          type="button"
          onClick={onToggleFollowUps}
          aria-label={followUpsOpen ? "Hide suggested follow-ups" : "Show suggested follow-ups"}
          aria-expanded={followUpsOpen}
          className={`${btn} ${followUpsOpen ? "text-primary" : ""}`}
        >
          <Icon name="plus" size={15} className={`transition-transform ${followUpsOpen ? "rotate-45" : ""}`} />
        </button>
      )}
      <button type="button" onClick={copy} aria-label="Copy answer" className={btn}>
        <Icon name={copied ? "check" : "copy"} size={14} className={copied ? "text-success" : undefined} />
      </button>
      {isLast && (
        <button type="button" onClick={onRegenerate} disabled={busy} aria-label="Regenerate answer" className={`${btn} disabled:opacity-40`}>
          <Icon name="refresh-cw" size={13} />
        </button>
      )}
      {/* Stub — wired to nothing yet. */}
      {isLast && (
        <button type="button" aria-label="Edit" className={btn}>
          <Icon name="edit" size={14} />
        </button>
      )}
      <span className="ml-auto flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setVote(vote === "up" ? null : "up")}
          aria-label="Good answer"
          className={`${btn} ${vote === "up" ? "text-primary" : ""}`}
        >
          {THUMB_UP}
        </button>
        <button
          type="button"
          onClick={() => setVote(vote === "down" ? null : "down")}
          aria-label="Bad answer"
          className={`${btn} ${vote === "down" ? "text-primary" : ""}`}
        >
          {THUMB_DOWN}
        </button>
      </span>
    </div>
  );
}

// One assistant turn: parts → footer → follow-ups (accordion) → orb (latest
// turn only; breathing while that turn streams, at rest once settled).
function AssistantMessage({
  message,
  isCurrent,
  isStreaming,
  followUpsDefault,
  onSend,
  onRegenerate,
  onOrbActivate,
}: {
  message: UIMessage;
  isCurrent: boolean;
  isStreaming: boolean;
  followUpsDefault: boolean;
  onSend: (q: string) => void;
  onRegenerate: () => void;
  onOrbActivate: () => void;
}) {
  const [open, setOpen] = useState(followUpsDefault);
  useEffect(() => setOpen(followUpsDefault), [followUpsDefault]);

  const settled = !(isStreaming && isCurrent);
  const parts = message.parts;
  const lastTextIdx = parts.reduce((acc, p, i) => (p.type === "text" ? i : acc), -1);
  const bodyTexts: string[] = [];
  let followUps: string[] = [];
  const rendered: React.ReactNode[] = [];
  let pi = 0;
  while (pi < parts.length) {
    const part = parts[pi];
    if (part.type === "text") {
      let body = part.text;
      if (pi === lastTextIdx) {
        const split = splitFollowUps(part.text);
        body = split.body;
        followUps = split.followUps;
      }
      bodyTexts.push(body);
      rendered.push(<Markdown key={pi} md={body} />);
      pi++;
      continue;
    }
    if (part.type === "reasoning") {
      const reasoningLive = "state" in part ? part.state === "streaming" : !settled;
      rendered.push(<ReasoningBlock key={pi} text={part.text} live={reasoningLive && !settled} />);
      pi++;
      continue;
    }
    if (part.type.startsWith("tool-")) {
      // Group consecutive calls to the SAME tool into one status line.
      const type = part.type;
      const inputs: Array<Record<string, unknown>> = [];
      const outputs: unknown[] = [];
      let running = false;
      const groupKey = pi;
      while (pi < parts.length && parts[pi].type === type) {
        const p = parts[pi];
        inputs.push((("input" in p ? p.input : undefined) ?? {}) as Record<string, unknown>);
        outputs.push("output" in p ? p.output : undefined);
        if ("state" in p && p.state !== "output-available" && p.state !== "output-error") running = true;
        pi++;
      }
      const label = groupToolLabel(type, inputs, running);
      if (label) {
        // Teal while running, then FADE to a lighter teal (never grey).
        rendered.push(
          <p
            key={groupKey}
            className={`my-1 flex items-center gap-1.5 text-[12px] transition-colors duration-700 ${
              running ? "animate-pulse text-primary" : "text-primary/50"
            }`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${running ? "bg-primary" : "bg-primary/40"}`} />
            {label}
          </p>,
        );
      }
      // Generative UI: a relationship_map result mounts the org canvas
      // inline, right under its status line.
      if (type === "tool-relationship_map") {
        outputs.forEach((o, oi) => {
          const graph = (o as { graph?: OrgGraph } | undefined)?.graph;
          if (graph) rendered.push(<RelationshipMap key={`${groupKey}:map:${oi}`} graph={graph} />);
        });
      }
      continue;
    }
    pi++;
  }

  return (
    <div className="px-1">
      <div>
        {rendered}
        {settled && (
          <AnswerFooter
            text={bodyTexts.join("\n")}
            isLast={isCurrent}
            busy={isStreaming}
            onRegenerate={onRegenerate}
            hasFollowUps={followUps.length > 0}
            followUpsOpen={open}
            onToggleFollowUps={() => setOpen((o) => !o)}
          />
        )}
        {settled && open && followUps.length > 0 && (
          <div className="mt-6 flex flex-col items-start gap-1.5">
            {followUps.map((q) => (
              <TextLink key={q} onClick={() => onSend(q)} className="text-left">
                {q}
              </TextLink>
            ))}
          </div>
        )}
        {isCurrent && (
          <div className="mt-4">
            <ThinkingOrb
              size={26}
              isThinking={isStreaming}
              tooltip="Hi, I'm Leuk. How can I help you today?"
              onActivate={onOrbActivate}
            />
          </div>
        )}
      </div>
    </div>
  );
}

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
