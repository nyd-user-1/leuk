"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PlusMenu } from "@/components/directory/plus-menu";

// ChatInput — the prompt container for /chat. Layout follows the Nuxt chat-vue
// template: a soft rounded rectangle (no border/shadow at rest; a 1px teal
// border while focused), textarea on top, controls row below. Bottom-left:
// [+ prompt menu] [settings gear — default-visibility toggle for suggested
// follow-ups]; bottom-right: [model selector] [send/stop]. Send is teal when
// armed. Auto-grow textarea and Enter-to-send carry over from the insurance
// ChatInput port.

const ARROW_UP = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m5 12 7-7 7 7" />
    <path d="M12 19V5" />
  </svg>
);
const SQUARE = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </svg>
);
const CHEVRON_DOWN = (
  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
// lucide "settings"
const GEAR = (
  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const CHECK = (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface ModelOption {
  id: string;
  label: string;
  description: string;
  logo: string;
}

// Every entry here is a real AWS Bedrock inference-profile id, verified
// directly against this account AND against this route's tool-calling shape
// (2026-08-10) — Bedrock lists far more than an account is granted, and
// separately, several models it DOES grant reject tool use in streaming mode
// outright ("This model doesn't support tool use in streaming mode.", a
// Bedrock-side limitation, not an AI SDK bug) — since this agent always
// attaches its 5 tools, that error fires on every request, not just ones that
// end up calling a tool. Sourced from 44b's 24-model picker
// (src/components/model-options.ts), filtered to what's both granted AND
// streaming-tool-compatible here. Dropped for ACCESS: claude-sonnet-5/
// claude-opus-5 (not granted, same gap as claude-opus-4-8 in
// app/api/ai/directory/route.ts), gpt-5.2/gpt-5-mini (OpenAI direct, not
// Bedrock), nova-premier/opus-4-1/sonnet-4-20250514/qwen3-coder-next
// ("Legacy" or invalid for this account). Dropped for STREAMING TOOL USE:
// Llama 4 Maverick, Llama 3.3 70B, Pixtral Large — all three 400'd on this
// exact error the moment tools were attached.
const MODEL_OPTIONS: ModelOption[] = [
  { id: "us.anthropic.claude-haiku-4-5-20251001-v1:0", label: "Claude Haiku 4.5", description: "Fastest", logo: "/logos/anthropic.webp" },
  { id: "us.anthropic.claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Fast and smart", logo: "/logos/anthropic.webp" },
  { id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", label: "Claude Sonnet 4.5", description: "Bedrock", logo: "/logos/anthropic.webp" },
  { id: "us.anthropic.claude-opus-4-6-v1", label: "Claude Opus 4.6", description: "Bedrock", logo: "/logos/anthropic.webp" },
  { id: "us.anthropic.claude-opus-4-5-20251101-v1:0", label: "Claude Opus 4.5", description: "Most capable", logo: "/logos/anthropic.webp" },
  { id: "mistral.mistral-large-3-675b-instruct", label: "Mistral Large 3", description: "Mistral 675B", logo: "/logos/mistral_small.png" },
  { id: "us.amazon.nova-pro-v1:0", label: "Nova Pro", description: "Amazon, fast", logo: "/logos/amazon.webp" },
  { id: "moonshotai.kimi-k2.5", label: "Kimi K2.5", description: "Moonshot, open weight", logo: "/logos/kimi.jpg" },
  { id: "moonshot.kimi-k2-thinking", label: "Kimi K2 Thinking", description: "Moonshot, reasoning", logo: "/logos/kimi.jpg" },
  { id: "qwen.qwen3-next-80b-a3b", label: "Qwen3 Next 80B", description: "Alibaba, open weight", logo: "/logos/alibaba_small.svg" },
  { id: "minimax.minimax-m2.5", label: "MiniMax M2.5", description: "MiniMax, open weight", logo: "/logos/minimax_small.svg" },
  { id: "zai.glm-5", label: "GLM-5", description: "Z AI, open weight", logo: "/logos/zai_small.svg" },
  { id: "openai.gpt-oss-120b-1:0", label: "gpt-oss 120B", description: "OpenAI, open weight", logo: "/logos/openai.webp" },
];

// Muted hover treatment shared by the row's icon buttons (the container's own
// fill IS --inp-bg, so hovering with the same var would be invisible).
const ICON_BTN =
  "rounded-lg flex items-center justify-center transition-colors text-[var(--muted)] hover:bg-[rgba(0,0,0,0.05)] hover:text-[var(--txt)]";

// Source var names → Leuk tokens (shared with PlusMenu, which renders inside).
const TOKEN_MAP = {
  "--border": "var(--color-border)",
  "--surface": "var(--color-surface, #ffffff)",
  "--inp-bg": "var(--color-canvas)",
  "--txt": "var(--color-text)",
  "--muted": "var(--color-text-body)",
  "--muted2": "var(--color-text-muted)",
} as CSSProperties;

interface Props {
  onSend: (message: string, modelId: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  /** Default visibility of suggested follow-ups under answers. */
  followUpsDefault: boolean;
  onFollowUpsDefaultChange: (v: boolean) => void;
  /** Bump to request focus (the Leuk orb does this). If the textarea already
   *  has focus, the container's teal border flashes thicker instead. */
  ping?: number;
  placeholder?: string;
  autoFocus?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  selectedModelId,
  onModelChange,
  followUpsDefault,
  onFollowUpsDefaultChange,
  ping,
  placeholder,
  autoFocus,
}: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMenuAbove, setModelMenuAbove] = useState(true);
  const modelRef = useRef<HTMLDivElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const selectedModel = MODEL_OPTIONS.find((m) => m.id === selectedModelId) ?? MODEL_OPTIONS[0];

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Hand the cursor back the moment a response finishes streaming.
  const wasStreaming = useRef(isStreaming);
  useEffect(() => {
    if (wasStreaming.current && !isStreaming) textareaRef.current?.focus();
    wasStreaming.current = isStreaming;
  }, [isStreaming]);

  // Orb ping: focus the textarea — or, if it's already focused, flash the
  // teal border thicker for a beat as the visual acknowledgement.
  const [borderFlash, setBorderFlash] = useState(false);
  const lastPing = useRef(ping ?? 0);
  useEffect(() => {
    if (ping === undefined || ping === lastPing.current) return;
    lastPing.current = ping;
    if (document.activeElement === textareaRef.current) {
      setBorderFlash(true);
      const t = setTimeout(() => setBorderFlash(false), 650);
      return () => clearTimeout(t);
    }
    textareaRef.current?.focus();
  }, [ping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const maxHeight = 144;
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, maxHeight) + "px";
      textareaRef.current.style.overflowY = textareaRef.current.scrollHeight > maxHeight ? "auto" : "hidden";
    }
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelMenuOpen(false);
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    }
    if (modelMenuOpen || settingsOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [modelMenuOpen, settingsOpen]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;
    onSend(trimmed, selectedModelId);
    setValue("");
  };

  const insertPrompt = (text: string) => {
    setValue(text);
    setTimeout(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  };

  return (
    <div className="bg-transparent p-1.5 sm:p-4" style={TOKEN_MAP}>
      <div className="max-w-[770px] mx-auto w-full">
        <div
          className={`rounded-2xl sm:rounded-3xl bg-[var(--inp-bg)] border transition-all px-3 pt-3 pb-2 sm:px-4 sm:pt-4 sm:pb-2.5 hover:shadow-card ${
            borderFlash ? "border-primary ring-2 ring-primary/25" : "border-border focus-within:border-primary"
          }`}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder ?? "Ask about providers, insurers, or rates..."}
            rows={1}
            className="w-full min-h-[28px] resize-none border-0 bg-transparent focus-visible:ring-0 p-0 placeholder:text-[var(--muted2)] text-[16px] text-[var(--txt)] outline-none"
          />

          {/* Controls row: [+] [settings] left · [model] [send] right */}
          <div className="mt-2 flex items-center gap-1">
            <PlusMenu onSelect={insertPrompt} />

            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                aria-label="Chat settings"
                onClick={() => setSettingsOpen((o) => !o)}
                className={`h-9 w-9 ${ICON_BTN}`}
              >
                {GEAR}
              </button>
              {settingsOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl overflow-hidden py-1 z-50">
                  <button
                    type="button"
                    onClick={() => onFollowUpsDefaultChange(!followUpsDefault)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-[rgba(0,0,0,0.04)] transition-colors"
                  >
                    <span className="flex-1 text-left">
                      <span className="block font-medium text-[var(--txt)]">Suggested follow-ups</span>
                      <span className="block text-[11px] text-[var(--muted2)]">Show under each answer by default</span>
                    </span>
                    <span className={followUpsDefault ? "text-primary" : "text-transparent"}>{CHECK}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <div className="relative" ref={modelRef}>
                <button
                  ref={modelBtnRef}
                  type="button"
                  onClick={() => {
                    if (!modelMenuOpen && modelBtnRef.current) {
                      setModelMenuAbove(modelBtnRef.current.getBoundingClientRect().top > 350);
                    }
                    setModelMenuOpen(!modelMenuOpen);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 py-1.5 ${ICON_BTN}`}
                  aria-label={`Model: ${selectedModel.label}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size provider marks, not page content */}
                  <img src={selectedModel.logo} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain" />
                  <span className="text-[13px] font-medium">{selectedModel.label}</span>
                  <span className={`transition-transform ${modelMenuOpen ? "rotate-180" : ""}`}>{CHEVRON_DOWN}</span>
                </button>

                {modelMenuOpen && (
                  <div
                    className={`absolute right-0 max-h-[360px] w-[230px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl py-1 z-50 ${
                      modelMenuAbove ? "bottom-full mb-2" : "top-full mt-2"
                    }`}
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          onModelChange(m.id);
                          setModelMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-[rgba(0,0,0,0.04)] transition-colors"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size provider marks, not page content */}
                        <img src={m.logo} alt="" className="h-5 w-5 shrink-0 rounded-sm object-contain" />
                        <span className="flex-1 text-left">
                          <span className="block font-medium text-[var(--txt)]">{m.label}</span>
                          <span className="block text-[11px] text-[var(--muted2)]">{m.description}</span>
                        </span>
                        {m.id === selectedModelId && <span className="text-[var(--txt)]">{CHECK}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={isStreaming ? onStop : handleSubmit}
                disabled={!isStreaming && !value.trim()}
                className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                  isStreaming ? "bg-red-600 hover:bg-red-700 text-white" : "bg-primary hover:bg-primary-hover text-white"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isStreaming ? SQUARE : ARROW_UP}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
