"use client";

import { useEffect, useState, type ReactNode } from "react";

// Landing-page reveal — ported from the sports codebase's RevealFx: a
// mask-sweep + blur + settle that plays once on mount, so navigating in from
// another page (e.g. the homepage) feels like the content develops in rather
// than just appearing. Distinct from marketing's `Reveal` (components/marketing/
// reveal.tsx), which is scroll-triggered for below-the-fold sections; this one
// fires on mount, for content that's visible immediately on arrival.

export function RevealFx({
  children,
  delay = 0,
  translateY = 20,
  durationMs = 1100,
  className = "",
}: {
  children: ReactNode;
  delay?: number; // seconds
  translateY?: number; // px offset before reveal
  /** 1100ms is tuned for a marketing hero, arriving once. Pass something in
   *  the 150–250ms range for an in-app route transition — see ContentSurface,
   *  which remounts this on every navigation and needs it to feel instant,
   *  not cinematic. */
  durationMs?: number;
  className?: string;
}) {
  const [on, setOn] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOn(true);
      setDone(true);
      return;
    }
    const t = setTimeout(() => setOn(true), Math.round(delay * 1000));
    return () => clearTimeout(t);
  }, [delay]);

  // Only drop the blur filter after the mask sweep finishes, not on transform/filter.
  function handleTransitionEnd(e: React.TransitionEvent) {
    if (on && e.propertyName === "mask-position") setDone(true);
  }

  return (
    <div
      className={className}
      onTransitionEnd={handleTransitionEnd}
      style={{
        WebkitMaskImage: "linear-gradient(to right, black 0%, black 25%, transparent 50%)",
        maskImage: "linear-gradient(to right, black 0%, black 25%, transparent 50%)",
        WebkitMaskSize: "400% 100%",
        maskSize: "400% 100%",
        WebkitMaskPosition: on ? "0 0" : "100% 0",
        maskPosition: on ? "0 0" : "100% 0",
        filter: done ? "none" : on ? "blur(0px)" : "blur(16px)",
        transform: `translateY(${on ? 0 : translateY}px)`,
        transition: [
          `mask-position ${durationMs}ms cubic-bezier(0.25, 0.4, 0.25, 1)`,
          `-webkit-mask-position ${durationMs}ms cubic-bezier(0.25, 0.4, 0.25, 1)`,
          `filter ${durationMs}ms cubic-bezier(0.25, 0.4, 0.25, 1)`,
          `transform ${durationMs}ms cubic-bezier(0.25, 0.4, 0.25, 1)`,
        ].join(", "),
      }}
    >
      {children}
    </div>
  );
}
