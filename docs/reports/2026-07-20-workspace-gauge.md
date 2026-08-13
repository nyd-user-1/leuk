# TASK-WORKSPACE-GAUGE — fuel gauge + Agents/Reports/Rules merge

ui-agent · WORKSPACE seam · 2026-07-20 (drive ran into the early hours of 07-21)

Both parts shipped. Three local commits, nothing pushed, tree clean on my seam.
Screenshots in `docs/reports/assets/2026-07-20-workspace-gauge/`.

Two premise corrections and one deliberate deviation from the brief are below,
under **Flags** — read those before the verification table.

---

## Commits

| Commit | What |
| --- | --- |
| `6adaf6a` | Part 1 — the three-card fuel gauge, its server loader and read-only route |
| `e37bf63` | Part 2 — the three sections merged into one tabbed section; six files deleted, two added |
| `c24cf4f` | Follow-up — drop the live/modeled chip when there is no reading (found during empty-state verification) |

Files added: `lib/workspace-usage.ts`, `app/api/workspace/usage/route.ts`,
`app/(app)/workspace/usage-gauge.tsx`, `app/(app)/workspace/workbench.tsx`,
`app/(app)/workspace/workbench-grid.tsx`,
`app/api/insights/report/[date]/route.ts`.

Files deleted: `fleet.tsx`, `fleet-grid.tsx`, `agent-card.tsx`,
`rules-panel.tsx`, `rules-grid.tsx`, `night-report.tsx` — all six were the three
near-identical grids the merge collapses into one.

Files modified: `page.tsx`, `lib/repos/lead-reports.ts`, `lib/rules.ts`.

---

## Part 1 — the fuel gauge

![gauge at 1440](assets/2026-07-20-workspace-gauge/gauge-1440.png)

Three cards, placed immediately above "Coverage & growth" under the heading
**Fuel**. Each carries the identity icon + label top-left, the percentage
top-right, a grid of small rounded squares (one square = one whole percent, so
the grid *is* the reading), and a two-item footer. *(Batch 2 below re-proportions
this grid to 25 × 4 and swaps the per-card icons for the Claude mark — the
screenshots in this section predate that.)*

**Colour** comes from `docs/ops/PACING.md`'s own bands, on existing theme tokens
— `bg-success` under 60%, `bg-warning` 60–85%, `bg-danger` above, `bg-canvas`
for the unfilled track. No new palette. The fill animates from zero on mount and
is held at its final value under `prefers-reduced-motion` (verified — see below).

### What each card actually shows, and where the number comes from

**Card 1 · Window usage — LIVE.** `rate_limits.five_hour.used_percentage` from
`~/.claude/hq/statusline-snapshot.json`, verbatim. Footer-right is
`resets_at` × 1000 rendered as a clock; the file stores unix **seconds**, and
the conversion is at `lib/workspace-usage.ts:75`.

**Card 2 · Weekly usage — LIVE.** `rate_limits.seven_day`, same treatment, with
a weekday on the reset because a seven-day window doesn't reset today. The two
windows are **not** mixed: five-hour → the session card, seven-day → the week
card, mapped explicitly in `usageGauge()`.

**Card 3 · Fable usage — MODELED.** This is the one that needs a plain
statement, so here it is:

> The card shows **Fable's share of the trailing week's weighted work — 19% at
> the time of writing — derived, not measured.** It is not a percentage of any
> cap, and it is not what `/usage` would call "Current week (Fable)".

The derivation mirrors `~/Code/hq/lib/usage.ts` step for step:

1. Walk `~/.claude/projects/**/*.jsonl` for files touched in the trailing 7 days.
2. Keep one record per `requestId ?? message.id` — Claude Code writes a message's
   usage block several times while streaming, so summing every line triple-counts.
3. Weight the token shape: fresh input ×1, cache write ×1.25, cache read ×0.1,
   output ×5.
4. Weight again by model tier (`MODEL_WEIGHT`): opus 5.0, fable 5.0, mythos 5.0,
   sonnet 1.0, haiku 0.33.
5. Fable's weighted total ÷ everything's weighted total.

hq's caveat is carried across verbatim in spirit, in the code comment and in the
card's tooltip: **the tier multiplier is a calibration knob, not a measured
constant, and Fable's 5.0 is a placeholder** until a Fable-heavy block is
measured. The card wears a `· modeled` label; cards 1 and 2 wear `· live`.

![tooltip carrying the modeled caveat](assets/2026-07-20-workspace-gauge/tooltip.png)

I cross-checked the derivation against an independent throwaway script before
building anything: it returned Opus 80.3% / Fable 19.6% / Sonnet 0.1% over 70
files and 7,861 deduped records. The route returned 19.45% an hour later. The
two agree.

### Reading is server-side only

`~/.claude` is never touched from a browser. `lib/workspace-usage.ts` is a
server module; `/api/workspace/usage` is `requireRole("admin")` and returns
**rendered readings only** — never the raw snapshot, never a transcript line.
Unauthenticated it returns 401 (verified below).

The cold transcript walk costs ~1.6s over ~390MB, so files are cached by byte
offset exactly as hq does and only appended bytes are re-parsed. The gauge is
fetched from the client on mount rather than awaited during page render, so even
the cold walk never blocks `/workspace`. It re-polls once a minute.

---

## Part 2 — Agents, Reports, and Rules

| Agents | Reports | Rules |
| --- | --- | --- |
| ![](assets/2026-07-20-workspace-gauge/tab-agents-1440.png) | ![](assets/2026-07-20-workspace-gauge/tab-reports-1440.png) | ![](assets/2026-07-20-workspace-gauge/tab-rules-1440.png) |

