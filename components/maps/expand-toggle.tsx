// Full-container expand/collapse — the org map's pattern (components/orgs/
// org-map.tsx), shared here so the Schema map and Draft canvas grow into the
// same corner the same way. Kit has no diagonal expand/collapse glyphs —
// inline paths, same as org-map's own precedent.
export const ARROW_UP_LEFT = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 17V7h10" />
    <path d="M17 17 7 7" />
  </svg>
);
export const ARROW_DOWN_RIGHT = (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 7 10 10" />
    <path d="M17 7v10H7" />
  </svg>
);

export function ExpandToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={expanded ? "Exit full-container view" : "Expand to fill the page"}
      title={expanded ? "Collapse" : "Expand"}
      className="flex h-9 w-9 items-center justify-center rounded-field border border-border bg-surface text-text-body shadow-card transition-colors hover:border-primary hover:text-primary"
    >
      {expanded ? ARROW_DOWN_RIGHT : ARROW_UP_LEFT}
    </button>
  );
}
