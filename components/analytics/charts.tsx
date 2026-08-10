"use client";

import { useRef, useState } from "react";
import type { MetricValue } from "@/lib/analytics/metrics";

// The chart bodies — hq's fleet-view shapes (LineChart / RankingBody / DistBody)
// rebuilt on Leuk's light tokens. Inline SVG, no chart library: each shape is
// ~30 lines and a dependency would cost more than it saves.
//
// Two things carried over from hq deliberately: the smooth cubic path (a
// polyline reads as noise at card size), and the hover crosshair + dot, which is
// what makes a 300×70 sparkline actually readable.

/** Catmull-Rom → cubic bezier. Straight from hq's smoothPath. */
export function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const TEAL = "var(--color-primary)";

export function LineChart({ v }: { v: Extract<MetricValue, { kind: "series" | "area" }> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const pts = v.points;
  const n = pts.length;
  const max = Math.max(1, ...pts);
  const W = 300;
  const H = 70;
  const xy = pts.map((p, i) => [n > 1 ? (i / (n - 1)) * W : 0, H - (p / max) * (H - 6) - 3] as [number, number]);
  const line = smoothPath(xy);
  const areaD = line ? `${line} L${W},${H} L0,${H} Z` : "";
  const gid = `an-grad-${v.kind}`;
  const strong = v.kind === "area";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        className="relative min-h-0 w-full flex-1"
        onMouseMove={(e) => {
          const r = ref.current?.getBoundingClientRect();
          if (!r || n < 2) return;
          setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg viewBox="0 0 300 70" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TEAL} stopOpacity={strong ? 0.28 : 0.16} />
              <stop offset="100%" stopColor={TEAL} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke={TEAL} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {hover != null && n > 1 && (
          <>
            <div className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: `${(hover / (n - 1)) * 100}%` }} />
            <div
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary"
              style={{ left: `${(hover / (n - 1)) * 100}%`, top: `${(xy[hover][1] / H) * 100}%` }}
            />
          </>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-text-muted">
        <span className="truncate">{hover != null ? (v.labels?.[hover] ?? `#${hover + 1}`) : v.capL}</span>
        <span className="shrink-0 tabular-nums">{hover != null ? pts[hover].toLocaleString("en-US") : v.capR}</span>
      </div>
    </div>
  );
}

export function RankingBody({ v }: { v: Extract<MetricValue, { kind: "ranking" }> }) {
  if (!v.rows.length) return <p className="text-sm text-text-muted">No data yet.</p>;
  // NOT justify-center: centering a flex column that overflows clips the items
  // at BOTH ends, and the top of a ranking is the whole point — it silently ate
  // New York and Kings off the providers-by-county card.
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      {v.rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2.5" title={`${r.name} — ${r.value}`}>
          <span className="truncate text-[13px] text-text">{r.name}</span>
          <span className="h-2 overflow-hidden rounded-full bg-canvas">
            <i className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, r.pct)}%` }} />
          </span>
          <span className="shrink-0 text-right text-[13px] tabular-nums text-text-muted">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DistBody({ v }: { v: Extract<MetricValue, { kind: "distribution" }> }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-end gap-1">
        {v.bins.map((b, i) => (
          <span
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`flex-1 rounded-t transition-colors ${b.hot ? "bg-accent" : hover === i ? "bg-primary" : "bg-primary/50"}`}
            style={{ height: `${Math.max(3, b.h)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-text-muted">
        <span>{v.xL}</span>
        <span>{v.xR}</span>
      </div>
    </div>
  );
}

/** The finance teaser — a headline number, a plain-English estimate, and a
 *  disabled-by-design CTA. This is a preview card: nothing it shows is a real
 *  offer, and the button never calls Stripe Capital or Issuing — it just
 *  confirms interest locally, the same weight as any other "notify me" stub. */
export function OfferBody({ v }: { v: Extract<MetricValue, { kind: "offer" }> }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-warning-tint px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-warning">
        {v.badge}
      </span>
      <div>
        <p className="text-[13px] font-medium text-text-muted">{v.headline}</p>
        {v.amount !== "—" && <span className="text-[28px] font-bold leading-none tabular-nums text-text">{v.amount}</span>}
      </div>
      <p className="line-clamp-3 text-[13px] text-text-muted">{v.sub}</p>
      <ul className="flex flex-col gap-1">
        {v.bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5 text-[13px] text-text-body">
            <span aria-hidden className="mt-[3px] size-1 shrink-0 rounded-full bg-primary" />
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-1">
        <button
          type="button"
          disabled={sent}
          onClick={() => setSent(true)}
          className="rounded-field border border-primary bg-transparent px-3 py-1.5 text-[13px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:cursor-default disabled:border-border disabled:text-text-muted disabled:hover:bg-transparent"
        >
          {sent ? "We'll be in touch" : v.cta}
        </button>
      </div>
    </div>
  );
}

/** The stat body — hq's KpiTile anatomy in Leuk type: big number, unit/delta subline. */
export function StatBody({ v }: { v: Extract<MetricValue, { kind: "stat" }> }) {
  const tone =
    v.tone === "success" ? "text-success" : v.tone === "danger" ? "text-danger" : v.tone === "warning" ? "text-accent-deep" : "text-text";
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <span className={`text-[30px] font-bold leading-none tabular-nums ${tone}`}>{v.value}</span>
      {v.sub && <span className="mt-1.5 line-clamp-2 text-[13px] text-text-muted">{v.sub}</span>}
    </div>
  );
}
