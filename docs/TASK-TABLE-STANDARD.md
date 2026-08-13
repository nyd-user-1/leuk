# TASK — One table standard, everywhere

_Brief for a fresh session. Brendan reviewed the app's tables (2026-07-12) and
wants ONE canonical table experience across the provider workspace and the
client portal — implemented in the shared primitive, not re-invented per page.
This doc is the full spec; the screenshots it refers to are described inline._

## Ground rules (read first)

- App: Next 16 App Router · React 19 · Tailwind v4. Conventions in `CLAUDE.md`
  and `BUILD_SPEC.md`. Dev: `npm run dev` → **localhost:3010**, sign in
  `brendan@leuk.demo` / `demo`. Verify in the browser (headless is fine)
  before reporting; `npx tsc --noEmit` must stay clean.
- **Reuse the design system** (`components/ui/*`, browse `/design-system`).
  The changes below go into the `Table` primitive
  (`components/ui/table.tsx`) and page files — do not fork a second table
  component.
- One H1 per page, in the TopBar (`ROUTE_TITLES` in
  `components/shell/topbar.tsx`); page actions via `TopBarActions`.
- Git: the working tree may hold uncommitted work from concurrent sessions
  (`/rates`, clients table, note-sheet). **Stage only your own hunks; never
  `git add -A`.** Do not touch `scripts/mrf/*`, `.harvest/*`,
  `lib/repos/networks.ts`, or marketing pages (`app/(site)/*`, `app/page.tsx`).
- Data access stays repo-only (`lib/repos/*`). On the rates tables, never
  unwrap the repo's display strings into bare numbers — the "$X in-network"
  wrapping is a structural rule (see `lib/repos/rate-signals.ts` header).

## The canonical table (implement once, inherit everywhere)

The reference implementation for scroll/lazy-load behavior just landed in
`app/(app)/clients/clients-index.tsx` — study it, then lift the pattern to the
primitive level where sensible so every page gets it cheaply.

1. **Scroll container = the table itself.** Page root is a `flex h-full
   min-h-0 flex-col`; toolbar rows are `shrink-0`; the `Table` gets
   `className="min-h-0"` + `stickyHeader`. The header row stays fixed; rows
   scroll beneath it. The page body never scrolls.
2. **No pagination, anywhere.** Lazy-load instead: render in batches (~50) and
   grow when a sentinel row scrolls into view (IntersectionObserver — see the
   clients file). For server-paginated data (directory, 99k rows) the sentinel
   fetches the next page from the API and appends; do not client-slice.