Three sections became one section with three tabs — and, more to the point,
three near-identical grids became **one** component. "The night's work", the
fleet roster and the rules grid were all the same gesture (a markdown document
you open and edit), so `workbench-grid.tsx` renders one card type and a tab only
changes which documents it lists. That is why six files were deleted for two.

- **Reports tab** — every `lead_reports` row, newest first. I added
  `listLeadReports()` and `leadReport(date)` to `lib/repos/lead-reports.ts`
  (only `latestLeadReport()`/`LIMIT 1` existed), both `hasDb ? sql : []`, dates
  out as ISO strings through the existing `toReport()` normalizer I factored out
  of the old function. A new per-date endpoint
  `app/api/insights/report/[date]/route.ts` backs each card's DocSheet; the
  sibling route only served the latest. The sheet chrome reads **"Report"**.
- **Rules tab** — Design/Agent/Database collapsed into one list, each card
  carrying its family as a badge in the lower-left (teal / violet / blue).
  `RULE_TABS` became `RULE_CATEGORY` in `lib/rules.ts`.
- **Agents tab** — unchanged in content; the roster moved into `workbench.tsx`.
- **Every card** is a `LibraryCard` — fixed 166px height, `line-clamp-2` body,
  kebab top-right with "Copy as Markdown", whole card clickable.
- **The "Editable" badge is gone.** It lived at the old `night-report.tsx:36`;
  that file no longer exists. Zero survive anywhere on the page (asserted in the
  drive, not eyeballed).

### The component I reused for the card → document gesture

**`app/(app)/workspace/doc-sheet.tsx`, unchanged and unforked.** All three tabs
pass it an `endpoint` and a `label`; it already implemented the GET
`{title, subtitle, bodyMd}` / PATCH `{bodyMd}` contract, the editor, Save, and
its own "Copy as Markdown". Its diff in this tranche is zero lines.

![DocSheet opened from a Reports card](assets/2026-07-20-workspace-gauge/docsheet-1440.png)

---

## Verification

Headless Chromium, real login as `brendan@leuk.demo` (admin role — the whole
ecosystem column is admin-gated), against the running dev server on :3010. Every
row below is an assertion the drive printed, not an impression.

| Claim | Evidence | 1440 | 1280 |
| --- | --- | --- | --- |
| Gauge renders three cards | `GAUGE CARDS 3` | ✅ | ✅ |
| Gauge sits immediately above "Coverage & growth" | `H2 ORDER ["Summary","Fuel","Coverage & growth","Operations","Agents, Reports, and Rules","Data"]` | ✅ | ✅ |
| Agents tab = 3×2 + View more | `cards=6 viewMore=1` | ✅ | ✅ |
| Rules tab = 3×2 + View more | `cards=6 viewMore=1` | ✅ | ✅ |
| Reports tab = every row, newest first | `cards=2 viewMore=0` — **the database holds 2 rows**, see Flags | ✅ | ✅ |
| All cards in a tab equal height | `heights=[166]` (a one-element set of distinct heights) on all three tabs | ✅ | ✅ |
| Every card has the kebab | `kebabs=6 / 2 / 6`, one per card | ✅ | ✅ |
| Zero "Editable" badges | `EDITABLE_BADGES 0` (counts leaf nodes whose text is exactly "Editable") | ✅ | ✅ |
| A card click opens the DocSheet | `DOCSHEET: rise=1 saveBtn=1 label=true`, plus its innerText read back the report title, subtitle and body | ✅ | ✅ |
| No horizontal overflow | `docScroll: false` | ✅ | ✅ |
| One H1, from the shell | `H1S ["Workspace"]` | ✅ | ✅ |

**Route behaviour**, checked directly:

| Request | Result |
| --- | --- |
| `GET /api/workspace/usage` (admin) | 200, three rendered cards |
| `GET /api/workspace/usage` (no cookie) | 401 |
| `GET /api/insights/report/2026-07-17` | 200 |
| `GET /api/insights/report/2026-07-17` (no cookie) | 401 |
| `GET /api/insights/report/notadate` | 400 |
| `GET /api/insights/report/1999-01-01` | 404 |
| `PATCH` with no `bodyMd` | 400 |
| `PATCH` with the body round-tripped unchanged | 200, and a re-GET returned the same 5,671 characters |

**Empty state.** I did not assert this one — I forced it. Pointing
`CLAUDE_HOME` at a directory that does not exist and letting HMR pick it up, all
three cards fall back to an em-dash, an empty grid and a plain reason. This is
also how I caught the chip bug fixed in `c24cf4f`: before the fix, cards 1 and 2
still displayed a green `LIVE` chip over the em-dash, claiming a measurement they
were simultaneously saying they didn't have.

![honest empty state](assets/2026-07-20-workspace-gauge/gauge-empty-state.png)

**Reduced motion.** Driven with `reducedMotion: "reduce"`: the cards render at
their final values (18% / 63% / 19%) rather than sticking at zero.

![reduced motion](assets/2026-07-20-workspace-gauge/gauge-reduced-motion.png)

`npx tsc --noEmit` is clean.

---

## Flags

**1. Premise correction — "3×2 then View more" cannot be shown on the Reports
tab, because `lead_reports` has two rows.** The brief's verification asks for
"exactly 3×2 plus View more" on every tab. Agents (10 rules → 6 + View more) and
Rules (14 → 6 + View more) demonstrate it; Reports shows 2 because there are 2,
and they run through the identical `slice(0, 6)` / `length > 6` code path. I did
not seed rows to make a screenshot look right.

