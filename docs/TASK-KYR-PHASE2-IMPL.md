# IMPLEMENTATION BRIEF — Know Your Rates phase 2 (Recruiting · Roster Check · Apply Next · Affiliation Economics)

_Execution prompt for session `e22ea439-2ce9-40e1-867b-b71f4fe4ed8e`. Read
`docs/TASK-KYR-PHASE2.md` FIRST — it is the product spec and its copy laws are
binding. This doc is the implementation plan from the design lead (Fable):
file-level instructions, data contracts, and coordination rules. Where the two
disagree, the spec's product intent wins; this doc's lane/coordination rules
always win._

**Build in priority order: 1) Recruiting · 2) Roster Check · 3) Apply Next ·
4) Affiliation Economics. Commit each feature separately as you finish it.**

---

## 0. Coordination — read before touching anything

You are one of two executor sessions **sharing this same working tree**:

- **Peer session `ef32ce8a-bdaf-44dd-bffd-25d5db2ac937`** is executing
  `docs/TASK-TABLE-STANDARD.md` concurrently: it owns
  `components/ui/table.tsx` (teal sticky sortable headers, lazy-load),
  `app/(app)/clients/*`, `app/(app)/directory/*`, `app/(app)/billing/*`, and
  a restyling sweep of the three EXISTING rates panels
  (`components/rates/{bands-panel,panels-panel,spread-panel}.tsx`).
- **Your lane:** `lib/repos/rate-signals.ts`, `lib/mock/rate-signals.ts`,
  `sql/018_*.sql`, `app/api/rates/*` (new routes), **new** files under
  `components/rates/`, `components/rates/rates-shell.tsx` (tab additions),
  `app/(app)/recruiting/*`, `app/recruiting/print/*`, `app/rates/packet/*`,
  plus one-line registrations in `components/shell/topbar.tsx` and
  `components/shell/app-shell.tsx`.
- **Shared-tree protocol:** files may change under you (the peer edits live).
  Re-read a file immediately before editing it. Stage ONLY your own files,
  hunk-by-hunk where a file is shared (`git add -p`) — **never `git add -A`**.
  Never revert a change you didn't make. If a file you must edit is mid-flight
  with foreign changes you don't understand, pause that edit and note it in
  your report instead of working around it.
- **Conflict zone (be surgical):** `rates-shell.tsx` and `panels-panel.tsx` —
  you add tabs/state/economics card; the peer may restyle the tables inside
  the same files. Keep your diffs minimal and localized.
- **Dev server law:** ONE dev server runs on port 3010, managed by the lead.
  **Never** start a second `npm run dev`, never kill/restart the running one,
  never `rm -rf .next`. Next hot-reloads your edits. If the server wedges
  (stale CSS, persistent 500s after a save), say so in your report — the lead
  bounces it. Verify against the running instance.
- Do NOT touch: `lib/repos/networks.ts`, `lib/insurance-options.ts`,
  `scripts/mrf/*`, `.harvest/*`, marketing pages (`app/(site)/*`,
  `app/page.tsx`), or `components/ui/table.tsx` (peer's file — consume it as
  is; if its API changes under you, adapt your call sites).

## 0.5 Standing laws (same as phase 1)

- Existing primitives only (`components/ui/*`, browse `/design-system`). New
  *feature* components under `components/rates/` are fine; new primitives are
  not.
- **No bare rate number ever leaves `lib/repos/rate-signals.ts`.** Figures
  leave pre-wrapped ("$197.80 in-network"), every figure/claim carries its
  as-of, all arithmetic (deltas, percentiles, annualizations, gap %) happens
  inside the repo. UI never parses or computes on display strings.
- One H1 per page, in the TopBar via `ROUTE_TITLES`; page actions via
  `TopBarActions`. Full-screen print surfaces are the allowed H1 exception.
- Copy laws (verbatim, from the spec): "**published under**", never "employed
  by". Never present anything as a background check. The Affiliation
  Economics card must carry this exact line: *"Rates belong to the contract
  that renders the care — these numbers inform where you schedule your hours
  and what you renegotiate, never how a claim is coded."*
- Dev: localhost:3010, sign in `brendan@leuk.demo` / `demo`.
  `npx tsc --noEmit` stays clean. Verify headless in a real browser
  (playwright-core is in node_modules; see scratchpad patterns from phase 1 if
  present). Report before committing.

## 1. Repo contracts (`lib/repos/rate-signals.ts` — the only door)

