"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AppPanel } from "@/components/ui/app-panel";
import { Icon } from "@/components/ui/icons";
import { Tag } from "@/components/ui/tag";
import { MODEL_OPTIONS, DEFAULT_MODEL_ID } from "@/lib/ai/model-options";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { AGENTS, getAgent } from "@/lib/agents/registry";
import { closeAgentPanel, setAgentId, useAgentPanel } from "@/lib/agents/panel-store";

// The agent dock — one chat surface reachable from anywhere in the workspace.
//
// AppShell mounts this exactly once, outside the routed subtree, which is what
// makes the transcript survive navigation: drill from /directory into a
// provider and the conversation is still there. The panel itself PUSHES the
// page narrower rather than covering it (see components/ui/app-panel.tsx).
//
// Each agent gets its own `useChat` id, so switching agents parks the current
// transcript rather than mixing two agents' turns in one thread.

function MenuButton({
  label,
  sublabel,
  logo,
  icon,
  open,
  onClick,
  disabled,
}: {
  label: string;
  sublabel?: string;
  logo?: string;
  icon?: React.ReactNode;
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={sublabel ? `${sublabel}: ${label}` : label}
      className="inline-flex max-w-[9.5rem] items-center gap-1.5 rounded-lg px-2 py-1.5 text-text-body transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-text disabled:opacity-50"
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size provider mark
        <img src={logo} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain" />
      ) : (
        icon
      )}
      <span className="truncate text-[13px] font-medium">{label}</span>
      <Icon name="chevron-down" size={14} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

