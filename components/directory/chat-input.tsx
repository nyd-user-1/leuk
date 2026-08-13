"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { PlusMenu } from "@/components/directory/plus-menu";
import { MODEL_OPTIONS } from "@/lib/ai/model-options";
import { applyInsert, useComposerMenu, type Command } from "@/components/directory/composer-menu";

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
// A textarea can't colour its own contents, so the highlight is a mirror: a div
// behind the input rendering the same string with the same metrics, tokens
// wrapped in teal, while the textarea itself paints transparent text over it
// and keeps only its caret. Every typographic property below MUST match the
// textarea or the two drift apart as you type.
const TOKEN = /(^\/[\w-]+)|(@[^()\n]+?\s*\((?:NPI|TIN)\s*[0-9]{9,10}\))/g;

function Highlight({ value }: { value: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(value))) {
    if (m.index > last) out.push(value.slice(last, m.index));
    out.push(
      <span key={k++} className="rounded-[3px] bg-primary/10 text-primary">
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(value.slice(last));
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-[16px] leading-[inherit] text-[var(--txt)]"
    >
      {out}
    </div>
  );
}

const CHECK = (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// MODEL_OPTIONS moved to lib/ai/model-options.ts — shared with the agent dock.

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
  /** Model picker. Omit `onModelChange` to hide it — a patient message thread
   *  has no model to choose. */
  selectedModelId?: string;
  onModelChange?: (modelId: string) => void;
  /** Suggested-follow-ups default, behind the gear. Omit the handler to hide. */
  followUpsDefault?: boolean;
  onFollowUpsDefaultChange?: (v: boolean) => void;
  /** Sample-question menu. Off unless asked for — the prompts are /chat's. */
  showPrompts?: boolean;
  /** "@" opens a record picker (providers carry their NPI into the message). */
  mentions?: boolean;
  /** "/" commands, offered only at the start of a message. Used as the fallback
   *  when no `agentId` is given (or the fetch fails). */
  commands?: Command[];
  /** Back "/" with this agent's skills from the database. */
  agentId?: string;
  /** Rendered at the left of the controls row (the Inbox slots its agent
   *  identity there). */
  leading?: React.ReactNode;
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
  followUpsDefault = false,
  onFollowUpsDefaultChange,
  showPrompts,
  mentions,
  commands,
  agentId,
  leading,
  ping,
  placeholder,
  autoFocus,
}: Props) {
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menu = useComposerMenu({ value, caret, mentions, commands, agentId });

  // Replace the "@…"/"/…" token with the picked item and put the caret after it.
  const choose = (i: number) => {
    const item = menu.items[i];
    if (!item || !menu.hit) return;
    const { next, caret: pos } = applyInsert(value, menu.hit.start, caret, item.insert ?? item.label);
    setValue(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const syncCaret = () => setCaret(textareaRef.current?.selectionStart ?? 0);

  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelMenuAbove, setModelMenuAbove] = useState(true);
  const modelRef = useRef<HTMLDivElement>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  const selectedModel = MODEL_OPTIONS.find((m) => m.id === selectedModelId) ?? MODEL_OPTIONS[0];
  const showModel = !!onModelChange;
  const showSettings = !!onFollowUpsDefaultChange;

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
    onSend(trimmed, selectedModelId ?? selectedModel.id);
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
          className={`relative rounded-2xl sm:rounded-3xl bg-[var(--inp-bg)] border transition-all px-3 pt-3 pb-2 sm:px-4 sm:pt-4 sm:pb-2.5 hover:shadow-card ${
            borderFlash ? "border-primary ring-2 ring-primary/25" : "border-border focus-within:border-primary"
          }`}
        >
          {menu.open && (
            <div className="absolute bottom-full left-0 z-50 mb-2 w-[min(30rem,92vw)] overflow-hidden rounded-card border border-[var(--border)] bg-[var(--surface)] shadow-menu">
              {/* Sticky header: the catalogue is 27 skills deep, so the menu is
                  a searchable list, not a short popover. Typing after the
                  trigger filters name, description and group. */}
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3.5 py-2">
                <span className="text-[12px] text-[var(--muted2)]">
                  {menu.hit?.trigger === "/" ? "Skills" : "Records"}
                </span>
                <span className="truncate text-[12px] font-medium text-[var(--txt)]">
                  {menu.hit?.query ? `“${menu.hit.query}”` : "type to filter"}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-[var(--muted2)]">
                  {menu.items.length || ""}
                </span>
              </div>
              <div className="max-h-80 overflow-y-auto py-1">
              {menu.items.length === 0 && menu.loading && (
                <p className="px-3.5 py-2 text-[13px] text-[var(--muted2)]">Searching…</p>
              )}
              {menu.items.map((it, i) => {
                const newGroup = it.group && it.group !== menu.items[i - 1]?.group;
                return (
                  <div key={it.id}>
                    {newGroup && (
                      <p className="px-3.5 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--muted2)]">
                        {it.group}
                      </p>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => menu.setActive(i)}
                      onMouseDown={(e) => { e.preventDefault(); choose(i); }}
                      className={`group/row block w-full px-3.5 py-2 text-left transition-colors ${
                        i === menu.active ? "bg-[rgba(0,0,0,0.05)]" : ""
                      }`}
                    >
                      <span
                        className={`block truncate text-[13.5px] font-medium transition-colors group-hover/row:text-primary ${
                          i === menu.active ? "text-primary" : "text-[var(--txt)]"
                        }`}
                      >
                        {it.label}
                      </span>
                      {it.hint && (
                        <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-[var(--muted2)]">
                          {it.hint}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
              </div>
            </div>
          )}
          <div className="relative">
          <Highlight value={value} />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setCaret(e.target.selectionStart ?? 0);
            }}
            onClick={syncCaret}
            onKeyUp={syncCaret}
            onKeyDown={(e) => {
              // While the trigger menu is open it owns the arrows, Enter and
              // Tab — otherwise picking a provider would send the message.
              if (menu.open && menu.items.length) {
                if (e.key === "ArrowDown") { e.preventDefault(); menu.move(1); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); menu.move(-1); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(menu.active); return; }
                if (e.key === "Escape") { e.preventDefault(); setCaret(-1); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder ?? "Ask about providers, insurers, or rates..."}
            rows={1}
            className="relative w-full min-h-[28px] resize-none border-0 bg-transparent focus-visible:ring-0 p-0 placeholder:text-[var(--muted2)] text-[16px] text-transparent caret-[var(--txt)] outline-none"
          />
          </div>

          {/* Controls row: [+] [settings] left · [model] [send] right */}
          <div className="mt-2 flex items-center gap-1">
            {leading}
            {showPrompts && <PlusMenu onSelect={insertPrompt} />}

            {showSettings && (
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
                    onClick={() => onFollowUpsDefaultChange?.(!followUpsDefault)}
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
            )}

            <div className="ml-auto flex items-center gap-1.5">
              {showModel && (
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
                          onModelChange?.(m.id);
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
              )}

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
