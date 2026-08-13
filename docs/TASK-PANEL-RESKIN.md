# TASK — SidePanel reskin: adopt the hq "tech specs" drawer anatomy

The current `SidePanel` (components/ui/side-panel.tsx) is functionally fine but
visually flat, and Brendan wants it replaced with the drawer language from hq's
Linear-tech-specs knockoff: `~/Code/hq/app/ui/landing/spec-drawer.tsx` (read it
first — its header comment documents the exact chrome: inset 1px ring, high
shadow `0 7px 32px`, top-left radial glow, mono uppercase kicker label, big
title, enter-only fly-in, Esc + backdrop dismiss). Also skim
`~/Code/hq/app/ui/landing/primitives.tsx` for its supporting vocabulary.

## The one hard constraint
`SidePanel`'s API does not change. 22 files consume it
(open/onClose/title/icon/headerActions/footer/width/mobileSheet/children) —
this task is a ONE-FILE reskin of the primitive plus token additions, not a
migration. If you find yourself editing call sites to make the new look work,
stop and reconsider (adding OPTIONAL props is fine; requiring changes is not).

## Translation, not transplant
Do NOT copy Linear's dark `#0f1011` chrome into the light app shell verbatim —
it would read as a foreign object. Adopt the ANATOMY in Leuk's tokens
(globals.css vars; bg-canvas/border-border/shadow-menu etc.):
- Flyover presentation: panel floats over the page with a visible inset ring
  + elevated shadow and a small gap from the viewport edge (Linear-style
  "card flying over the page"), rather than the current full-height flush
  slab. Rounded corners per `rounded-card`.
- Header: mono uppercase kicker line (e.g. the section/type — "PRESCRIPTION",
  "CLIENT", panel title's category) above a larger, calmer title. Map the
  existing `icon`/`title` props onto this — kicker can derive from a new
  optional `kicker` prop, falling back to nothing.
- Motion: enter-only animation (fly in from right + fade, ~180–220ms,
  ease-out); instant dismiss. Backdrop = softer scrim than today.
- Body/footer: keep scrollable body + pinned footer behavior exactly.
- `mobileSheet` bottom-sheet presentation keeps working.
- OPTIONAL `variant="spec"` — the faithful dark treatment (near-black panel,
  radial glow, #8a8f98 secondary text) for read-only detail/spec surfaces.
  Build it only if it drops out naturally from the same structure; do not
  force consumers onto it.

## Scope
- `components/ui/side-panel.tsx` (+ any new CSS vars in app/globals.css).
- Update the SidePanel card on /design-system to show the new look (and
  `variant="spec"` if built).
- Verify, visually, at least: clients → New client panel, calendar
  appointment panel, catalog panel, Photon prescribe + Rx detail panels,
  billing payer panel. All 22 consumers must still compile (`npx tsc
  --noEmit`) and none may need edits.
- Do NOT touch Modal, portal-invoice-sheet's own styling beyond what it
  inherits, or any page logic.

## Done when
1. Every SidePanel in the app has the new anatomy with zero call-site changes.
2. No page-level horizontal scroll introduced; body scroll + pinned footer
   intact; Esc/backdrop dismiss intact; mobile sheet intact.
3. /design-system documents the primitive's new look.
4. Verified on localhost:3010 signed in as brendan; spot-check casey's portal
   (portal surfaces reuse shared components).

## Working agreements
Stage ONLY your own files/hunks (`git add -p` where shared — concurrent
sessions share this tree; topbar/sidebar/globals.css are contested files).
Commit locally; do NOT push. Report to
`docs/reports/2026-07-16-panel-reskin.md`, 60-line cap, sections:
Shipped / DB changes / Decisions / Open items / Gotchas.
Linear (NYS team): file a ticket for this build at the start, close it when
done; every Open item in your report gets its own open Linear ticket. If you
lack Linear access, say so in the report instead.
