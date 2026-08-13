# TASK — The rate-intelligence marketing family (our version of Payr's three pages)

**Executor:** ui-agent. **Date:** 2026-07-18. **Surface:** PUBLIC marketing
pages. **Mode:** build on :3010, screenshot everything, commit locally —
**do NOT push** (push = production deploy; the founder reviews first).

## Mission

Payr Advisors (payradvisors.com) sells consulting built on payer price
transparency: `/payr-pricing-data/` (rate benchmarking + claims analytics),
`/payer-negotiation/` (contract renegotiation using transparency files as
leverage), `/payer-provider-disputes/` (underpayment/denial dispute
advocacy). Fetch and study all three before designing.

Build **Leuk's version**: a small public marketing family that makes the
same three arguments — know your rates, negotiate from evidence, dispute
with the payer's own numbers — with one decisive difference: **Payr shows
one illustrative example; we show the live corpus.** Our credibility IS the
row count. We are not selling consulting hours; we are selling the platform
that holds the data (and, secondarily, recruiting NY behavioral clinicians
into it).

Three pages, cross-linked as one family (final route names are yours; keep
them short and public-friendly, e.g. `/pricing-data`, `/payer-negotiation`,
`/payer-disputes`). Study the existing public routes and the marketing Nav
first and place them consistently; add nav/footer links only where the
existing pattern has a place for them.

## Non-negotiables (each one is a binding ruling)

1. **Real data only, fetched live.** Every number on these pages comes from
   the database through `lib/repos/*` server-side at request time — never
   hardcoded (counts drift nightly). If no repo read exists for an aggregate
   you need, add a small **new** `lib/repos/public-stats.ts` (new file, your
   seam) with PHI-free aggregate reads. NO new sql/ migrations or matviews —
   if you believe one is needed, flag it in the report and ship without.
2. **No PHI, ever, and no client data.** Public scope = providers / orgs /
   plans / payers / aggregate rates only (the NYS-134 public-scope rule).
   Nothing from clients, appointments, messages, notes.
3. **No fabrication.** No invented testimonials, no "20–60% improvements",
   no outcome claims we cannot back. Payr's pages claim results; ours prove
   possession. The honest flexes: total attested rate rows (13.6M+ and
   growing), NY behavioral clinicians in the directory (106k+), billing
   organizations (31k+), payer books held, canonical networks/insurers
   (sql/043–044), federal plan filings (150k+ Form 5500). Pull the LIVE
   values; the figures here are for orientation only.
4. **Rate honesty labels.** A negotiated rate is the payer's own in-network
   attestation — never "your cost", never out-of-pocket. Any rate shown
   carries "payer-published in-network rate · as of {date}" framing. Payer
   medians/ranges MAY appear here (this is aggregate market intelligence,
   the NYS-35 lane — not a specific plan × provider × code answer, which is
   where exact-rate-first bites).
5. **Original copy.** Payr's pages are structural reference only. Write in
   Leuk's voice (see PRODUCT.md: hushed, grounded, assured; serif voice
   for the human moments, grotesque structure for the credible ones). Zero
   copied sentences.
6. **Real CTAs only.** Link to destinations that exist (the provider
   recruiting page, the public directory/care surfaces, `mailto:` contact).
   No fake demo forms, no dead "Request a case review" buttons. If a
   contact-capture form feels necessary, flag it — don't build one.
7. **Marketing design law** (memory-backed, do not re-litigate): warm-paper
   `bg-page` ground · shared `Nav` with `ground="bg-page"` · `PageHero` ·
   **watercolor illustration only** (the photoreal photos were deleted —
   never resurrect); InsurerStrip / TrustBand where payer logos or trust
   belong; marketing pages own their H1 (the TopBar rule is app-shell only).
8. **Primitives law.** Reuse `components/marketing/*`, `components/site/*`,
   and `components/ui/*`. A genuinely new marketing component must be named
   and justified in the report.

## The three pages (jobs, not layouts — layout is your craft)

### A. Pricing data — "the corpus page"
Payr's job: convince providers that transparency data reveals underpayment.
Ours: **show it**. Audience: NY behavioral clinicians and practice owners.
- Lead with the live corpus scale (rows, clinicians, orgs, payers,
  networks) — fetched, formatted, dated.
- A REAL benchmark moment where Payr shows a fake one: e.g. the payer
  spread for 90837 (individual psychotherapy, 60 min) across our NY payer
  books — payer name + logo (`components/rates/insurer-mark.tsx` has the
  marks), median/range, as-of. Aggregate lane, honesty labels per rule 4.
- How the data gets here (payer MRF/TiC attestations, refreshed nightly) —
  one quiet, confident section; no pipeline jargon.
- CTA: join the directory / explore care surfaces.

### B. Payer negotiation — "the leverage page"
Payr's job: sell renegotiation services. Ours: **arm the clinician**.
- The argument: you cannot negotiate what you cannot see; the payer already
  published their number; we hold it next to every other payer's number.
- A concrete, real contrast: the same service, different payers, the spread
  between them (real medians, labeled). This is the "why you're
  underpaid" moment — made of data, not adjectives.
