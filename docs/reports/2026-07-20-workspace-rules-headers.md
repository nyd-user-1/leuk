# UI batch #2 — Rules grid, workspace labels, the naked H1

**Date:** 2026-07-20 · **Agent:** ui · **Branch:** main (local commits only, nothing pushed)

Commits:

- `d38ae89` feat(workspace): Rules become documents — uniform grid, dates, DocSheet on click

- `8d75fab` refactor(workspace): section labels to the shortest honest noun — **contains five files that are not mine, see "Commit contamination" below**

- `9d8bc28` fix(shell): the page H1 stands alone — no leading icon

Screenshots: `docs/reports/assets/2026-07-20-workspace-rules-headers/`

> **Commit contamination — `8d75fab`.** That commit's message describes two
> one-line label changes. It actually contains seven files: my two, plus five
> belonging to `ehr-surfaces` (`app/(app)/clients/[id]/files-tab.tsx` at +305
> lines, `app/portal/page.tsx`, `app/portal/records/page.tsx`,
> `app/portal/records/records-list.tsx`, `components/records/client-record.tsx`).
> Nothing is broken and history was not rewritten, but anyone reading that commit
> message will be misled about its contents — the `files-tab.tsx` work in
> particular has no record of its own.
>
> **Cause.** I staged my two files and ran `git diff --cached --name-only` in one
> shell call; it showed exactly my two files. I then ran `git commit` in a *later*
> shell call. Between the two calls `ehr-surfaces` staged their work into the
> index, which is shared across every agent in this tree. My verification was
> accurate when I ran it and stale by the time I committed.
>
> **Fix, adopted from here on.** Commit with an explicit pathspec every time, so
> only my paths can land regardless of what else is staged:
> `git commit -m "…" -- path/one path/two`. Checking
> `git diff --cached --name-only` first is still worth doing, but the pathspec is
> the thing that actually prevents this — a check and a commit are two moments,
> and a shared index can change between them.
>
> The other three commits in this batch (`d38ae89`, `9d8bc28`, `3ccd147`) were
> verified after the fact and contain only my files.

---

## Reused-component statement

**The DocSheet was reused, not rebuilt or forked.** A rule card opens
`app/(app)/workspace/doc-sheet.tsx` — the exact component the fleet's agent cards
and the reports table already use — with `endpoint="/api/rules/<id>"` and
`label="Rule"`. Not one line of that file changed. The gesture is now identical
across agents, reports and rules: dark window chrome, title + slug, editable
markdown body, Save, kebab with "Copy as Markdown".

**No new primitives.** The rules grid moved *onto* an existing one: `LibraryCard`
(`components/ui/library-card.tsx`), the same primitive `/library`,
`/portal/records`, `/portal/forms` and the agent cards use. It already provides
everything the brief asked for — fixed 166px height, `line-clamp-2` body, kebab
top-right, date bottom-right, whole-card click with keyboard support. The old
bespoke `Card` + `h3` + `p` + `TextLink` tile is gone.

Kit primitives used: `LibraryCard`, `Tabs`, `Button`, `KebabMenu`, `MenuItem`,
`useToast`. Plus the existing `DocSheet` and `EcoSection` feature components.

---

## A. Rules section

`app/(app)/workspace/rules-panel.tsx` split into a server half (reads the source
docs) and a client half, `app/(app)/workspace/rules-grid.tsx` — the same
`fleet.tsx` / `fleet-grid.tsx` shape next door.

**Fixed 3 × 2 grid, then View more.** Same grid classes as the fleet roster.
Measured at both widths: 3 columns, 6 cards maximum, "View more" appears only on
the Design tab (7 rules) and reveals the 7th. Switching tabs resets the grid to
its first 6, so every tab opens in the same shape.

**All cards equal height.** Measured, not eyeballed: every card on every tab
reports exactly `166px`. Bodies clamp at two lines; titles clamp at one.