Study the file first; reuse its internals (`NY_ENTITY_RE`, `normTin`,
`money`, `figureDisplay`, `bandNumbers`, `cohortsForTins`, `getStanding`).
Add:

### 1a. Org names — null-safe until `tin_registry` lands
```ts
export async function getOrgName(tin: string): Promise<string | null>
// db: SELECT business_name FROM tin_registry WHERE tin_norm = ${normTin(tin)} LIMIT 1
//     wrapped in try/catch → null (the table is being built in a PARALLEL
//     TERMINAL; it may not exist yet — do not gate anything on it).
// mock: mockTinOrgs[normTin(tin)] ?? null
```
Also an internal batch (`orgNamesFor(tins: string[]) → Map`, one query,
catch → empty map) and a display helper: holder = orgName ??
`"EIN 26-2976526"` (format `ein:262976526` → `EIN 26-2976526`; `npi:X` →
`org NPI X`). When the registry lands, names appear with zero code change —
say so in your report.

### 1b. Credentialing footprint
```ts
export interface FootprintBook {
  payer: string; networks: string[]; tin: string;
  holder: string; orgKnown: boolean; platformScale: boolean;
  codes: Record<string, string>;   // billingCode → wrapped figure, no as-of suffix
  asOf: string;
}
export interface CredentialingFootprint {
  npi: string;
  identity: { name: string; profession: string | null; license: string | null } | null;
  foundIn: FootprintBook[];        // NY-book entities only
  checkedBooks: string[];          // every distinct NY-book payer we index
  absentFrom: string[];            // checkedBooks − foundIn payers
}
export async function getCredentialingFootprint(npi: string): Promise<CredentialingFootprint>
```
Build on `getStanding` (it already returns groups with tin/networks/rates/
cohort). `checkedBooks`: `SELECT DISTINCT payer FROM provider_rate_signals
WHERE payer ~* NY_ENTITY_RE` — cache in a module variable (it's stable within
a process). Identity from `directory_providers` (confirm its actual columns
before selecting — you need name, profession, and license if present).
Mock: derive checked books from the mock band fixtures' payers.

### 1c. Percentile placement
```ts
export async function getPercentilePlacement(
  payer: string, billingCode: string, tin: string,
): Promise<string | null>   // "p38" | null when either side has no rows
```
One SQL: deduped band rows (`DISTINCT npi, negotiated_rate`, dollar types) for
the payer+code; the TIN's schedule rate = median of the TIN's deduped rates
for that payer+code (normTin match); placement = round(100 × fraction of band
rows ≤ tin rate). Return the string only.

### 1d. `computeSpread` vs a TIN's schedule (Roster Check moment 2)
Extend opts with `schedule?: { payer: string; tin: string }`. When set, the
comparison side is that TIN's published rate per code (median of the TIN's
deduped rates under that payer) instead of payer medians, the result contains
only that payer, per-code copy reads "…vs the contract's published rate", and
the headline/assumptions label it "the margin your work generated" (never
guess their comp — the user typed their own pay). Arithmetic stays inside.

### 1e. Attestations — migration + write path
New file `sql/018_provider_affiliation_attestations.sql`:
```sql
CREATE TABLE IF NOT EXISTS provider_affiliation_attestations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npi            TEXT NOT NULL,
  tin            TEXT NOT NULL,          -- as published; match on normalized form
  status         TEXT NOT NULL CHECK (status IN ('current','left')),
  attested_month DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paa_npi ON provider_affiliation_attestations (npi, created_at DESC);
```
Insert-only log; **latest row wins per (npi, normTin)**. Run the migration
against live Neon once (`node --env-file=.env.local` + the SQL — additive
only). Repo: `attestAffiliation({npi, tin, status, attestedMonth?, note?})`
and `getAttestations(npi) → Array<{tin, status, attestedMonth, createdAt}>`
(DISTINCT ON normalized tin, newest first). Mock: a module-level Map in
`lib/mock/rate-signals.ts` so the demo write path works without a DB. This
write path is a proprietary liveness signal — treat it as production code,
not demo glue (validate status enum, 10-digit NPI, sane month).