- What a Leuk practice gets: their payer mix beside the market (describe
  the product truthfully — the /rates surfaces exist; don't overpromise
  features that don't).
- CTA: for-providers page / contact.

### C. Payer disputes — "the evidence page"
Payr's job: sell dispute advocacy. Ours: **the receipts**.
- The argument: an underpayment dispute is strongest when the evidence is
  the payer's own published attestation. That is literally what our corpus
  is (each row = the payer's in-network attestation, with a file date).
- What evidence looks like: an anonymized-shaped example built from real
  aggregate data (no real org singled out publicly — aggregate or
  hypothetical-labeled framing).
- NY-specific credibility: the entity layer (canonical insurers resolved
  from the DFS regulator list, 47 insurers / 69 networks) — the regulator's
  own registry, not name-matching.
- CTA: contact / for-providers.

Cross-link all three (a quiet "family" band or footer links on each).

## Data inventory (verify against the live repos before use)

- `lib/repos/networks.ts` — `listNetworks` (69 canonical), `listPayerFacets`.
- `lib/repos/plans.ts` — employer/plan/Form 5500 registry reads.
- Rate aggregates: `payer_rate_totals` (sql/026), the `rate_bands_*`
  matviews (sql/024), `provider_rate_summary` (sql/021) — find the existing
  repo reads over them (grep `lib/repos/`) before writing new ones.
- Directory counts: the public site already renders real directory counts —
  find and reuse that read.
- New PHI-free aggregates → `lib/repos/public-stats.ts` (new file).
- Neon returns `Date` objects; repos return ISO strings (`isoDateOnly`).
  Every repo read must degrade gracefully when `hasDb` is false.

## Method (the founder's UI method — mandatory)

1. Load the **impeccable** skill first; this is brand register (design IS
   the product on marketing surfaces) — read its brand reference.
2. Keep a running checklist file (`docs/UI-PAYR-2026-07-18.md`), numbered
   items, states `[ ]·[~]·[✓]·[✗]`. **Nothing is "done" without an
   after-screenshot re-checked against the item's intent.**
3. Verify headless on :3010 (no login needed — these are public routes):
   1440 and 390 widths, zero console errors, zero page-level horizontal
   overflow, reduced-motion fallbacks on any animation.
4. Small increments. If a design call feels like the founder's to make
   (route names in the nav, a fourth section, a form), flag it in the
   report — do not decide it.

## Seams + git

- Yours: the new route folders, new marketing components you create,
  `lib/repos/public-stats.ts`, your checklist + report.
- NOT yours: `components/rates/*` panels (another session's uncommitted
  work sits there — InsurerMark is importable, do not edit the file),
  anything under `app/(app)/` except zero-touch imports, `sql/`,
  `ops/`, shared shell files.
- Stage file-by-file, own hunks only (`git add <file>`, never `-A`).
  Commit locally with the house trailers. **Do not push.**

## Report + Linear

- Report to `docs/reports/2026-07-18-payr-pages.md`: routes shipped, section
  map per page, every live data read used (repo + table), components
  added/reused, screenshots taken, one-offs killed, flags for the founder.
- Linear: one NYS-100-style feature record in project **Leuk** when done
  (title, what shipped, verification evidence). If Linear MCP is missing in
  your session, write the drafted record into the report and flag it.

## Escalation

Flags, not decisions, for: route naming/nav placement if no existing
pattern fits · any aggregate that would need a new matview · a contact-form
want · anything that would touch another seat's files.

## Addendum (2026-07-18 evening) — founder reference material

`docs/reference/rate-intel-inspo/` holds 15 founder-curated screenshots
(Turquoise Health "Signal" et al.). LOOK AT THEM before designing. The
patterns they carry, distilled:

1. **Corpus-scale stats band** ("What's behind the answer": 200+ payers ·
   5,000+ hospitals · 350B+ rates) — our version uses OUR live numbers.
2. **Payer × code × negotiated-rate table with payer logos**, shown beside
   the raw file JSON — the "we turn their files into your answer" visual.
3. **Pipeline diagram**: sources (PAYER MRF · CLAIMS · MEDICARE ·
   REFERENCES · CONTRACTS) flowing into "clear rates" steps.
4. **Benchmark answer block**: question → comparison table (Your rate vs
   market, volume, opportunity labels) → key-insight bullets with dollar
   impact. (Marketing shows the SHAPE with real aggregate data; never
   invent a fake client.)
5. **%-of-Medicare framing** (service-line bars, % CMS chips on org price
   cards) — we hold `medicare_benchmark_ny`; a real %-of-Medicare moment is
   available and highly credible.
6. **Feature walkthrough rail**: Search rates / Filter by market / Search
   any code / Filter by service line — left step list, right live-looking
   mock.
7. **Org profile cards** (location · specialization · EIN · NPI) and
   **DRG/code spotlight cards** (code + payer badge + org price cards).
8. **Annotated natural-language query** (knowledge-graph entity chips over
   a benchmark question) — the "ask it in English" promise.
9. **GFE/estimate card** (patient-facing estimate composition) — patient
   lens; relevant to Find-my-plan framing, not a claim we make yet.

These are INSPIRATION for structure and moments — Leuk's visual system
(warm paper, watercolor, our tokens) still governs every pixel.
