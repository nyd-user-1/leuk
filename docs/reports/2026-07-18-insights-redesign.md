# Report — /insights redesign: the ecosystem front door (NYS-125)

**Session:** ui-agent (Opus). **Brief:** NYS-125 + tonight's Night Report on
/insights. **Date:** 2026-07-18. **Commit:** `2eb28c2` (on origin/main).

## TL;DR

/insights below the practice strip is now **one narrative column** that reads the
self-sustaining, self-healing data ecosystem end to end — the founder's "plumbing
and taste, lol." Practice Layer 1 is untouched; the admin layers are reframed into
seven eyebrow'd beats. Composed **entirely from existing primitives — no new
primitive.** Carries the founder's **RelatedLink hover-wipe** refinement in the same
commit. Verified headless at :3010, pushed, NYS-125 closed Done.

## The idea

The old admin stack was three stacked blocks (night report → sync-health →
platform data). The redesign turns it into a legible story with one rhythm — every
section opens with an **icon eyebrow → title → one-line blurb** (a local
`EcoSection` composition), so seven sections read as one page:

| Beat | Eyebrow | Section | Source |
| --- | --- | --- | --- |
| 1 | The engine | **Coverage & growth** (new) | night report (parsed) + live inventory |
| 2 | Overnight | **The night's work** — the editable report | `lead_reports` (unchanged) |
| 3 | Plumbing | **Pipelines** — sync-health + run history | `sync_runs` (unchanged) |
| 4 | The workforce | **The agent fleet** (new) | static roster + `docs/reports/` fs ledger |
| 5 | Self-sustaining, self-healing | **The next rung** (new) | NYS-122/123/124 |
| 6 | Plumbing and taste | **The standards that make ten agents read like one hand** (new) | the invariants |
| 7 | Under the hood | **Platform data** — the observatory | inventory (unchanged) |

The **scoreboard** is the front-door hero: rate-corpus size (**13.4M**, +4.38M
overnight) and the coverage gauge (**47.78%** toward the 49.4% phase ceiling, +518
NPIs, drawn as a `ProgressBar`). Both are **parsed from the night report**
(`lib/insights-metrics.ts`, a pure regex parser) rather than recomputed — so the
gauge and the prose report directly below it can never disagree, and every field
degrades to null (card hides / falls back to the live estimate) if the wording
changes. The structural counts beside them (NPIs priced 43,720 · payer books 30 ·
billing TINs 31,233 · directory NPIs 106,497) read off the inventory the page
**already fetched** — zero new DB round trips.

## Surfaces shipped (`2eb28c2`, 10 files, +577/−60)

- `app/(app)/insights/page.tsx` — rewired into the seven-beat column; adds the
  `recentReports()` flight (admin-only) to the existing `Promise.all`.
- `app/(app)/insights/section.tsx` — **new** `EcoSection` (local masthead markup).
- `app/(app)/insights/coverage-growth.tsx` — **new** the scoreboard.
- `app/(app)/insights/fleet.tsx` — **new** roster + live reports ledger.
- `app/(app)/insights/next-rung.tsx` — **new** the NYS-122/123/124 roadmap cards.
- `app/(app)/insights/taste.tsx` — **new** the six-standard panel.
- `lib/insights-metrics.ts` — **new** pure helpers (night-report parser + inventory
  pluck). No DB, no PHI.
- `lib/repos/reports.ts` — **new** best-effort `docs/reports/` fs reader.
- `components/ui/text-link.tsx` — RelatedLink refinement (see below).
- `app/(app)/design-system/page.tsx` — RelatedLink catalog card updated.

## Primitives — added or changed (the law)

- **Added: none.** Every surface composes existing kit primitives (Card, StatCard,
  ProgressBar, Badge, DotBadge, Banner, ListRow, TextLink, Divider, Icon). The two
  page-locals (`EcoSection`, and the feature sections) are compositions in the
  `insights/` route folder, not kit primitives.