**A date on each card.** Last-modified of the rule's source document, bottom-right
in the LibraryCard date slot, formatted with the house `formatDate`. It currently
reads Jul 20, 2026 on all fourteen because that is genuinely when the documents
were created — it will spread out as rules get edited.

**Kebab with "Copy as Markdown", top-right.** The same `KebabMenu` + `MenuItem`
pair the agent cards use, copying the full source document (not the card lede) and
firing the same "Copied markdown" toast.

**Whole card → DocSheet.** Verified live at both widths: clicking "Reuse the kit"
opens the sheet titled *Reuse the kit* with subtitle `docs/rules/reuse-kit.md`, the
rendered markdown body, a Save button and the kebab.

**Rich-text links removed.** The `link` field is gone from the `Rule` type and from
all fourteen rules; the grid asserts zero anchors inside the cards. The
destinations those links pointed at (`/design-system`, `/workspace/data-dictionary`)
now live inside the rule documents, where there is room to say why they matter.

### What backs the cards now

The brief asked for a date "of the underlying rule source" and a DocSheet open —
both need a real source, and the rules had none (they were string literals). So
each rule now has one:

- `docs/rules/<id>.md` — the rule as a document: the statement, **Why it exists**,
  **How to apply**. Fourteen files, one per rule, id = filename.

- `lib/rules.ts` — the card layer: id, tab, title, and the one-paragraph lede a
  card shows. Documented in-file as the card layer so the split is explicit.

- `app/api/rules/[id]/route.ts` — admin-only GET/PATCH straight off disk, the same
  contract as `app/api/agents/[name]/route.ts`. The id is validated against the
  `RULES` manifest rather than a regex, so nothing outside the known fourteen can
  be addressed at all.

The card text stays in `lib/rules.ts` rather than being parsed from the documents
because `docs/` is not traced into the Vercel bundle — a filesystem read there
would leave the panel empty in production. Cards render regardless; the date and
the click-to-open degrade to absent when the document is unreadable, exactly like
the fleet's agent cards.

One title was shortened to stop it truncating at 1280: "Plain-column unique keys
for REFRESH CONCURRENTLY" → **"Plain-column unique index"**. All fourteen titles
now render untruncated at both widths (asserted via `scrollWidth`, not by eye).

## B. Labels

- `fleet.tsx:41` — "The agent fleet" → **"Agents"**

- `workspace/page.tsx:117` — "Platform data" → **"Data"**

- `app/(app)/dashboard/page.tsx:62` — "Platform data" **left untouched**, see flags.

## C. The global H1 icon

Removed by **not rendering it**, per the brief's preference.

`ContentHeader` (`components/shell/content-header.tsx`) simply stops passing
`icon` to `PageHeader`. `ROUTE_TITLES` and `routeTitle()` are untouched — the
route → (icon, title) mapping keeps its single home.

**Consumers checked first, as asked.** `routeTitle` has exactly two callers:
`topbar.tsx:52`, which only ever read `.title` (for the context-switcher pill), and
`ContentHeader`, which was the sole icon consumer. So the icon is now unrendered
data. Nothing else broke because nothing else was reading it. `PageHeader` keeps
its optional `icon` prop for its three non-shell callers — the catalog demo, the
`Breadcrumb` primitive, and the form builder.

**Exceptions verified.** The client record (`/clients/<id>`) and an invoice
(`/billing/<id>`) each render exactly one H1 — the shell's — with their entity
headers intact below it; the identity blocks are not H1s, so nothing doubled up.

---

## Verification

Headless Chrome, real cookie login (`brendan@leuk.demo`), dev server on :3010,
at **1440 × 900** and **1280 × 800**. Both widths, every claim below measured in
the DOM rather than inferred.