**2. Premise correction — "rename Night report to Report" is done everywhere the
UI owns the string, but the card titles still read "Night report — …".** Those
titles are `lead_reports.title` values written by the lead session; they are
content, not chrome. The tab is "Reports", the sheet chrome is "Report". I
declined to rewrite founder-authored data at render time — stripping the prefix
would leave cards titled "the automation night" and "July 17". If you want the
titles themselves changed, that is a data edit, and it is yours to make.

**3. Deliberate deviation — card 3's squares do not use the healthy/warning/
depleted ramp.** The brief says to colour filled squares by state. A share of a
model mix has no cap, so "85% Fable" is not "nearly out" — ramping it to red
would assert danger about a number that cannot be dangerous. Card 3 fills teal
(`bg-primary`), which also gives the row a visual tell that its third number is a
different kind of thing from the first two. Cards 1 and 2 use the bands as
specified. Reversible in one line if you disagree.

**4. Judgment call — the Fable card shows a share, not a window percentage.**
The alternative I considered and rejected: multiply the live 62–63% weekly figure
by the Fable share to attribute "≈12% of the weekly window is Fable". That is
closer to what `/usage` displays, but it compounds a live number with an
uncalibrated multiplier *and* assumes the rate limiter apportions its window in
proportion to hq's cost model — an assumption nothing on disk supports. hq's own
`weekOpus` meter takes a version of that path and ships `calibrated: false`
against a limit its comments admit under-reports. A share is directly derivable
and I can state its method exactly, so that is what the card shows. Say the word
and the attribution is a small change.

**5. Judgment call — Rules stay in family order, so the first six are all
Design.** Grouped order plus the badge is the strongest reading of "so the
grouping survives the merge", and Agent/Database rules are one "View more" away.
The alternative is round-robin interleaving so all three badges appear in the
first two rows. Flagging because the first impression of the merged tab is
monochrome.

**6. I bumped one row's `updated_at`.** Verifying the new PATCH endpoint meant
writing to the live database, so I wrote the row's own body back to it unchanged
— content is byte-identical (re-GET confirmed, 5,671 chars), but
`lead_reports.updated_at` for `2026-07-17` now reads today. Nothing renders that
column any more (the card shows `report_date`), so there is no visible effect.
Disclosing it because the rule is to disclose it.

**7. Not a defect, but you'll see it in any overflow probe.** `LibraryCard`'s
header carries `-mr-1.5` to optically inset the kebab against the card edge, so
that row measures 6px wider than its container. Same for the Summary card's
header and the Operations table's duration column — all pre-existing, all
intentional, all clipped by ancestors. The document does not scroll horizontally
at either width.

---

## Design-system position

**No new primitive.** The gauge is `Card` + `Icon` + `Tooltip` + `EcoSection`
plus a grid of spans; the merged section is `Tabs` + `LibraryCard` + `Tag` +
`KebabMenu` + `MenuItem` + `Button` + the existing `DocSheet`. Nothing was added
to `components/ui/*` and nothing there was modified, so `/design-system` and the
Obsidian Component Catalog need no update from this tranche.

One thing worth promoting later, not now: `workbench-grid.tsx` is a general
"gallery of documents, tabbed, 3×2 + View more" that already serves three
different collections. If a fourth appears, that is the moment to lift it into
the kit rather than copy it.

**Types are mirrored, not imported, in `usage-gauge.tsx`.** hq documents a
Turbopack bug where even a bare `import type` from a module that imports
`node:fs` pulls fs into the client bundle
(`~/Code/hq/app/ui/usage-panel.tsx:8`). I followed their precedent rather than
find out the hard way; the route's JSON is the contract and the comment says so.

---

## Not done / suggested next

- The gauge reads only the primary account (`~/.claude`). `PACING.md` records
  that accounts 2 and 3 are proxy-only because `statusline-command.sh` writes to
  a hardcoded `$HOME/.claude/hq`. A per-account fleet row is a real feature and
  wants that fix first — it is outside `ops/` and outside my seam.
- The Fable tier multiplier stays uncalibrated until someone measures a
  Fable-heavy block against the real `/usage` screen. Until then the card's
  `modeled` label is doing necessary work.

Report committed. Not pushed. Stopping here.

---

# Batch 2 — gauge polish, Claude mark, Insurers, Data rework

Same seam, continuing after the report above. Four items, all shipped, four
local commits, nothing pushed. Screenshots prefixed `b2-` in the same assets
directory.

Three premise corrections are in **Flags (batch 2)** — two of them change what
the Data tabs say, so read those before the numbers.

## Commits

| Commit | What |
| --- | --- |
| `8c454d3` | Item 1 + 2 — 25×4 gauge grid; Claude mark replaces the three per-card icons |
| `8378fa4` | Item 3 — Insurers section, 48 real rows, three tabs |
| `1e0c00b` | Item 4 — Data reworked into 7 tabs over the live schema |

(`2619369`, dropping the "Data dictionary" link from the Data header, landed in
this tree from another session mid-batch; my page.tsx edits sit on top of it.)

## 1 · Gauge grid — 25 × 4

![gauge](assets/2026-07-20-workspace-gauge/b2-gauge-1440.png)

Wider and shorter, and still one square per whole percent — asserted, not
eyeballed: `GAUGE GRID {"cols":25,"squares":100}` from the computed
`grid-template-columns`, at both widths.

## 2 · The Claude mark

`250px_Claude_AI_symbol.svg.webp` moved off the repo root to
**`public/brand/claude-mark.webp`**. This repo had no `public/` directory before
now — marketing imagery lives in the blob store — so that directory is new.

