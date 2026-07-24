// Per-group color — deterministic by default (same group name always lands
// on the same swatch, in both canvases, no manual step needed), but callers
// can override a specific group to a chosen palette index (the Draft
// canvas's per-card menu does this). A fixed palette, not arbitrary hex from
// a hash, so every color is one this app's design system already uses
// elsewhere, just picked by a stable index rather than by hand.
export type GroupColor = { text: string; bg: string; dot: string };

export const PALETTE: GroupColor[] = [
  { text: "text-primary", bg: "bg-primary-wash", dot: "#3F8290" },
  { text: "text-amber-700", bg: "bg-amber-50", dot: "#F0AE55" },
  { text: "text-violet-700", bg: "bg-violet-50", dot: "#8B7FD6" },
  { text: "text-rose-700", bg: "bg-rose-50", dot: "#D97BA0" },
  { text: "text-emerald-700", bg: "bg-emerald-50", dot: "#4E9A7C" },
  { text: "text-sky-700", bg: "bg-sky-50", dot: "#5B9BD5" },
  { text: "text-orange-700", bg: "bg-orange-50", dot: "#D98A4A" },
  { text: "text-indigo-700", bg: "bg-indigo-50", dot: "#6E76C9" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function colorForGroup(group: string, overrides?: Record<string, number>): GroupColor {
  const override = overrides?.[group];
  if (override !== undefined) return PALETTE[override % PALETTE.length];
  return PALETTE[hash(group) % PALETTE.length];
}