| Check | Result |
| --- | --- |
| One H1 per page | 1 on /workspace, /calendar, /inbox, /clients, /rates, /clients/<id>, /billing/<id> |
| No icon before the H1 | 0 sibling SVGs before every H1 measured |
| Rules grid 3 × 2 | 3 columns, ≤6 cards, both widths, all three tabs |
| Equal card heights | 166px on every card, every tab |
| View more | Design tab only; reveals the 7th card, then the control disappears |
| DocSheet from a card click | Opens with title, `docs/rules/reuse-kit.md`, Save, kebab, rendered body |
| No links in card bodies | 0 anchors inside cards |
| No horizontal overflow | `scrollWidth == innerWidth` on every page, both widths, and with the sheet open |
| Title truncation | none, all 14 titles, both widths |

Theme: Leuk renders light-only on these surfaces — there is no dark-theme
toggle to exercise, so the both-themes half of the verification standard does not
apply here.

## Screenshots

`docs/reports/assets/2026-07-20-workspace-rules-headers/`

- `01-rules-design-1440.png`, `02-rules-design-1280.png` — Design tab, both widths

- `03-rules-agent-1440.png` — Agent tab

- `04-rules-database-1280.png` — Database tab, after the title shortening

- `05-rules-view-more-1440.png` — Design tab expanded to 7

- `06-rules-docsheet-1440.png` — a rule open in the reused DocSheet

- `07-header-clients-1440.png`, `08-header-calendar-1280.png`, `09-header-rates-1440.png` — page headers, no icon

- `10-client-record-1440.png`, `11-invoice-1440.png` — the entity-header exceptions

---

## Flags

**1. `/dashboard` still says "Platform data".** Untouched as instructed
(`app/(app)/dashboard/page.tsx:62`). Founder's call whether it follows /workspace
to "Data". My read: it should, for the same reason — but /dashboard is a different
page with a different neighbourhood of headings, so it is worth one look rather
than a blind sweep.

**2. My commit `8d75fab` swept five of `ehr-surfaces`'s files.** Full account and
root cause at the top of this report. Second occurrence of this failure in the
tree tonight; the pathspec-on-commit rule is now standing practice for me.

**3. I created a file inside `ehr-storage`'s seam.** `app/api/rules/[id]/route.ts`
is new and sits under `app/api/**`, which the brief assigned to them. There was no
way to give the DocSheet a document without an endpoint. It is a brand-new path
they have no reason to touch, it collided with nothing, and their working tree was
untouched — but it is their seam and you should know.

**4. The "One H1" rule was factually stale, and so is CLAUDE.md.** The rule card
read "One H1, in the TopBar". The H1 moved out of the TopBar into `ContentHeader`
some time ago — `topbar.tsx` is a utility bar now and says so in its own comment.
I reworded the rule to "One H1, rendered by the shell", which is true under both
arrangements. **`CLAUDE.md` still carries the old wording** ("it lives in the TopBar
strip") and I did not edit it — it is a founder-owned canonical rule and the brief
did not scope it. It should be corrected.

**5. `routeTitle().icon` is now dead data.** Kept deliberately, per the brief. If
nothing claims it in a few tranches it is a small cleanup.

**6. Pre-existing console errors on /workspace, not mine.** React duplicate-key
warnings from the rates panel, e.g.
`1780625681|Cigna Health & Life|Cigna chc-of-new-york-njpcp|…|90791`. The row key
is not unique across CPT/place-of-service splits. `components/rates/*` belongs to
another session; flagging rather than touching.

**7. A second H1 on `/design-system`.** The catalog renders a live `PageHeader`
demo (page.tsx:1809) which still shows an icon, because the primitive still
supports one. Pre-existing, deliberate as a demo, and not a route header — but it
does mean the catalog page technically carries two H1s.

## Next tranche suggestions

- The three tabs are ragged: Design has 7 rules, Agent 4, Database 3. The grid
  shape is identical, but Database fills one row and Agent fills one and a third.
  Either accept it or write more rules — there are certainly more than three
  database rules worth stating (the `min-w-0` flex-ancestor rule alone belongs on
  the Design tab).

- The rule documents are now editable in the app but nothing reads them back into
  the agents' actual instructions. Worth deciding whether `docs/rules/` becomes
  the real home the agent briefs cite, or stays a founder-facing mirror.