**No vector is needed, and I measured rather than guessed.** The mark renders in
an 18px box; at DPR 3 that is 54 device pixels drawn from a 250px source, so it
is a downscale in every realistic case. Rendered at 3× it is clean:

![the mark at 3x](assets/2026-07-20-workspace-gauge/b2-claude-mark-3x.png)

All three cards carry it (`GAUGE ICONS 3`) — the founder's read is right that
one identity beats three, since every reading on that row is Claude's own
consumption.

## 3 · Insurers

![insurers](assets/2026-07-20-workspace-gauge/b2-ins-insurers.png)

Last section on the page, 48 real rows from `insurers`, three tabs, 3×2 + View
more. Card anatomy: monogram mark + name, the registry's own note as the
description, the metadata that row actually has, one action at the foot.

**Where every value comes from.** `insurers.name` / `kind` / `naic_group_code` /
`notes`; parent name self-joined on `parent_id`; network count from `networks`;
licensed-entity count from `insurer_companies`; rate rows, providers and
priced-date summed from the **`payer_rate_totals` matview** through
`insurer_aliases`. Nothing is scored, ranked or estimated.

**Thin rows show thin.** 31 of 48 carry rates, 16 carry networks, 20 carry a
NAIC group, 27 carry a note. A row with none of that gets a derived one-liner
from the two columns we always have ("Carrier under Elevance Health") and a
`Registry only` foot — never filler prose.

**A measurement worth keeping:** the obvious query,
`SELECT DISTINCT payer FROM provider_rate_signals`, takes **27 seconds** against
13.7M rows. Through the matview the whole board is **~183ms**. I tried the
obvious one first and rejected it on the clock.

No carrier logos exist in this repo, so the mark slot is a monogram. A borrowed
logo would be the dishonest option.

## 4 · Data — seven tabs

| Objects | Indexes | Functions |
| --- | --- | --- |
| ![](assets/2026-07-20-workspace-gauge/b2-data-objects.png) | ![](assets/2026-07-20-workspace-gauge/b2-data-indexes.png) | ![](assets/2026-07-20-workspace-gauge/b2-data-functions.png) |

- Rich-text links **removed** — asserted per tab as `links=0` inside every card.
- Uniform card size — `h=[196] w=[373]` at 1440, `w=[320]` at 1280: one distinct
  height and one distinct width across the grid. Body clamps at two lines.
- Own tab rail + collapse, matching the other sections.
- **"Who exists (foundation)" → "Objects"** in `lib/table-atlas.mjs`.
- 3×2 + View more bottom-left.
- Six live-schema tabs, populated by introspection at page load.

**Cards vs tables, and why.** Objects is cards: every row carries a written
meaning, a count and a badge — that is a card's job. The six schema tabs are
tables: uniform name/detail/metric triples with nothing to describe, up to 237
of them. Cards there would be forty clicks of "View more" to read a list.

### What is actually in the database

| Tab | Count | Note |
| --- | --- | --- |
| Tables | 76 | row estimates from `reltuples`, carrying `+` |
| Views | 18 | 6 plain + 12 materialized, distinguished in a column |
| Indexes | 237 | sized, largest first — `provider_rate_signals` alone holds a 4,339 MB index |
| Stored procedures & functions | **2** | see the correction below |
| Triggers | **19** | see the correction below |
| Sequences | 1 | `audit_events_id_seq` |

## Verification (batch 2)

Headless Chromium, admin login, both widths, printed assertions:

| Claim | Evidence | 1440 | 1280 |
| --- | --- | --- | --- |
| Gauge is 25 × 4 = 100 squares | computed `cols:25, squares:100` | ✅ | ✅ |
| Claude mark on all three cards | `GAUGE ICONS 3` (matched on `img[src="/brand/claude-mark.webp"]`) | ✅ | ✅ |
| Insurers is last on the page | `H2 ORDER [… "Data","Insurers"]` | ✅ | ✅ |
| Insurers 3×2 + View more | `INS/Insurers: cards=6 vm=1` | ✅ | ✅ |
| Insurer cards uniform | `h=[228] w=[373]` / `w=[320]` | ✅ | ✅ |
| Networks tabs visible + honestly empty | `cards=0`, EmptyState quoting the 72 real rows | ✅ | ✅ |
| Data: no links in cards | `links=0` on every tab | ✅ | ✅ |
| Data: Objects uniform + 3×2 + View more | `cards=6 vm=1 h=[196] w=[373]` | ✅ | ✅ |
| Six schema tabs populated live | `rows=10/10/10/2/10/1` (paged) | ✅ | ✅ |
| Ten rows a page | `rows=10` where the set is larger | ✅ | ✅ |
| Workbench still intact | `WB/Agents=6 Reports=2 Rules=6` | ✅ | ✅ |
| Zero "Editable" badges | `EDITABLE_BADGES 0` | ✅ | ✅ |
| No horizontal scroll | `DOC H-SCROLL false` | ✅ | ✅ |
| One H1 | `H1S ["Workspace"]` | ✅ | ✅ |

`npx tsc --noEmit` clean. First paint 647–1,565ms with the two new query sets in
the page's `Promise.all`.

**The empty state was forced, not asserted.** Pointing the sequences query at a
schema that does not exist and letting HMR pick it up:

![forced empty state](assets/2026-07-20-workspace-gauge/b2-data-empty-state.png)

## Flags (batch 2)

**8. Premise correction — we DO have triggers: 19 of them.** The brief expected
none. `set_updated_at()` is wired onto 19 tables (appointments, clients,
invoices, forms, files, …). The tab lists them with the table and the function
each one calls.

