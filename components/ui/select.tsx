"use client";

import { useEffect, useMemo, useRef, useState, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/avatar";
import { FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import type { AvatarHue } from "@/lib/types";

// Catalog `Select` — Field-like trigger with trailing chevron opening a
// custom portable dropdown (never the OS-native <select>), styled to match
// DropdownMenu / KebabMenu: rounded-card menu, hover row, teal selected + check.
// `searchable` adds a filter input; each option can carry a leading color dot
// (`option.color`) OR an initials Avatar (`option.avatar`, e.g. a practitioner
// picker) — color-dot and avatar are mutually exclusive per option.
// `onCreateOption` turns the filter into type-to-create: an unmatched query
// offers a create row, and Enter commits it (see the calendar's Client picker).

export interface SelectOption {
  value: string;
  label: string;
  /** Optional leading color dot (catalog `withColorDot`, keys services). */
  color?: string;
  /** Optional leading initials Avatar (people pickers); wins over `color`. */
  avatar?: { name: string; hue?: AvatarHue; src?: string | null };
  /** Optional leading image (e.g. an insurer mark) — contained, never cropped. */
  image?: string;
  /** Optional leading two-tone icon (icons.tsx name) — placeholder when no image. */
  iconName?: string;
}

const triggerClass =
  "h-10 w-full rounded-field border border-field-border bg-surface px-3 text-left text-[15px] text-text outline-none transition-colors focus:border-field-border-focus disabled:cursor-not-allowed disabled:bg-[#E5E7EB] disabled:text-text-muted";

function Dot({ color }: { color?: string }) {
  if (!color) return null;
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

// Leading slot for the trigger + each row: Avatar > image > icon > color dot.
function OptionLead({ option }: { option?: SelectOption }) {
  if (!option) return null;
  if (option.avatar) return <Avatar name={option.avatar.name} hue={option.avatar.hue} src={option.avatar.src} size="sm" />;
  if (option.image)
    return <img src={option.image} alt="" aria-hidden className="h-5 w-8 shrink-0 object-contain" loading="lazy" />;
  if (option.iconName)
    return <Icon name={option.iconName as never} size={16} className="shrink-0 fill-primary-wash text-text" />;
  return <Dot color={option.color} />;
}

export function Select({
  label,
  required,
  hint,
  error,
  options,
  searchable,
  placeholder,
  value,
  onValueChange,
  onCreateOption,
  createOptionLabel,
  tone = "default",
  id,
  className = "",
  ...rest
}: {
  label?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  options: SelectOption[];
  searchable?: boolean;
  placeholder?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  /**
   * Type-to-create (`searchable` only). When the query matches no option, the
   * menu offers a create row and Enter in the filter commits it. Resolve with
   * the new option's value to select it, or null to leave the menu open (the
   * caller reports why — a toast, usually).
   */
  onCreateOption?: (label: string) => Promise<string | null>;
  /** Copy for that row. Default: `Add “Tony Stark”`. */
  createOptionLabel?: (query: string) => string;
  /**
   * `primary` renders the trigger label, chevron, and every option row in teal
   * rather than only the selected row — the marketing filter row, where each
   * dropdown reads as a live filter chip rather than a neutral form field.
   * Weight stays regular there (teal at 500 read as bold); the selected row
   * keeps 500 as the one weight cue, since colour no longer distinguishes it.
   */
  tone?: "default" | "primary";
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value">) {
  const inputId = id ?? rest.name;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // Menu is portaled to <body> and fixed off the trigger rect so no
  // `overflow-hidden`/scroll-container ancestor can clip it (matches DropdownMenu).
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Capture-phase scroll closes the menu (e.g. the page scrolled, so the
    // trigger-relative `pos` is stale) — but ignore scrolls whose target is
    // inside the menu itself, i.e. the user scrolling the option list.
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    setQuery("");
    setOpen(true);
  };

  const filtered = useMemo(
    () => (searchable && query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options),
    [options, query, searchable],
  );

  const selected = options.find((o) => o.value === value);
  const isPrimary = tone === "primary";

  const trimmed = query.trim();
  const canCreate =
    !!searchable &&
    !!onCreateOption &&
    trimmed.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmed.toLowerCase());

  const runCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    const created = await onCreateOption?.(trimmed).catch(() => null);
    setCreating(false);
    if (!created) return; // caller surfaced the failure; keep the query typed
    onValueChange?.(created);
    setQuery("");
    setOpen(false);
  };

  // Enter commits: the create row when the query is new, otherwise the lone
  // remaining match (typing four letters and hitting Enter should pick it).
  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (canCreate) {
      void runCreate();
      return;
    }
    if (filtered.length === 1) {
      onValueChange?.(filtered[0].value);
      setOpen(false);
    }
  };

  return (
    <div className={className}>
      {label && (
        <FieldLabel htmlFor={inputId} required={required}>
          {label}
        </FieldLabel>
      )}
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          id={inputId}
          disabled={rest.disabled}
          aria-label={rest["aria-label"]}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={toggle}
          className={`flex items-center justify-between gap-2 ${triggerClass} ${error ? "border-danger" : ""}`}
        >
          <span
            className={`flex min-w-0 items-center gap-2 ${
              isPrimary ? "text-primary" : value ? "" : "text-text-muted"
            }`}
          >
            <OptionLead option={selected} />
            <span className="truncate">{value ? (selected?.label ?? value) : (placeholder ?? "Select…")}</span>
          </span>
          <Icon
            name="chevron-down"
            size={16}
            className={`shrink-0 ${isPrimary ? "text-primary" : "text-text-muted"}`}
          />
        </button>

        {open && pos && typeof document !== "undefined" &&
          createPortal(
            <div
              ref={menuRef}
              onClick={(e) => e.stopPropagation()}
              // Trigger width is the floor, not the cap: a narrow filter chip
              // shouldn't ellipsise its own options ("Medication Mg…"). Grows
              // rightward to fit the longest label, bounded so a stray long
              // option can't run off-screen.
              style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
              className="fixed z-50 w-max max-w-[min(22rem,92vw)] rounded-card border border-border bg-surface p-2 shadow-menu"
            >
            {searchable && (
              <div className="mb-1 flex items-center gap-2 rounded-field border border-field-border px-2.5">
                <Icon name="search" size={16} className="text-text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder={onCreateOption ? "Search or type a new name…" : "Search…"}
                  className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-text-muted"
                />
              </div>
            )}
            <div className="max-h-60 overflow-y-auto" role="listbox">
              {filtered.map((o) => {
                const isSel = o.value === value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => {
                      onValueChange?.(o.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-[15px] transition-colors hover:bg-[#F3F4F6] ${
                      isPrimary || isSel ? "text-primary" : "text-text"
                    } ${isPrimary && !isSel ? "font-normal" : "font-medium"}`}
                  >
                    <OptionLead option={o} />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {isSel && <Icon name="check" size={16} className="shrink-0 text-primary" />}
                  </button>
                );
              })}
              {filtered.length === 0 && !canCreate && (
                <p className="px-2.5 py-2 text-sm text-text-muted">No matches</p>
              )}
            </div>
            {canCreate && (
              <div className={filtered.length > 0 ? "mt-1 border-t border-border pt-1" : ""}>
                <button
                  type="button"
                  disabled={creating}
                  onClick={runCreate}
                  className="flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-[15px] font-medium text-primary transition-colors hover:bg-[#F3F4F6] disabled:opacity-60"
                >
                  <Icon name="plus" size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {creating ? "Adding…" : (createOptionLabel?.(trimmed) ?? `Add “${trimmed}”`)}
                  </span>
                  <span className="shrink-0 text-[12px] font-normal text-text-muted">Enter</span>
                </button>
              </div>
            )}
            </div>,
            document.body,
          )}
      </div>

      {/* Carry the value for native form posts (uncontrolled name= usage). */}
      {rest.name && <input type="hidden" name={rest.name} value={value ?? ""} />}

      {error ? <FieldError>{error}</FieldError> : hint ? <FieldHint>{hint}</FieldHint> : null}
    </div>
  );
}