export function AgentDock() {
  const { open, agentId, context } = useAgentPanel();
  const agent = getAgent(agentId);

  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [value, setValue] = useState("");
  const [agentMenu, setAgentMenu] = useState(false);
  const [modelMenu, setModelMenu] = useState(false);

  const modelRef = useRef(modelId);
  modelRef.current = modelId;
  const menusRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Rebuilt only when the agent's endpoint changes — an unwired agent has none,
  // so the dock parks on a placeholder rather than posting to nowhere.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: agent.endpoint ?? "/api/ai/directory",
        body: () => ({ model: modelRef.current, agent: agent.id }),
      }),
    [agent.endpoint, agent.id],
  );

  const { messages, sendMessage, stop, status, error } = useChat({ id: agent.id, transport });
  const isStreaming = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, agent.id]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menusRef.current && !menusRef.current.contains(e.target as Node)) {
        setAgentMenu(false);
        setModelMenu(false);
      }
    }
    if (agentMenu || modelMenu) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [agentMenu, modelMenu]);

  const selectedModel = MODEL_OPTIONS.find((m) => m.id === modelId) ?? MODEL_OPTIONS[0];

  const submit = () => {
    const text = value.trim();
    if (!text || isStreaming || !agent.endpoint) return;
    // The route has no context parameter, so the opening turn carries its
    // grounding inline — that keeps "what's this org's exposure?" answerable
    // from a detail page without a route change on either side.
    const seeded =
      messages.length === 0 && context
        ? `Context — ${context.label}${context.detail ? `: ${context.detail}` : ""}\n\n${text}`
        : text;
    sendMessage({ text: seeded });
    setValue("");
  };

  return (
    <AppPanel
      open={open}
      onClose={closeAgentPanel}
      title={
        <span className="flex min-w-0 items-center gap-2">
          <AgentAvatar agentId={agent.id} />
          <span className="truncate">{agent.name}</span>
          {context && <Tag className="shrink-0">{context.label}</Tag>}
        </span>
      }
      footer={
        <div ref={menusRef} className="p-2.5">
          {agent.endpoint ? (
            <div className="rounded-2xl border border-border bg-canvas px-3 pb-2 pt-3 transition-colors focus-within:border-primary">
              <textarea
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                placeholder={agent.placeholder}
                className="max-h-32 w-full resize-none bg-transparent text-[15px] text-text outline-none placeholder:text-text-muted"
              />
              <div className="mt-1.5 flex items-center gap-1">
                {/* Agent picker — the model picker's twin, one row left. */}
                <div className="relative">
                  <MenuButton
                    label={agent.name}
                    sublabel="Agent"
                    icon={<AgentAvatar agentId={agent.id} />}
                    open={agentMenu}
                    onClick={() => {
                      setAgentMenu((o) => !o);
                      setModelMenu(false);
                    }}
                  />
                  {agentMenu && (
                    <div className="absolute bottom-full left-0 z-50 mb-2 w-[17rem] overflow-hidden rounded-card border border-border bg-surface py-1 shadow-menu">
                      {AGENTS.map((a) => {
                        const wired = !!a.endpoint;
                        return (
                          <button
                            key={a.id}
                            type="button"
                            disabled={!wired}
                            onClick={() => {
                              setAgentId(a.id);
                              setAgentMenu(false);
                            }}
                            className="flex w-full items-start gap-3 px-3.5 py-2 text-left transition-colors hover:bg-[rgba(0,0,0,0.04)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-transparent"
                          >
                            <AgentAvatar agentId={a.id} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="text-sm font-medium text-text">{a.name}</span>
                                {a.phi === "yes" && <Tag>PHI</Tag>}
                              </span>
                              <span className="block text-[11px] text-text-muted">{a.unavailable ?? a.role}</span>
                            </span>
                            {a.id === agent.id && <Icon name="check" size={16} className="shrink-0 text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="relative ml-auto">
                  <MenuButton
                    label={selectedModel.label}
                    sublabel="Model"
                    logo={selectedModel.logo}
                    open={modelMenu}
                    onClick={() => {
                      setModelMenu((o) => !o);
                      setAgentMenu(false);
                    }}
                  />
                  {modelMenu && (
                    <div className="absolute bottom-full right-0 z-50 mb-2 max-h-[22rem] w-[15rem] overflow-y-auto rounded-card border border-border bg-surface py-1 shadow-menu">
                      {MODEL_OPTIONS.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setModelId(m.id);
                            setModelMenu(false);
                          }}
                          className="flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-[rgba(0,0,0,0.04)]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size provider mark */}
                          <img src={m.logo} alt="" className="h-5 w-5 shrink-0 rounded-sm object-contain" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text">{m.label}</span>
                            <span className="block text-[11px] text-text-muted">{m.description}</span>
                          </span>
                          {m.id === modelId && <Icon name="check" size={16} className="shrink-0 text-primary" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={isStreaming ? stop : submit}
                  disabled={!isStreaming && !value.trim()}
                  aria-label={isStreaming ? "Stop" : "Send"}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    isStreaming ? "bg-danger hover:opacity-90" : "bg-primary hover:bg-primary-hover"
                  }`}
                >
                  <Icon name={isStreaming ? "stop" : "arrow-right"} size={16} />
                </button>
              </div>
            </div>
          ) : (
            <p className="px-1 py-2 text-[13px] text-text-muted">{agent.unavailable}</p>
          )}
        </div>
      }
    >
      <div className="px-4 py-4">
        {messages.length === 0 && (
          <div className="pt-6 text-center">
            <span className="inline-flex">
              <AgentAvatar agentId={agent.id} size="md" />
            </span>
            <p className="mt-3 text-[15px] font-medium text-text">{agent.name}</p>
            <p className="mx-auto mt-1 max-w-[16rem] text-[13px] text-text-muted">{agent.role}</p>
            {context && (
              <p className="mx-auto mt-3 max-w-[18rem] text-[13px] text-text-body">
                Grounded on <span className="font-medium text-text">{context.label}</span>.
              </p>
            )}
          </div>
        )}

        <div className="space-y-4">
          {messages.map((m) => (
            <div key={m.id}>
              {m.parts.map((part, i) => {
                if (part.type === "text") {
                  return m.role === "user" ? (
                    <p
                      key={i}
                      className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-canvas px-3 py-2 text-[15px] text-text"
                    >
                      {part.text}
                    </p>
                  ) : (
                    <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed text-text">
                      {part.text}
                    </p>
                  );
                }
                // Tool activity doubles as the status display — it only ever
                // names work that actually ran.
                if (part.type.startsWith("tool-")) {
                  return (
                    <p key={i} className="flex items-center gap-1.5 py-0.5 text-[12px] text-text-muted">
                      <Icon name="sparkle" size={13} className="shrink-0" />
                      {part.type.replace(/^tool-/, "").replace(/_/g, " ")}
                    </p>
                  );
                }
                return null;
              })}
            </div>
          ))}
          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <p className="text-[13px] text-text-muted">Thinking…</p>
          )}
          {error && <p className="text-[13px] text-danger">{error.message}</p>}
          <div ref={endRef} />
        </div>
      </div>
    </AppPanel>
  );
}