**9. Premise correction — "69 stored procedures" is an illusion; we wrote 2.**
`information_schema.routines` reports 69 in `public`, but 67 belong to
extensions: pgcrypto (36), pg_trgm (31), pg_session_jwt (8), plpgsql (3). The
tab filters them out via `pg_depend` and reports **`refresh_organizations`** and
**`set_updated_at`** — then names the other 67 in its footer, so the gap between
the two numbers is explained on the surface rather than discovered later.

**10. Defect I introduced and fixed in the same session.** Rendering all 237
indexes made the Data section **~9,600px tall** and swallowed the page. The
schema tables now page at ten rows (the table standard's number). Worth
recording because the first version passed every count assertion while being
unusable — the assertions did not catch it, looking at the screenshot did.

**11. Tab 2 of Insurers could be populated today.** I built it as the briefed
placeholder, but `networks` holds **72 rows** and `payer_network_map` holds
**1,133**. Rather than ship a blank that implies we have nothing, the
placeholder states those counts — "72 rows already sit in the networks table —
this surface for them is the missing piece, not the data." Say the word and
tab 2 becomes real; the repo function is one query.

**12. Same monochrome-first-page effect as Rules.** The Objects tab's first six
cards all carry the `Objects` badge, because the curated groups are flattened in
order. Consistent with the choice I made for Rules in batch 1, and the same
alternative applies (interleave by group). Flagging it once for both.

**13. `docs/data/DATABASE.md` still says "Who exists (foundation)".** That file
is generated by `scripts/db-atlas.mjs` and owned by docs-agent, so I did not
regenerate it. It wants a rerun to pick up the rename.

**14. Data-section table standard, stated plainly.** The six schema tables ship
the full v2 anatomy — title + count pill far left, search right, sortable
columns, source + freshness footer, ten rows. They page **client-side**: the
largest set is 237 rows, and the server-pagination half of the lightning stack
is for the >10k tables. Saying so explicitly because the standing rule reads as
unconditional.

## Design-system position (batch 2)

**Still no new primitive.** Insurers is `Card` + `Tabs` + `TextLink` +
`EmptyState` + `Button`; Data is `Tabs` + `DataTable` + `SearchInput` +
`Pagination` + `EmptyState` + `Card` + `Badge` + `Tag` + the existing `CopyChip`
and `SchemaTree`. `components/ui/*` is untouched across both batches.

`observatory.tsx` is deleted — `data-panel.tsx` supersedes it, carrying its card
logic forward rather than running two inventory renderers.

Report appended. Not pushed. Stopping here.

---

# Batch 3 — insurer marks, and the card-link rule written down

One commit, `6e7f455`. Not pushed.

## 1 · The links are gone, and the rule is recorded

The founder's correction is fair and I should say so plainly: I removed the
`powers` links from the Data cards earlier in this same session, then put the
identical pattern straight back into the Insurers cards I built an hour later.
Deleting them again would have been the same non-fix.

So the rule is now written down in the two places the fleet actually reads:

- **`docs/rules/no-card-links.md`** — the full rule. Why it exists (two targets
  in one object, a ~60px hit area inside a 370px surface, a footer that changes
  shape row to row), how to apply it (`onOpen` on the card, or `KebabMenu` for
  multiple actions, plain text or a `Tag` for identifiers and categories), and
  the scope: `TextLink` stays correct in prose, table cells and section asides.
  It records that the instruction was given twice, and why that made it a rule.
- **`lib/rules.ts`** — a new `no-card-links` design rule, so it renders as a card
  in the Rules tab and opens in the DocSheet like every other rule. Verified:
  `GET /api/rules/no-card-links` → 200 with the doc body.

The insurer card footer is now the slug in mono opposite a kind `Tag` — the same
footer the Data cards use, so the two card walls in the ecosystem column match.

## 2 · Real marks — 9 of 48

![insurers with real marks](assets/2026-07-20-workspace-gauge/b3-insurers-1440.png)

Loaded from the same public blob store as `components/site/insurer-strip.tsx`.
**Mapped by our `insurers.id`, never by display name.**

| Our slug | Mark | Note |
| --- | --- | --- |
| `uhc` | united.avif | |
| `aetna` | aetna.avif | |
| `anthem-empire` | anthem.avif | the Empire card, per the brief |
| `cigna` | cigna.avif | |
| `carelon` | carelon.avif | administrator; the asset is the Behavioral Health lockup |
| `oscar` | optum-oscar.avif | **see the flag below** |
| `cdphp` | cdphp.png | |
| `humana` | humana.avif | |
| `healthfirst` | healthfirst.svg | Healthfirst **NY** |

**The 39 that fall back to initials**, so nobody assumes coverage:
`anthem-ca`, `anthem-co`, `anthem-mo`, `bcbs-al`, `bcbs-az`, `bcbs-ma`,
`bcbs-mi`, `bcbs-mn`, `bcbs-pr`, `bcbs-tn`, `blue-shield-ca`, `carefirst`,
`centene`, `cigna-group`, `cvs-health`, `elevance`, `emblemhealth`, `evernorth`,
`excellus`, `fidelis`, `florida-blue`, `health-first-fl`, `highmark-health`,
`highmark-ny`, `independent-health`, `lacare`, `lifetime-healthcare`,
`magnacare`, `metroplus`, `molina`, `multiplan`, `mvp`, `optum`, `oxford`,
`regence-id`, `regence-or`, `regence-wa`, `uhg`, `univera`.

Three of those are load-bearing and were left deliberately:

- **`health-first-fl` keeps initials.** It is the Rockledge, Florida
  health-system plan, not Healthfirst NY. Giving it the Healthfirst mark would
  collapse exactly the distinction the registry note exists to preserve.
- **`oxford` keeps initials.** It is UHG's NY commercial brand, not
  UnitedHealthcare; there is no Oxford mark in the store.
- **`optum` keeps initials.** The only Optum-ish asset is a co-brand (below),
  not a plain Optum mark.

`bcbs.avif` (Massachusetts), `horizon.avif` (New Jersey) and
`optum-unitedhealth.avif` (a colored lockup) are in the store and are not used
here, same as on the strip.

## 3 · Optical sizing

![all nine marks at 3x in their real slots](assets/2026-07-20-workspace-gauge/b3-marks-optical.png)

The strip's own tuning carried across (base 48 → cdphp 32, humana 24,
healthfirst 20), rescaled to our 32px box. Then two nudges made by rendering all
nine at DPR 3 in their actual slots and looking at them side by side:

