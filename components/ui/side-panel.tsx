"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, IconSquare, type IconName } from "@/components/ui/icons";

// Catalog `SidePanel` — right FLYOVER on a soft scrim; header (icon square +
// mono kicker over title + actions) · scrollable body · pinned footer. THE
// workhorse for create/edit/detail flows. `mobileSheet` swaps the below-lg
// presentation for a bottom sheet (rounded top, slide-up, grab bar) — same
// API, same desktop behavior.
//
// ANATOMY (hq's Linear-tech-specs drawer, ~/Code/hq/app/ui/landing/spec-drawer.tsx,
// translated into Leuk's tokens rather than transplanted):
//   • Flyover, not a slab. The panel insets from the viewport by 12px and wears
//     rounded-card + an INSET 1px ring + a high shadow (--shadow-panel), so it
//     reads as a card flying over the page instead of a wall bolted to its edge.
//     The ring is inset rather than a border so the corner radius stays exact.
//   • Kicker over title. A mono uppercase category line sits above a larger,
//     calmer title — Linear's move for making a drawer announce what KIND of
//     thing it is before what it is. `kicker` is optional; without it the title
//     simply sits alone and the header is the old one, bigger.
//   • Enter-only motion. See .panel-in in globals.css.
//   • Softer scrim (--color-scrim-soft): a floating panel needs the page to
//     stay legible behind it. Modal keeps the heavier --color-scrim.
//
// `variant="spec"` is the faithful dark treatment for read-only detail surfaces
// — same structure, Linear's own values. Opt-in only; nothing is forced onto it.

type Variant = "default" | "spec";

const SHELL: Record<Variant, string> = {
  default: "bg-surface",
  spec: "bg-[#0f1011]",
};

const KICKER: Record<Variant, string> = {
  default: "text-text-muted",
  spec: "text-[#62666d]",
};

const TITLE: Record<Variant, string> = {
  default: "text-text",
  spec: "text-[#f7f8f8]",
};

const CLOSE: Record<Variant, string> = {
  default: "text-text-muted hover:bg-[#F3F4F6] hover:text-text",
  spec: "text-[#8a8f98] hover:bg-white/[0.06]",
};

const EDGE: Record<Variant, string> = {
  default: "border-border",
  spec: "border-[#23252a]",
};

export function SidePanel({
  open,
  onClose,
  title,
  titleNode,
  icon,
  kicker,
  headerActions,
  footer,
  width = "max-w-xl",
  mobileSheet = false,
  variant = "default",
  dragThrough = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /**
   * Renders in place of the title text — for a header that carries a MARK
   * rather than a name (the invoice sheet shows the practice's letterhead).
   * `title` is still required and still names the dialog for screen readers,
   * so swapping the visible title never costs the panel its accessible name.
   */
  titleNode?: ReactNode;
  icon?: IconName;
  /** Mono uppercase category line above the title ("PRESCRIPTION", "CLIENT"). */
  kicker?: string;
  headerActions?: ReactNode;
  footer?: ReactNode;
  width?: string; // tailwind max-w-* (~400–800px)
  /** Below lg, present as a bottom sheet instead of a full-height right panel. */
  mobileSheet?: boolean;
  /** "spec" = dark, read-only detail treatment. Default stays the light shell. */
  variant?: Variant;
  /**
   * Let the SCRIM pass pointer events through to the page beneath, while the
   * panel itself keeps them. For panels you drag things OUT of: the scrim is
   * `fixed inset-0`, so it is what a dragged row is dropped on and the page's
   * drop target never fires (NYS-74). Set this only while a drag is in flight —
   * a scrim that never captures is a panel that can't be dismissed by clicking
   * away.
   */
  dragThrough?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const spec = variant === "spec";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      // The inset lives on the OUTER flex container as padding, so the panel's
      // own `h-full` still resolves against a bounded box — insetting the panel
      // itself with a margin would push it past the viewport by that margin.
      // mobileSheet stays flush to the bottom edge below lg; a sheet with a gap
      // under it reads as a mistake, not a flyover.
      className={`panel-scrim-in fixed inset-0 z-50 flex bg-scrim-soft ${
        dragThrough ? "pointer-events-none" : ""
      } ${mobileSheet ? "flex-col justify-end lg:flex-row lg:justify-end lg:p-3" : "justify-end p-3"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `var(${spec ? "--shadow-panel-spec" : "--shadow-panel"})` }}
        className={`relative isolate overflow-hidden ${dragThrough ? "pointer-events-auto" : ""} ${SHELL[variant]} ${
          mobileSheet
            ? `panel-sheet-in mx-auto flex max-h-[88dvh] w-full ${width} flex-col rounded-t-card lg:mx-0 lg:h-full lg:max-h-none lg:rounded-card`
            : `panel-in flex h-full w-full ${width} flex-col rounded-card`
        }`}
      >
        {/* Top-left radial glow — Linear lifts the panel's near-black corner with
            a white wash; on a white shell that is invisible, so the same gesture
            is carried by the brand teal at low alpha. Purely decorative. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 -z-10 size-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: spec
              ? "radial-gradient(circle, #ffffff14 0%, transparent 50%)"
              : "radial-gradient(circle, rgb(63 130 144 / 0.10) 0%, transparent 50%)",
            mixBlendMode: spec ? "lighten" : "normal",
          }}
        />
        {mobileSheet && (
          <div className={`mx-auto mt-2 h-1 w-9 shrink-0 rounded-full lg:hidden ${spec ? "bg-[#23252a]" : "bg-border"}`} />
        )}
        {/* No leading icon on the panel title — the no-heading-icons rule
            (2026-07-23). The `icon` prop is still accepted so the many call
            sites keep compiling; it just no longer renders. */}
        <div className={`flex items-center gap-3 border-b px-6 py-4 ${EDGE[variant]}`}>
          <div className="min-w-0">
            {kicker && (
              <p className={`font-mono text-[11px] uppercase tracking-[0.14em] ${KICKER[variant]}`}>{kicker}</p>
            )}
            {titleNode ?? (
              <h2 className={`truncate text-[22px] font-semibold tracking-[-0.01em] ${TITLE[variant]}`}>{title}</h2>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className={`inline-flex h-9 w-9 items-center justify-center rounded-field transition-colors ${CLOSE[variant]}`}
            >
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        {footer && (
          <div
            className={`flex items-center justify-end gap-3 border-t px-6 py-4 ${EDGE[variant]} ${
              mobileSheet ? "max-lg:pb-[calc(1rem+env(safe-area-inset-bottom))]" : ""
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