### 1f. Apply Next
```ts
export interface GapCard {
  payer: string;
  headline: string;        // "Median for your codes: $197.80 in-network (90837) · top quartile $318.77"
  opportunity: string | null; // "≈ $237,400/yr gross at 25 sessions/wk at the median"
  negotiability: "flat" | "negotiated"; negotiabilityLabel: string;
  asOf: string;
}
export async function getApplyNext(
  npi: string, opts: { sessionsPerWeek?: number } = {},
): Promise<{ npi: string; identity: CredentialingFootprint["identity"]; gaps: GapCard[] }>
```
Gaps = footprint.absentFrom; figures from the un-tiered band internals for the
candidate's own codes (fall back to the behavioral five); rank by 90837 median
descending (payer with no 90837 band sorts last). Opportunity = median ×
sessions × 48, rounded to $100, wrapped, labeled gross. sessionsPerWeek
clamped 1–60, default 25.

### 1g. Affiliation economics
```ts
export interface EconCode {
  billingCode: string;
  entries: Array<{ tin: string; holder: string; display: string }>; // "$151.50 in-network", sorted desc
  gapDisplay: string;      // "38% apart" — computed here, never in the UI
}
export interface EconCard { payer: string; codes: EconCode[]; framing: "hours" | "roster" }
export async function getAffiliationEconomics(npi: string): Promise<EconCard[]>
```
Detect payers listing the NPI under 2+ distinct normalized TINs; per shared
code, per-TIN rate = median of that TIN's deduped rates; only emit codes where
the schedules actually differ. `framing`: check `getAttestations` — any
involved TIN marked `left` → `"roster"` (the UI then suppresses arbitrage
copy and points at Roster Check), else `"hours"`.

### 1h. Mock fixtures (`lib/mock/rate-signals.ts`)
All four features must demo with no `DATABASE_URL`:
- **Padgett-shaped** (use RAMIREZ 1588210394, already platform-TIN'd): add
  Cigna rows under TWO org TINs with different schedules (e.g.
  `ein:262976526` at $151.50/90837 and `ein:853976267` at $110.00/90837 —
  mirrors the live case), keep her Oxford-platform + Fidelis rows → 3 orgs,
  one multi-TIN payer, UHC verified-absent.
- **Hilario-shaped** (use GRIES 1093718234): single org, single payer.
- `mockTinOrgs`: name two of the TINs ("River Region Psychotherapy PLLC",
  "Orenda Psychiatry PLLC"), leave the rest null → exercises the EIN
  fallback.
- `mockAttestations` Map + org-name and checked-books mock paths.

## 2. API routes (`app/api/rates/*` — same conventions as phase 1: `requireRole("practitioner")`, `AuthError → status`, `force-dynamic`, no logEvent on public-record reads)

- `GET  /api/rates/footprint?npis=A,B` (≤4) → `{ footprints }`
- `GET  /api/rates/placement?payer=&code=&tin=` → `{ placement }`
- `GET  /api/rates/apply-next?npi=&sessions=` → `{ result }`
- `GET  /api/rates/economics?npi=` → `{ cards }`
- `GET  /api/rates/attestations?npi=` / `POST` `{npi, tin, status, attestedMonth?}`
  → the POST is a WRITE: validate hard, return the stored row.
- Extend `POST /api/rates/spread` body with optional `schedule: {payer, tin}`.

## 3. Feature 1 — RECRUITING (`/recruiting`)

- `app/(app)/recruiting/page.tsx` → thin server page rendering
  `components/rates/recruiting-shell.tsx` (client). Register
  `["/recruiting", "users-round", "Recruiting"]` in `ROUTE_TITLES` and a
  sidebar item after "Rates" in `WORKSPACE_NAV` (`app-shell.tsx`).
- Input row: the phase-1 merged pattern — one SearchInput, 10-digit entry
  offers "Look up NPI" (Enter works), looked-up candidates become dismissible
  teal Tags. Cap 4. Optional "+ Your payers" multi ChipMenu
  (`components/rates/chip-menu.tsx`, options = checkedBooks from the first
  footprint response) — when set, found-in rows matching the mix get a subtle
  highlight and the card header shows "covers N of M of your payers".
- **Footprint card per candidate** (Card):
  - Identity strip: name (reading order — reuse the `clinicianName` flip from
    panels-panel; consider exporting it to a small shared module instead of
    duplicating), profession, license when present. If no directory hit:
    "Not in our directory — footprint from payer books only."
  - **Time-to-revenue headline** (the first line under the identity, 17/600):
    found books → "Published in {Cigna + Oxford} today — sessions billable
    under your group after roster-add (weeks), not full credentialing
    (months)." Every absent major → one line like "UHC requires full initial
    credentialing (~90-day payer window)." Qualitative timelines only；the
    dollar figures on the card are repo strings.
  - **Found-in list**: one single-line row per book — InsurerMark + payer,
    network(s) truncated w/ title, holder (org name or EIN — muted), the 5
    CPTs as compact per-code presence (✓ with the wrapped figure in a title
    tooltip, or the figure itself for 90837), as-of, amber "via platform
    group" Badge when platformScale.
  - **Verified-absent**: "Checked {11} NY payer books · found in {3}" +
    absent payers as neutral Tags. Below it, always, the honest coverage
    line: "Absence is only claimable for the NY books we index — other-state
    regional books are not yet indexed." (This is Hilario's Nevada
    disclosure, generalized.)
  - Footer caveat (13px muted): presence is the payer's own published
    attestation as of the file date — it does not prove current employment or
    panel status.