- **Refined: `TextLink` (`related` variant).** Founder-specified canonical form of
  the RelatedLink hover motion (TASK-SEARCH task 6, carved into this pass):
  - **Rest:** muted-teal dotted underline, body-text color.
  - **Hover:** text goes teal, and a **solid teal underline wipes in over the
    dotted line left→right** via the *existing* `.link-wipe` motion.
  - **Mechanism:** an inline-block `.link-wipe` span won't render the anchor's
    `text-decoration`, so the dotted rest-line and the solid wipe must live on the
    **one** element. Added `WIPE_SPAN_EXTRA` to carry the dotted decoration on the
    wipe span; moved `related` into `WIPE_VARIANTS`; the anchor now only owns the
    color transition. Byte-compatible rest appearance with the prior dotted-teal;
    the hover is the new behavior. `/design-system` card + `desc` updated to match.
  - This is a **refinement of an existing variant**, not a new primitive — but it
    changes a shared primitive, so: **4 consumers** in blast radius (design-system,
    /orgs/registry, /published-rates, and now /insights/taste). Rest state is
    visually unchanged; hover is additive. No caller breaks.

## One-offs killed

- The three hand-rolled `<div><h2 …><p …>` section intros in the old page.tsx are
  replaced by the single `EcoSection` rhythm — the observatory's ad-hoc heading and
  the "Platform data" heading now share the eyebrow pattern with every other beat.

## Verification (rendered and looked at)

Headless at :3010, admin cookie login (`brendan@leuk.demo`), playwright-core →
system Chrome:

- **All seven sections render**; presence-checked strings incl. "Coverage &
  growth", "47.78", "The agent fleet", "NYS-122/124", "make ten agents read like
  one hand", "built this page". Zero console errors.
- **No horizontal overflow** at 1440 and 820 (`documentElement.scrollWidth ==
  clientWidth`) — the table-overflow rule holds (the app scrolls inside a nested
  container; captured by scrolling that element, not the document).
- **Coverage 47.78%** and the +overnight deltas render live from tonight's report;
  the structural counts render live from the inventory.
- **Fleet reports ledger** reads the real `docs/reports/` files, titles parsed from
  each report's first heading (Engineering review, Docs & Linear, Data-quality…).
- **RelatedLink**: captured rest / mid / full-hover frames on /design-system — the
  mid frame shows the solid teal filled ~60% across (under "13-395") while the tail
  is still dotted; the full frame is solid teal end to end. The founder's spec,
  exactly.
- **Theme:** the `(app)` workspace shell is **light-only by design** (`.dark` is a
  marketing-site-only toggle; the shell never sets it). Every new surface uses theme
  tokens exclusively, so it inherits any future workspace dark mode for free.
- `tsc --noEmit` clean.

## Seam hygiene

Staged **only my 10 files**. The tree carried concurrent unstaged work from the
search tranche (`app/api/search/`, `components/search/command-palette.tsx`,
`lib/repos/rate-rows.ts`, `services-panel.tsx`, `sql/060_search_trgm_indexes.sql`,
etc.) — none touched, none staged. Verified the two shared files I edited
(`text-link.tsx`, `design-system/page.tsx`) diff to only my hunks. `main` was at
`origin/main`; pushed as a clean fast-forward.

## Flags for the lead

1. **`docs/reports/` fs read on Vercel.** The fleet ledger reads the filesystem at
   request time (`force-dynamic`). It works in dev; on a Vercel build the `docs/`
   dir may not be traced into the serverless bundle, in which case `recentReports()`
   returns `[]` and the ledger simply doesn't render (the roster stands alone). If
   the founder wants the ledger guaranteed in prod, a build-time generated manifest
   (or committing a small JSON index) would harden it — a cheap follow-on, but out
   of a pure-UI seam, so flagging rather than doing.
2. **Coverage % provenance.** The scoreboard's coverage/growth headline is parsed
   from the night report on purpose (single source, can't drift from the prose). If
   the fleet ever wants coverage as a first-class *live* metric independent of the
   report, that's a quality-agent job (define the reachable-cohort denominator and
   expose it as a repo/matview) — I deliberately did **not** invent an audit query
   in a UI seam.

## Next-tranche suggestions

- Promote `EcoSection` into the kit if a second surface wants the eyebrow'd-section
  rhythm (it's a strong pattern; today it's correctly page-local until a second
  consumer earns the promotion — the deliberate-new-primitive rule).
- When NYS-122/123/124 ship, the "next rung" cards want a "Done" treatment (a
  strikethrough / completed badge) so the roadmap section ages honestly.
