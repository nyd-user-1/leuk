import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";

// A table card's own menu — replaces what used to be a standalone trash icon.
// Same open/ref/click-outside/Escape pattern already used by the canvas
// controls menu, the drafts switcher, etc.
export type CardMenuItem = { label: string; icon: IconName; onClick: () => void; destructive?: boolean };

export function CardMenu({ items, extra }: { items: CardMenuItem[]; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="nodrag relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Table menu"
        className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
          open ? "bg-black/[0.06] text-text" : "text-text-muted hover:bg-black/[0.06] hover:text-text"
        }`}
      >
        <Icon name="menu" size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-card border border-border bg-surface p-1.5 shadow-menu"
        >
          {extra && <div className="border-b border-border px-2.5 py-2">{extra}</div>}
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={`flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors ${
                it.destructive
                  ? "text-danger hover:bg-danger-tint"
                  : "text-text-body hover:bg-[rgba(0,0,0,0.05)] hover:text-text"
              }`}
            >
              <Icon name={it.icon} size={15} className={it.destructive ? "" : "text-text-muted"} />
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