- **Compare mode** (auto when ≥2 candidates): standard Table — rows = union
  of found payers (NY book), one column per candidate; cell = ✓ +
  the candidate's 90837 wrapped figure, or "—". Peer session owns table
  styling; just use the primitive.
- **Print view** `app/recruiting/print/page.tsx` (`/recruiting/print?npis=`):
  outside the shell, `/rates/card` pattern (reuse
  `components/billing/print-actions.tsx`), letterhead + compare table +
  per-candidate found/absent summaries + the caveat lines. TopBarActions on
  /recruiting: primary sm "Print comparison" opening it.

## 4. Feature 2 — ROSTER CHECK (tab in /rates)

`components/rates/roster-panel.tsx`, wired into `rates-shell.tsx`. New tab
order: **Negotiation card · Panels · Roster check · Apply next · Spread
check**. Lift a tiny bit of shared state into the shell: `activeNpi` (roster
and apply-next share it; either can set it) and `onPinBands(payer, code)`
(economics CTA → switches to the bands tab with the insurer filter + that
code selected — pass an optional `initialInsurer` style prop into BandsPanel;
keep the diff small, peer session is in that file).

- One NPI input (merged pattern). On lookup: fetch footprint + attestations.
- **Moment 1 — affiliation cards**, one per found book:
  - Headline: "**{payer} is still publishing you under {holder}**" + "as-of
    {date}" doing the emotional work (render the as-of prominently, not as a
    footnote).
  - Attestation control: SegmentedControl "Current" / "I left this group";
    choosing "left" reveals an optional month input (`<input type="month">`
    inside the Field pattern) + a small save Button → POST
    `/api/rates/attestations`. Show the stored state as a Badge ("Attested
    current" success / "Attested left {Mon YYYY}" neutral) once saved.
- **Moment 2 — inside each card**: the per-CPT contract rates (already in the
  footprint codes). One optional input pair: "What were you paid per
  session?" ($ Field) + sessions/week → POST `/api/rates/spread` with
  `schedule: {payer, tin}` → render per-code margin strings + the annualized
  figure (StatCard-small or bold line) labeled "the margin your work
  generated". Never prefill or estimate their pay.
- **Moment 3 — the pivot**: for the workhorse code (90837 when present),
  fetch placement → "{holder}'s 90837 sat at **{p38}** of {payer}'s book."
  One CTA Button: "The contract left. The rates don't have to. → See where
  to apply next" → `setActiveNpi(npi)` + switch to the Apply next tab.

## 5. Feature 3 — APPLY NEXT (tab in /rates)

`components/rates/apply-next-panel.tsx`. Keyed to `activeNpi` (own merged
input too, for direct entry). Sessions/week Field (default 25) → refetch.

- **Gap cards** from `/api/rates/apply-next`, ranked as returned. Each Card:
  - Payer line: InsurerMark + name + negotiability Badge ("Per group" info /
    "Flat schedule" neutral — tells her conversation vs take-it).
  - Headline figures (repo strings verbatim) + the annualized opportunity
    line + as-of.
  - **Packet progress**: ProgressBar primitive + "Your application is ~{80}%
    assembled". Checklist rows (check `circle-check` teal for held: NPI,
    NPPES identity, license #, taxonomy, practice address — only mark held
    when the directory actually returned the field; muted unchecked for CAQH
    ID, malpractice certificate, W-9). The % = held/total, rounded to 5.
  - Actions row: `[Open {payer}'s join-network portal]` (secondary, deep link
    from a `PAYER_PORTALS` map in `components/rates/` — use the payers'
    public provider-join URLs; if unsure of a URL, link the payer's provider
    home rather than guessing deep paths) · `[Download pre-filled packet]` →
    `/rates/packet?npi=&payer=` print view (below) · `[Mark submitted]` →
    starts the response clock.
  - **Response clock v1**: localStorage keyed `kyr-clock:{npi}:{payer}` with
    the submit date; when set, replace the button with a chip "day {N} of
    the payer's ~90-day credentialing window" (+ subtle warning tint past
    75). Flag in your report that this is client-local until we give it a
    table.