- **`optum-oscar` 32 → 28px.** A two-line lockup reads heavier than the single
  wordmarks beside it at the same box height.
- **`healthfirst` 14 → 16px.** The pure ratio puts it at ~13px, but its second
  line is a fine-print tagline — height without visual weight — so it read light
  rather than equal.

## Verification (batch 3)

All 48 cards exercised (View more expanded), both widths:

| Claim | Evidence | 1440 | 1280 |
| --- | --- | --- | --- |
| Zero inline links in any card in the section | `inlineLinks=0` across all 48 | ✅ | ✅ |
| Logos load, none broken | `LOGOS RENDERED: 9`, each `complete && naturalWidth > 0`; `FAILED REQUESTS: none` (network listener on `logos/insurance`) | ✅ | ✅ |
| Fallback initials still render | `FALLBACK INITIALS: 39` — and `9 + 39 = 48 of 48`, so no card is markless | ✅ | ✅ |
| No layout shift as images arrive | the mark slot is a fixed `h-9 w-[72px]` box whether it holds a logo or a monogram | ✅ | ✅ |
| Card heights uniform | `heights=[228]` — one distinct height across all 48 | ✅ | ✅ |
| Card widths uniform | `widths=[373]` / `[320]` | ✅ | ✅ |
| Rest of the page unaffected | `H2 ORDER` unchanged, `DATA/Objects links=0`, `EDITABLE_BADGES 0`, `DOC H-SCROLL false` | ✅ | ✅ |

`npx tsc --noEmit` clean. No page errors.

## Flags (batch 3)

**15. `optum-oscar.avif` is a co-brand, not an Oscar mark.** I downloaded and
looked at all nine assets before mapping any of them, and this one reads
**"Optum ᵛⁱᵃ oscar"** — a product lockup, not a plain Oscar Health logo. I used
it on the `oscar` card because it matches how our Oscar data actually arrives
(the payer label is `Oscar Health (Optum BH)`, and the registry note records the
Optum behavioral-health arrangement). But it is a co-brand standing in for a
carrier, so: if you want a plain Oscar mark, that is a new asset, and I did not
put this one on the `optum` card either.

**16. `anthem-ca`, `anthem-co` and `anthem-mo` are genuinely Anthem and could
take the same mark.** The brief said to map by slug and named `anthem-empire`,
so I mapped only that one rather than extending the pattern myself. Say the word
and it is three lines — but it is your call whether one Anthem mark should
appear on four cards.

**17. The marks are hot-linked to the blob store, not bundled.** Same as the
marketing strip. That store is public and these are `<img>` loads with no token,
so this is not the Production upload problem recorded in memory — but it does
mean the section needs network access to that host to show marks, and falls back
to nothing (not initials) if the host is unreachable, since the fallback is
keyed on whether we *have* a mark, not on whether it loaded.

Report appended. Not pushed. Stopping here.

---

# Batch 4 — insurer card ordering

One commit, `8326336`. Not pushed.

![the branded block above the fold](assets/2026-07-20-workspace-gauge/b4-insurers-ordered-1440.png)

## Logo coverage across the 48

| Block | Count | Share |
| --- | --- | --- |
| Has a real mark | **9** | 19% |
| Falls back to initials | **39** | 81% |

Block 1, A–Z: Aetna · Anthem Blue Cross Blue Shield (Empire) · Carelon
Behavioral Health · CDPHP · Cigna · Healthfirst · Humana · Oscar Health ·
UnitedHealthcare.

## How the split is derived

From the **same `LOGOS` lookup the card renders from** — one expression, no
parallel list:

```ts
const rank = (LOGOS[a.id] ? 0 : 1) - (LOGOS[b.id] ? 0 : 1);
return rank !== 0 ? rank : a.name.localeCompare(b.name, "en");
```

So the order cannot rot the way a hand-maintained one would: add a mark and that
insurer moves into block 1 on the next render; rename an insurer and only its
alphabetical position changes; delete a mark and it drops back. There is no
second list that can disagree with the first.

**The repo's `ORDER BY` dropped to plain `i.name`.** It previously sorted by rate
rows, which the component now overrides — leaving that in place would have been
a lie in the SQL about what determines the order. Whether a mark resolves is a UI
fact, and `lib/repos/insurers-board.ts` has no business knowing it.

No section headers or dividers between the blocks, as briefed.

## The fold consequence — chosen, not stumbled into

Worth stating plainly, since it is exactly the kind of thing that looks like an
accident later: **9 marks against a 6-card fold means every card above "View
more" is branded, and every initials-only insurer is behind it.**

`ABOVE FOLD: 6 cards; branded = 6` at both widths.

