# TASK: Organization workspace (/orgs) — rail + content

> **STATUS: BUILT & VERIFIED 2026-07-13 (Opus, DB/ingest session).** Shipped
> `app/(app)/orgs/` (index + `[tin]` detail on the ProviderView chassis) +
> `app/api/orgs/{route,roster/route}.ts`, nav wired in `app-shell.tsx` +
> `topbar.tsx` (icon `id-card`). Verified live on :3010: Headway NY lists
> first (13,614 clinicians / 8 payers), detail shows rail + economics +
> roster + Suspense participation; Oxford 90837 median $137.78 matches the
> matview; unnamed EIN + npi-TIN NPPES paths both render; tsc clean. Roster
> links to `/directory/providers/{npi}` (the real deep-link route; the
> `/directory/{slug}` below was the pre-build guess). This section is kept as
> the spec of record — no build terminal needed.

_Brief written 2026-07-13 (late) by the DB/ingest session for a build
terminal. Read `CLAUDE.md` first; the design-system rule (reuse
`components/ui/*`, never create primitives) and the one-H1-in-TopBar rule
are absolute._

## Why now (context you need, don't re-derive)

- The organization layer shipped tonight (sql/025 + `lib/repos/orgs.ts`,
  all functions live against Neon). An **org = a billing TIN** observed in
  `provider_rate_signals` — the contract-holding entity between providers
  and payers. Proving case: **Headway NY** (`ein:832675429`) = 13,614
  clinicians across 8 payer books.
- Names come from `tin_registry` — they are **payer-roster attestations**,
  not legal-entity lookups. Many TINs are unnamed (label falls back to
  `formatTin()` — `EIN 83-2675429`); the page must render fully nameless.
- Every panel below reads precomputed matviews through the repo; nothing
  touches the 9M-row fact table. `getOrgParticipation` is the one heavier
  call (~1.5s on Headway) — render it inside a Suspense boundary.

## The build

New route pair `app/(app)/orgs/page.tsx` + `app/(app)/orgs/[tin]/page.tsx`.
Everything through `lib/repos/orgs.ts` (already written — do NOT add SQL in
components):

```ts
import {
  listOrgs, getOrgHeader, getOrgRates, getOrgRoster,
  getOrgFhirNames, getOrgParticipation, getOrgsForNpi,
} from "@/lib/repos/orgs";
```

- Add `ROUTE_TITLES` entries in `components/shell/topbar.tsx`
  ("Organizations"), and a sidebar item in `components/shell/sidebar.tsx`
  — both files are being edited by concurrent sessions; keep your hunks
  minimal and additive.
- `[tin]` param is the normalized key (`ein:832675429`); link with
  `encodeURIComponent`, decode in the page.

**Index (`/orgs`):** Table of `listOrgs({ q })` — columns Organization
(label; when `name` is null render the EIN label with muted styling + a
"unnamed" Badge), Clinicians (`npis`), Payers (`payerCount`), Last seen
(`lastFileDate`). Search box filters by name (`q`). Row click →
`/orgs/[tin]`. Respect the Table standard (`docs/TASK-TABLE-STANDARD.md`:
fixed header, table owns scroll, `min-w-0` on flex ancestors).

**Detail (`/orgs/[tin]`):** ProviderView chassis — copy the layout idiom
from `app/(app)/directory/provider-view.tsx` (`w-80` info rail + flexing
content column, `min-h-0` chain).

Rail (org identity, `getOrgHeader`):
- `label` as the entity header (entity headers are the allowed exception
  to the one-H1 rule), formatted TIN below it, name-source chip when
  `nameSource` is set (e.g. "named via payer roster crosswalk").
- Counts: clinicians, payer books, `asOf` ("evidence through {date}").
- When `nppes` is non-null (npi-type TINs): NPPES block — other name,
  taxonomy, address/city/state, authorized official.
- "Also appears as" strip from `getOrgFhirNames` — the names payers
  publish for this roster (e.g. Anthem says "Lifestance Psychology"),
  each with its payer + clinician count. Cap at what fits; it returns ≤8.

Content column, three sections:

1. **Per-insurer economics** — `getOrgRates(tin)`: table payer ×
   billing code → clinicians (`npis`, evidence weight), p25/median/p75,
   min–max range, as-of. RULES (same as /rates, non-negotiable): these are
   **payer→provider in-network rates**, never patient cost — label the
   section "In-network rates" and every figure block carries
   "as-of {asOf}". Group rows by payer (payer name once, codes under it).
2. **Roster** — `getOrgRoster(tin, { limit, offset })`, paginated 50/page
   (`total` drives the pager). Columns: name (link `/directory/{slug}`
   when slug present, bare NPI otherwise), profession, city, payer count,
   last seen. Names come from our directory — rows without a match render
   the NPI in mono muted.
3. **Network participation** — `getOrgParticipation(tin)` in a Suspense
   boundary: payer, network, clinicians attested, accepting-new-patients
   count. Frame: membership evidence from payer directories; accepting =
   liveness, distinct from the rate-derived membership above.

**Provider-profile hook (small, optional if time allows):** in the
directory provider view, a "Bills under" line via `getOrgsForNpi(npi)`
linking to `/orgs/[tin]` — coordinate with whoever owns
`provider-view.tsx` right now; skip if it's mid-rework.

## Constraints

- Named exports; `@/*` imports; server components (client only where the
  chassis already is). No new SQL in components; extend `lib/repos/orgs.ts`
  if a query is missing (hasDb branch + ISO dates via `lib/format.ts`).
- Do NOT touch `lib/repos/rate-signals.ts` — the rates-perf terminal owns
  it. (Its `cohortsForTins` seq-scan will later move onto
  `org_tin_rosters`; that swap is a separate coordinated change, NYS-52.)
- Dev server: `npm run dev` → :3010, login brendan@leuk.demo / demo.
  Verify on localhost, do not deploy.

## Acceptance criteria

1. `/orgs` lists Headway NY first (13,614 clinicians, 8 payers), named
   rows show names, unnamed rows show `EIN XX-XXXXXXX` + Badge; search
   "headway" narrows to it.
2. `/orgs/ein%3A832675429` renders rail + all three panels. Spot-check:
   Oxford 90837 median **$137.78**, Oxford roster 3,250 clinicians —
   must match `org_tin_rate_summary` exactly.
3. `/orgs/ein%3A841856765` (unnamed, 5,621 clinicians) renders fully:
   EIN label, no name chip, all panels populated.
4. An npi-type TIN org (pick one from `listOrgs`) shows the NPPES block.
5. No page-level horizontal scroll anywhere (check the flex ancestor
   chain, not the table).
6. `npx tsc --noEmit` clean on the files you touched.