- Empty state: "You're in every negotiable NY book we index — see the
  negotiation card instead." (EmptyState + a link that switches tabs.)

**Packet print view** `app/rates/packet/page.tsx` (`/rates/packet?npi=&payer=`):
outside the shell; letterhead; "Credentialing packet — {name}, prepared for
{payer}" ; sections: identity (NPI, name, profession, license, taxonomy,
practice address — whatever the directory holds), current network
participation (the found-in books with as-of), and an explicit blank-lines
section for the fields we don't hold (CAQH ID, malpractice carrier/policy,
W-9). Footer: "Formatted for transcription into any payer's application —
{app} does not submit applications on your behalf." PrintActions reuse.

## 6. Feature 4 — AFFILIATION ECONOMICS (card in Panels)

In `panels-panel.tsx` (surgical diff — peer session works here too): after a
lookup, fetch `/api/rates/economics?npi=` per looked-up NPI; when cards come
back, render above the table:

- Card per payer: title "{payer} pays your codes differently by contract";
  per code one line: "{code}: {display} under {holderA} · {display} under
  {holderB} — **{38% apart}**" (all strings from the repo).
- `framing === "hours"` → subline: "Your clinical hour is worth more under
  {higher holder} for {payer} patients — schedule accordingly."
  `framing === "roster"` → no arbitrage copy at all; one line pointing to the
  Roster check tab ("You've marked {holder} as left — see Roster check for
  what your sessions were worth there.").
- The mandatory disclaimer line, verbatim, 13px muted, on every card:
  *"Rates belong to the contract that renders the care — these numbers inform
  where you schedule your hours and what you renegotiate, never how a claim
  is coded."*
- CTA: "Renegotiate the lower schedule" → `onPinBands(payer, code)`.

## 7. Verification (live + mock) — do all of it before reporting

Live demo NPIs (real rows in Neon):
- **1588146039 (Padgett)**: Oxford via the Headway platform TIN
  (`ein:832675429`, 3,112-cohort), Cigna under BOTH `ein:262976526` (River
  Region) and `ein:853976267` (Orenda) → multi-TIN economics card; absent
  from UHC's behavioral book → the Apply Next headline case.
- **1720884943 (Hilario)**: Cigna only, under `ein:842050464` (Culpepper) —
  single-affiliation; his footprint must show the coverage-scope line.

Checklist:
- [ ] /recruiting: both NPIs looked up, footprint cards render (identity,
      found-in with holders as EINs until tin_registry lands, verified-absent
      counts, time-to-revenue copy), compare table with 2 candidates, print
      view renders.
- [ ] Roster check on Padgett: three affiliation cards; attest "left" on one
      Cigna TIN → POST succeeds, badge shows, re-lookup shows stored state
      (live DB row + mock Map both).
- [ ] Moment 2: pay input → margin strings + annualized (server-side).
- [ ] Moment 3: p-placement renders; CTA lands on Apply next with the NPI.
- [ ] Apply next on Padgett: UHC gap card ranked first, checklist %,
      ProgressBar, portal link opens, packet print renders, Mark submitted →
      day-counter chip survives reload.
- [ ] Economics card on Padgett in Panels (two Cigna schedules, gap %,
      disclaimer verbatim); after the "left" attestation, framing flips to
      roster. Hilario: no card.
- [ ] Mock mode: all four features demo with `DATABASE_URL` unset (run the
      repo functions via `npx tsx` like phase 1, or a second port is NOT an
      option — use the tsx harness).
- [ ] `npx tsc --noEmit` clean; no new console errors; one H1 per page.
- [ ] Attestations table exists in Neon (migration run once, additive).

Report to Brendan before committing (what shipped, what degraded gracefully
— org names, response clock — and any file the peer session had in flight).
Then commit in feature-sized commits, staging only your files.
