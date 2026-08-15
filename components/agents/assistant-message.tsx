"use client";

import { useEffect, useState } from "react";
import type { UIMessage } from "ai";
import dynamic from "next/dynamic";
import { Markdown } from "@/components/directory/markdown";
import { RelationshipMap } from "@/components/directory/relationship-map";
import { ThinkingOrb } from "@/components/directory/thinking-orb";
import { Icon } from "@/components/ui/icons";
import { TextLink } from "@/components/ui/text-link";
import type { OrgGraph } from "@/lib/org-graph";

// One assistant turn, rendered. Lifted out of app/(app)/chat/page.tsx so the
// Inbox's agent threads get the SAME anatomy as /chat rather than a second,
// worse implementation: reasoning accordion → grouped tool status lines →
// streamed markdown → footer → follow-ups → orb. Both surfaces import this;
// there is no other copy.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The whole ProseMirror stack sits behind the pencil, so it stays out of the
// chat bundle until someone actually opens a draft (same reasoning as the
// canvas's dynamic import of @xyflow/react).
const AnswerDocPanel = dynamic(
  () => import("@/components/agents/answer-doc-panel").then((m) => m.AnswerDocPanel),
  { ssr: false },
);

// requireUser() (lib/auth.ts) throws AuthError("Sign in required.", 401) when
// the 15-minute idle timeout has quietly expired mid-page — useChat surfaces
// that as error.message set to the route's raw JSON body
// (`{"error":"Sign in required."}`), which read as a broken app rather than
// an expected security timeout. Caught here so it renders as the latter.
export function isSessionExpiredError(message: string | undefined): boolean {
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
    case "tool-practice_services":
      return running ? "Checking your service catalog…" : "Checked your service catalog";
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
  onEdit,
  hasFollowUps,
  followUpsOpen,
  onToggleFollowUps,
}: {
  text: string;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onEdit: () => void;
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
  // Teal on hover, not grey: these are the answer's actions, and the kit's
  // hover affordance everywhere else is the primary wash + primary ink.
  const btn =
    "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-primary-wash hover:text-primary";
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
      {/* Opens the answer as an editable markdown document (AnswerDocPanel). */}
      {isLast && (
        <button type="button" onClick={onEdit} aria-label="Edit as document" className={btn}>
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
export function AssistantMessage({
  message,
  isCurrent,
  isStreaming,
  followUpsDefault,
  onSend,
  onRegenerate,
  onOrbActivate,
  agentId,
}: {
  message: UIMessage;
  isCurrent: boolean;
  isStreaming: boolean;
  followUpsDefault: boolean;
  onSend: (q: string) => void;
  onRegenerate: () => void;
  onOrbActivate: () => void;
  /** Which agent produced this turn. Only used downstream to decide whether the
   *  draft may leave the BAA boundary (Slack/Discord). */
  agentId?: string;
}) {
  const [open, setOpen] = useState(followUpsDefault);
  useEffect(() => setOpen(followUpsDefault), [followUpsDefault]);
  const [editing, setEditing] = useState(false);

  const settled = !(isStreaming && isCurrent);
  const parts = message.parts;
  const lastTextIdx = parts.reduce((acc, p, i) => (p.type === "text" ? i : acc), -1);
  const bodyTexts: string[] = [];
  // Canvases rendered in this turn, collected for the document seed — a
  // markdown draft can't hold React Flow, so answer-doc.ts serialises them.
  const graphs: OrgGraph[] = [];
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
          if (graph) {
            graphs.push(graph);
            rendered.push(<RelationshipMap key={`${groupKey}:map:${oi}`} graph={graph} />);
          }
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
            onEdit={() => setEditing(true)}
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
      {editing && (
        <AnswerDocPanel
          open
          onClose={() => setEditing(false)}
          messageId={message.id}
          markdown={bodyTexts.join("\n")}
          graphs={graphs}
          source={agentId}
        />
      )}
    </div>
  );
}
