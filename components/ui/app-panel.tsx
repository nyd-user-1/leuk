"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/ui/icons";
import { APP_PANEL_ROOT_ID } from "@/components/shell/app-panel-root";

// NEW PRIMITIVE, deliberately added: `AppPanel` is the PUSH counterpart to
// `SidePanel`. SidePanel floats above the page on a scrim and belongs to the
// route that opened it; AppPanel is a flex sibling of the content panel, so
// opening it NARROWS the page instead of covering it, and it survives
// navigation because it portals into #app-panel-root — a node AppShell renders
// outside `children`. Neither behavior can be reached by composing SidePanel:
// the scrim, the fixed positioning, and the route-scoped lifetime are the whole
// of what SidePanel is.
//
// Ported from 44b's src/components/AppPanel.tsx (the reference implementation
// for this behavior), retokenized to Leuk: white surface, #e2e4e9 hairline and
// rounded-2xl to match the content panel it sits beside.
//
// Mounting rule: whatever renders an AppPanel must ALSO live outside the routed
// subtree (AppShell mounts the agent dock), or React unmounts the component on
// navigation even though its DOM target persists.

export function AppPanel({
  open,
  onClose,
  title,
  icon,
  headerActions,
  footer,
  bodyClass = "",
  defaultExpanded,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: IconName;
  /** Rendered in the header, left of expand/close. */
  headerActions?: ReactNode;
  footer?: ReactNode;
  bodyClass?: string;
  defaultExpanded?: boolean;
  children?: ReactNode;
}) {
  const [root, setRoot] = useState<Element | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

  useEffect(() => {
    setRoot(document.getElementById(APP_PANEL_ROOT_ID));
  }, []);

  // Closing resets the width — reopening from a different surface shouldn't
  // inherit the last surface's expansion.
  useEffect(() => {
    if (!open) setExpanded(defaultExpanded ?? false);
  }, [open, defaultExpanded]);

  if (!root) return null;

  // Widths include the 24px right paper margin, applied as padding on the
  // animating box. The padding is on the OPEN branch only: `w-0` with a
  // border-box padding would still measure 24px wide and leave a dead gutter.
  const w = expanded ? "md:w-[calc(46vw+1.5rem)]" : "md:w-[444px]";

  return createPortal(
    <div
      className={`h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out ${
        open ? `w-full ${w} md:pr-6` : "w-0"
      }`}
    >
      {open && (
        <div className="flex h-full w-full flex-col overflow-hidden border border-[#e2e4e9] bg-surface md:rounded-2xl">
          <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            {icon && <Icon name={icon} size={18} className="shrink-0 fill-primary-wash text-text" />}
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">{title}</span>
            {headerActions}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse panel" : "Expand panel"}
              className="hidden shrink-0 rounded-field p-1.5 text-text-muted transition-colors hover:bg-canvas hover:text-text md:block"
            >
              <Icon name={expanded ? "chevron-right" : "chevron-left"} size={16} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="shrink-0 rounded-field p-1.5 text-text-muted transition-colors hover:bg-canvas hover:text-text"
            >
              <Icon name="x" size={16} />
            </button>
          </header>

          <div className={`min-h-0 flex-1 overflow-y-auto ${bodyClass}`}>{children}</div>

          {footer && <div className="shrink-0 border-t border-border">{footer}</div>}
        </div>
      )}
    </div>,
    root,
  );
}