3. **Header row styling — make it discernible, teal.** Style the `th` row in
   the `Table` primitive once: Brendan's instinct is teal — e.g. a
   `bg-primary-wash` (or teal-tint) fill with `text-primary` (or deep-teal)
   14/600 header text. Tokens live in `app/globals.css` (`--color-primary`
   #3F8290, `primary-wash`, `info-tint`, …). It must remain opaque under
   `stickyHeader` scroll (the bg sits on the `th` cells). Check it on
   `/design-system`'s Table card too — every table inherits this.
4. **Sortable column headers.** Clicking a header sorts asc → desc → (toggle);
   show a small chevron on the active sort column. Implement once (either in
   the primitive via an optional `sortable` head descriptor, or one shared
   helper hook used by every page). Sort client-side over loaded rows; for the
   directory, pass sort to the API if `searchProviders` supports it, otherwise
   sort loaded rows and note the limitation in your report.
5. **No row is ever two lines.** Single-line rows everywhere: `whitespace-nowrap`
   + `truncate` with a `title` tooltip for anything long (payer names, emails,
   tags overflow as `+N`). If a cell would wrap, truncate it.
6. **Equal vertical margins.** The gap from the bottom of the table to the
   viewport must equal the gap from the toolbar/search bar to the top of the
   table (currently `mb-4` = 16px above vs the page's `p-6` below — make them
   match).
7. **Row links keep row-click behavior** (whole row clickable where it already
   is; kebab/checkbox cells `stopPropagation`).

## Per-page work

### Clients (`app/(app)/clients/clients-index.tsx`) — mostly done, finish it
- Scroll/sticky/lazy-load already implemented — keep.
- Client name should read **medium/regular, not bold** (it's a `TextLink`
  today and renders too heavy — adjust the cell, not the TextLink primitive,
  unless the primitive's weight is wrong everywhere).
- **Add a "Created" column** (client `createdAt`; ISO → `formatDate` from
  `lib/format.ts`; confirm the repo returns it — normalize dates in the repo
  per convention, never `Date` objects to the client).
- Headers sortable (name, created, status at minimum).

### Directory (`app/(app)/directory/directory-client.tsx`)
- Same treatment: sticky teal header, table-owned scroll, sentinel lazy-load
  that fetches the **next API page** on scroll (it's server-paginated over
  ~99k providers — `searchProviders({ page, pageSize })`), remove the
  `Pagination` control, single-line truncated rows, sortable headers.

### Rates (`components/rates/bands-panel.tsx`, `panels-panel.tsx`,
`spread-panel.tsx`)
- Recently rebuilt (uncommitted) — apply the standard: sticky teal header,
  table-owned scroll + lazy batches, sortable headers, keep single-line rows
  (already true). Do NOT alter the display strings from
  `lib/repos/rate-signals.ts` (no bare numbers) and keep `TableSkeleton`
  (`components/rates/table-skeleton.tsx`) in sync with any header changes.

### Billing — restructure (`app/(app)/billing/*`)
Today: a split view (left "Invoices" list panel + right "Needs attention"
pane) under tabs Overview / Open / Settled / Payers. Change to:
- **Tabs: Overview · Clients · Payers.** Open and Settled are the same table
  with a status filter — collapse them into one invoices table on the
  **Clients** tab, with the standard toolbar (SearchInput + `+ Status` filter
  chip, plus existing filters) and the canonical table (sticky teal header,
  lazy-load, sortable, single-line rows). Suggested columns: Client · Invoice
  # · Issued · Due · Status · Balance.
- **Kill the left list panel** — the table replaces it.
- **Row click keeps today's behavior**: navigate to the invoice detail page
  (`/billing/[id]` — the full-page view with Send again / Record payment /
  Collect online and the invoice sheet). Do not change the detail page or the
  print view (`/billing/[id]/print`).
- Overview keeps the KPI strip + "Needs attention" (as a standard table).
- Payers tab: its own standard table.
- Data via `lib/repos/invoices.ts` (`listInvoices`) — extend the repo only if
  a field is missing (e.g. issued date), same `hasDb ? sql : mock` discipline.

### Client portal (`app/portal/*`)
- Any tabular list (invoices, records, etc.) inherits the same standard
  automatically via the primitive — sweep the portal pages and fix any page
  that fights the pattern (own scroll, pagination, wrapping rows). The portal
  uses the same `Table` primitive; don't fork it.

## Acceptance checklist (verify each in the browser, then report)

- [ ] Header rows visibly teal-styled on every table incl. `/design-system`.
- [ ] Headers sort on click with a direction indicator.
- [ ] Table body scrolls under a fixed header on clients, directory, rates
      (all three tabs), billing, and portal tables; page body doesn't scroll.
- [ ] No `Pagination` component rendered anywhere in app or portal.
- [ ] Directory lazy-loads successive API pages on scroll (test by scrolling
      past 25 rows).
- [ ] Clients: name weight reduced, Created column present and sortable.
- [ ] Billing: Overview/Clients/Payers tabs; invoices table rows open
      `/billing/[id]`; Open+Settled merged behind a status filter.
- [ ] No table row anywhere renders two lines (spot-check long payer names on
      /rates Panels and long emails on clients).
- [ ] Top and bottom table margins equal.
- [ ] `npx tsc --noEmit` clean; no new console errors.

Report before committing; stage only your own files.
