export type SchemaView = "map" | "draft";

// The Schema map / Draft toggle, living inside the canvas itself now (org-map
// pattern) rather than as a page-chrome tab row above it — same segmented
// pill the org map's rank toggle uses.
export function SchemaViewSwitcher({ view, onChange }: { view: SchemaView; onChange: (v: SchemaView) => void }) {
  return (
    <div className="flex h-9 items-center overflow-hidden rounded-field border border-border bg-surface shadow-card">
      <button
        type="button"
        onClick={() => onChange("map")}
        aria-pressed={view === "map"}
        className={`h-full px-3 text-[13px] font-medium transition-colors ${
          view === "map" ? "bg-[rgba(0,0,0,0.05)] text-text" : "text-text-body hover:text-primary"
        }`}
      >
        Schema map
      </button>
      <div className="h-5 w-px bg-border" aria-hidden />
      <button
        type="button"
        onClick={() => onChange("draft")}
        aria-pressed={view === "draft"}
        className={`h-full px-3 text-[13px] font-medium transition-colors ${
          view === "draft" ? "bg-[rgba(0,0,0,0.05)] text-text" : "text-text-body hover:text-primary"
        }`}
      >
        Draft
      </button>
    </div>
  );
}
