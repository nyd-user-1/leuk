// Leuk brand mark — a standalone amber rising-arch icon (filled with a pale
// amber) next to the lowercase "leuk" wordmark, both resting on an amber
// baseline rule. Variants: onNavy (sidebar, auth) · onLight (white surfaces).

const sizes = {
  sm: "text-xl",
  md: "text-2xl",
  lg: "text-4xl",
} as const;

const archSizes = {
  sm: "w-7",
  md: "w-8",
  lg: "w-12",
} as const;

export function Logo({
  variant = "onLight",
  size = "md",
  className = "",
}: {
  variant?: "onNavy" | "onLight";
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-baseline gap-[0.28em] leading-none ${className}`}>
      <span
        className={`font-bold lowercase tracking-tight ${sizes[size]} ${variant === "onNavy" ? "text-white" : "text-text"}`}
      >
        leuk
      </span>
      {/* amber rising-arch mark (flat bottom flush with the text baseline) */}
      <svg viewBox="0 -0.5 28 13.5" className={`${archSizes[size]} h-auto shrink-0`} aria-hidden>
        <path d="M2 13 A 12 12 0 0 1 26 13" fill="#FBE7C4" stroke="#F0AE55" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}