I am taking that as intended — best foot forward on a founder-facing surface,
and the initials block is one click away, not hidden. Two things follow that are
worth knowing:

- The fold stops being all-branded the moment coverage drops below 6 marks. It
  cannot silently show a half-branded fold *and* a stale order, because both come
  off the same lookup.
- The first six cards are no longer the six with the most rate data. Aetna,
  Anthem-Empire, CDPHP and Oscar carry rates, but Carelon and Healthfirst are
  there on brand rather than on substance, while `health-first-fl` (686.6K rate
  rows) and `oxford` (399.1K) now sit behind "View more". If the fold's job is to
  show the richest data rather than the strongest brands, this ordering is the
  wrong one and the previous rate-rows sort was right — say so and it reverts to
  a two-line change.

## Verification (batch 4)

All 48 cards expanded, both widths, printed assertions:

| Claim | Evidence | 1440 | 1280 |
| --- | --- | --- | --- |
| 9 marked / 39 unmarked | `TOTAL 48 \| with mark 9 \| without 39` | ✅ | ✅ |
| The two blocks are contiguous | `BLOCKS CONTIGUOUS: true (last marked idx 8, first unmarked idx 9)` | ✅ | ✅ |
| Block 1 is A–Z | `BLOCK 1 A-Z: true` (pairwise `localeCompare` over rendered names) | ✅ | ✅ |
| Block 2 is A–Z | `BLOCK 2 A-Z: true` | ✅ | ✅ |
| Every above-fold card is branded | `ABOVE FOLD: 6 cards; branded = 6` | ✅ | ✅ |
| Sorted by display name, not slug | block 2 opens `anthem-co, anthem-mo, anthem-ca` — Colorado, Missouri, California, which is A–Z on *name* and not on slug | ✅ | ✅ |
| Card heights still uniform | `HEIGHTS [228]` | ✅ | ✅ |
| Still zero inline links | `inline links 0` | ✅ | ✅ |
| Rest of the page unaffected | `H2 ORDER` unchanged, `EDITABLE_BADGES 0`, `DOC H-SCROLL false` | ✅ | ✅ |

`npx tsc --noEmit` clean.

Report appended. Not pushed. Stopping here.

---

# Batch 5 — the pagination correction, and the network bake-off

Two commits: `1257de5` (correction), `0f92559` (bake-off). Not pushed.

## Part A — tables scroll, they do not page

**I shipped the violation, so the fix starts with the rule.** `docs/rules/table-standard.md` plus a `table-standard` entry in `lib/rules.ts` now separate the two things that were conflated:

- **Presentation, always** — ten rows in a height-bounded region with a sticky header, scroll for the rest. No page numbers, no arrows, no "Page 3 of 8".
- **Fetching, only when the row count warrants it** — server paging exists so a browser never receives 100k rows; when needed it feeds the scroll via a sentinel, never a control. Below a few thousand rows, no paging at all.

There was no table-standard rule in `lib/rules.ts` to update — it lived only in memory and in the design-system prose. It exists now.

### What I changed

| Surface | Before | After |
| --- | --- | --- |
| Data → Tables (76) | `Page 1 of 8` pager | 10 visible, scrolls |
| Data → Views (18) | pager | 10 visible, scrolls |
| Data → Indexes (237) | pager | 10 visible, scrolls to all 237 |
| Data → Triggers (19) | pager | 10 visible, scrolls |
| Data → Functions (2) | 512px box, mostly empty | sizes to 2 rows (230px) |
| Data → Sequences (1) | 512px box | sizes to 1 row (190px) |

The height is a **max**, not a fixed value, so short tables stop at their content instead of reserving an empty box. `lazy` grows the DOM in batches as the reader scrolls — a rendering optimization inside the scroll, not paging.

Measured: `visibleRows=10` on every table over ten rows; scrolling Indexes to the end took the DOM from 101 to **237 of 237**; the header stayed pinned 66px from the scroller top (the toolbar height) throughout.

### What was already correct

- **`app/(app)/directory/directory-client.tsx`** — already server-paginated with a scroll sentinel, and its own comment already said "no `<Pagination>`". This is the reference implementation and the rule doc now points at it.
- Every other `DataTable` in the repo (28 files) — none used `Pagination`.

### What I left alone, and why

- **`app/programs/family/[slug]/page.tsx` + `components/site/program-controls.tsx`** — the public marketing program listing. It is not a table, it is a URL-paged listing of cards where each page is a separately crawlable document. That is what the primitive is for, and the rule doc says so explicitly.
- The **`Pagination` primitive stays in the kit** for that case. Its design-system catalog card now reads "URL-paged PUBLIC listings only — never under a table in the app", so the next builder does not reach for it.

## Part B — Networks and the bake-off

![the Networks roster](assets/2026-07-20-workspace-gauge/b5-networks.png)

### What the data actually is

| | Count |
| --- | --- |
| Networks (roster) | 72 |
| Payer-reported labels, total | **1,563** |
| — mapped (alias crosswalk) | 89 |
| — ambiguous (one label naming several networks) | 269 |
| — unmapped | 1,205 |

### The architecture decision, and the measurement behind it

`network_unmapped_labels` is a **VIEW**, and its MRF half is `GROUP BY payer, plan_or_network` over `provider_rate_signals` — 13.7M rows. It costs **~4.6s every call** and no index changes that.

So the crosswalk is **not** on the page-render path. It sits behind `/api/workspace/networks`, fetched when one of the two tabs is first opened, memoized in-process for five minutes (the data only moves on the nightly harvest). Warm `/workspace` load stayed at **~780ms** with both tabs built — asserted on every drive, since a 4.6s regression in page load would be the easy mistake here.

