# TASK: Employer view rework (/plans) — rail + content workspace

_Brief written 2026-07-13 by the DB/ingest session for a build terminal. Read
`CLAUDE.md` first; the design-system rule (reuse `components/ui/*`, never
create primitives) and the one-H1-in-TopBar rule are absolute._

## Why now (context you need, don't re-derive)

- The Aetna plan catalog is live: **2,315 employers / 15,221 plans**
  (`employers`, `plans` tables, sql/020; repo `lib/repos/plans.ts`).
- Today we proved the semantics: **rates attach to the network PRODUCT**
  (e.g. "Aetna Choice POS II"), and each plan points at a product. A
  10-product rate sweep is loading overnight, so `getEmployerRateSummary(ein)`
  returns meaningful rows for most employers by morning.
- Rate labels were repaired today: `plan_or_network` for the Healthfirst book
  is now `HF HF-MANAGEMENT-SERVICES-LLC-Aetna-Choice-POS-II` /
  `…-AHF-Choice-POS-II`. Display prettification exists:
  `prettyNetworkLabel()` in `lib/format.ts`.

## The build

Rework the employer detail surface in `app/(app)/plans/` on the
**ProviderView pattern** — copy the layout idiom from
`app/(app)/directory/provider-view.tsx` (calendar-style split: `w-80` info
rail with fixed identity header + flexing content column, `min-h-0` chain,
table owns its scroll per `docs/TASK-TABLE-STANDARD.md`).

**Rail (employer identity):** name, EIN (formatted `XX-XXXXXXX`), market
type, self-funded badge (`self_funded`), plan count, state. Use the same
card/header primitives ProviderOverview uses — no new components.

**Content column, two stacked sections (or Tabs if height demands):**

1. **Networks & rates** — `getEmployerRateSummary(ein)`: one row per network
   product the employer's plans buy → columns: product name, plan count,
   and the per-CPT rate figures (use `CPT_LABELS` from the repo; dollar
   figures are pre-labeled strings — never render bare numbers or invent
   patient-cost language; these are payer→provider rates, label them
   "in-network rate").
2. **Plans** — `getPlansForEmployer(ein)`, with the NYS-44 display fixes
   applied HERE (display-layer only, do not mutate data):
   - Strip the employer-name prefix from plan names ("UNITED AIRLINESAetna
     Choice POS II" → "Aetna Choice POS II"): the plan name starts with the
     employer's name in caps, glued with no separator — strip
     `employer.name` prefix case-insensitively, then trim.
   - Dedupe identical rows post-strip → one row + `×N` count Badge.
   - Keep raw name in the row's `title` attribute (provenance hover).

**Index page (`plans-index.tsx`):** keep the existing employer list/table,
just make the row click open the reworked detail. Respect the Table
standard (fixed header, table-owned scroll) — the primitive was already
fixed; don't fork it.

## Constraints

- Named exports; `@/*` imports; server components except where the existing
  files are already client.
- Repos only via `lib/repos/plans.ts`; if you need a new query, add it there
  with the `hasDb ? sql : mock` branch and ISO-date normalization
  (`isoDateOnly`/`isoDateTime` from `lib/format.ts`).
- One H1 lives in the TopBar (`components/shell/topbar.tsx` `ROUTE_TITLES`)
  — the employer page renders an entity header in the rail, not a page H1.
- `npm run dev` → port 3010, login `brendan@leuk.demo` / `demo`. Verify on
  localhost:3010; do NOT deploy, do NOT commit (`git add` nothing — shared
  tree, the lead session stages selectively).
- `npx tsc --noEmit` must pass when done.

## Acceptance

- /plans → click employer → rail + content workspace, no 404s, no layout
  scroll leaks (page body never scrolls horizontally; table scrolls inside
  itself).
- "UNITED AIRLINESAetna Choice POS II" renders as "Aetna Choice POS II";
  153-duplicate plans collapse to one row with a count.
- Networks section shows post-sweep products (verify at least the
  Healthfirst employer EIN and one big employer, e.g. CVS or NY-Presbyterian).
- Report: files touched, anything you wanted from the design system that
  didn't exist (per the new-primitive escalation rule).