**The real fix is a matview**, exactly like `payer_rate_totals`. That lives in `sql/` and is ops/quality-agent's seam, so it is flagged, not built.

### The three options

| Option 1 · Status-grouped monitor | Option 2 · Directory table | Option 3 · Record detail |
| --- | --- | --- |
| ![](assets/2026-07-20-workspace-gauge/b5-option1.png) | ![](assets/2026-07-20-workspace-gauge/b5-option2.png) | ![](assets/2026-07-20-workspace-gauge/b5-option3.png) |

All three consume **one fetch**, handed down from the parent — the same 1,563 rows, the same object, no option given an easier slice.

### Which I would pick: **Option 3, with Option 1's chips grafted on**

Option 3 is the only one that answers the question the crosswalk actually raises. 1,205 unmapped rows is not a list you work through — it is a list you need to understand the shape of, and "how we know" is the column that does that: `alias-matched` (89), `rule-bucketed · oos-state` (355), `rule-bucketed · medicare` (320), `unresolved` (528). It is also the only option where the 37-part labels are legible rather than merely present — expanding prints a numbered list of all 20/37 parts instead of a wrapped 950-character wall.

Option 1 is the better *shell*: its filter-count chips read the distribution at a glance in a way Option 3's stats card states but does not let you act on. Its selection + bulk bar is speculative until there is a bulk action to run, and there isn't one yet.

Option 2 is the weakest here and it is worth saying why, since it is the most conventional: six columns of a flat list is the right shape for a set you *scan*, and this set is one you *triage*. Its own best column — the insurer mark — is decorative in a table where 218 of 269 ambiguous rows are the same insurer.

**Networks roster: built in Option 2's shape**, because that one genuinely is a flat scan — 72 rows, one row per network, name/insurer/administrator/kind/label-count. Different question, different shape.

## Verification (batch 5)

| Claim | Evidence | 1440 | 1280 |
| --- | --- | --- | --- |
| No pager survives anywhere | `pagers=0`, `pageLabel=none` across all Data tabs and all 7 bake-off tables | ✅ | ✅ |
| Ten rows visible, scrolls | `visibleRows=10` on every table over ten; Indexes 101 → **237 of 237** on scroll | ✅ | ✅ |
| Short tables size to content | Functions 230px, Sequences 190px — no empty box | ✅ | ✅ |
| Crosswalk is off the page-render path | warm page ready **789ms / 733ms** with both tabs built | ✅ | ✅ |
| All three options render | `["Option 1 · Status-grouped monitor","Option 2 · Directory table","Option 3 · Record detail"]` | ✅ | ✅ |
| All three share one fetch | one `/api/workspace/networks` call; `data` passed to all three | ✅ | ✅ |
| Every table names its source | `footers naming source table: 7` (7 of 7) | ✅ | ✅ |
| Ambiguous labels not truncated into uselessness | longest cell text **994 chars**; Option 3 expand rendered **20 of 20** parts | ✅ | ✅ |
| Networks roster real | `domRows=72` | ✅ | ✅ |
| No horizontal page scroll | `DOC H-SCROLL false` | ✅ | ✅ |
| Rest of page unaffected | `H2 ORDER` unchanged, `EDITABLE_BADGES 0`, Data tabs intact | ✅ | ✅ |

`npx tsc --noEmit` clean, no page errors.

## Flags (batch 5)

**18. Two defects I only caught by looking at pixels.** Both passed every count assertion. An unbounded label column pushed Option 3's provenance column — the entire reason that option exists — off the right edge of its own table; and Option 2's `Bucketed` column clipped on the Mapped group, whose network names are longest. Both columns are bounded now and all columns fit at 1440. Recording it because it is the second time this session that assertions went green on an unusable surface.

**19. `network_unmapped_labels` wants to be a matview.** 4.6s, every call, from a `GROUP BY` over 13.7M rows. Everything above is a workaround. Same shape as the `payer_rate_totals` fix that already exists — quality/ops seam, sized and ready.

**20. Premise correction — the semicolon labels are mostly Anthem California, not Empire.** The brief calls them "the semicolon-joined Empire labels". By payer: **Anthem Blue Cross California 218**, Anthem Missouri 27, **Empire 17**, Anthem Colorado 6, BCBS Alabama 1. Empire's are the ones you have looked at, but 81% of the problem is California. Worst case is 37 networks in a single 950-character label.

**21. "Hand-curated" provenance does not exist in the data.** Option 3 was briefed to show three provenance kinds. The rules present are `alias` (89), `pattern:*` (946) and `unresolved` (528) — there is no hand-curation flag on any row. I show the three that exist rather than a chip that never appears. If hand-curation should be distinguishable, that is a column the crosswalk does not currently carry.

**22. Health First FL and Healthfirst NY stay distinct** — the insurer resolution joins through `insurer_aliases`/`insurers.id`, never a name match, so nothing collapses them. 1,561 of 1,563 rows resolved to an insurer; the 2 that did not show "—" rather than a guess.

**23. At 1280 the widest tables scroll internally.** Option 2 loses `Bucketed` and Option 3 loses `Rows` from the visible box; both scroll horizontally *inside* the table, and the page body never does. Within the table-overflow rule, but worth knowing before judging the options at a narrow window — judge them at 1440.

**24. Options 1 and 2 are ~1,664px tall each** because "all statuses" stacks three grouped tables. Narrowing with a chip or a status filter drops them to one. Inherent to grouped-by-status; noting it since it is most of the bake-off page's length.

Report appended. Not pushed. Stopping here.
