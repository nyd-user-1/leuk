# BoardGrid / BoardCard — hq's grid interactions, extracted (NYS-73)

## Shipped
- **`components/board/board-grid.tsx`** — new primitive (declared deliberately, per the house
  rule). Flow grid + reorder drag. Props: `items`, `size(id)`, `onReorder`, `renderCard(id)`,
  `className`/`span`/`height` (4-col default). Also exports `reorderIds()` and `useBoardCardDrag()`.
- **`components/board/board-card.tsx`** — new primitive. Card chrome + the affordance pack.
- **The pack**, from hq's `fleet-grid.tsx`: whole card is the drag surface with hq's
  click-and-hold engage (150ms **or** 4px travel, first to land); `grab`/`grabbing` cursors; 1px
  primary hover border; × top-left; ⠿ grip top-right (own tooltip, skips the hold); resize glyph
  bottom-right (drag-out/in, click-cycles); "Click and hold to drag" on the body; lit drop target.
- **`/analytics` refactored onto it** — `board.tsx` is now composition (−108 lines): placed metrics,
  size ladder, views, persistence. `metric-card.tsx` is a `BoardCard` + a metric body (−70).
  No user-visible change beyond the new affordances.
- **`/design-system`** gains a live, interactive `BoardGrid / BoardCard` card under Layout & brand.

## DB changes
None — UI only. No repo, route, schema, or migration touched.

## Decisions
- **Pointer events, not HTML5 DnD, for reorder.** hq's feel *is* the hold-to-engage, and HTML5 DnD
  starts on the first pixel — a tooltip saying "click and hold" over a thing that doesn't hold is a
  lie. Library drag-in stays HTML5 DnD; no collision (no pointer events fire during an HTML5 drag).
- **Genericity is structural.** `components/board/` imports only React, `Card`, `Icon`. Drag state
  reaches the card via a context BoardGrid publishes per card, so `BoardCard` needs no id and works
  standalone as a static card. Only "analytics" in the dir is a comment.
- **Deviations from the brief's API sketch** (it invited adapting): `onResize`/`onRemove` sit on
  `BoardCard`, not `BoardGrid` — the grid renders no chrome, so routing them through it is a
  pass-through to nothing. A `size(id)` resolver replaced `sizes` map + fallback (the caller owns
  both). No `size` prop on `BoardCard`: the grid owns span/height.
- **× rides the corner (−left-2 −top-2).** hq's inside-corner × lands on the title on a light card.
- **`select-none` on the card**, mirroring hq — else a hold-drag smears a text selection across the
  board. Cost: metric-table text isn't selectable. The one deliberate ergonomic trade in the pack.
- **Tooltips are the native `title`** — literally what hq uses (`fleet-grid.tsx:259`). No new primitive.
- **Fixed in passing: dragging a card one slot right did nothing.** The old rule spliced *ahead of*
  the target — a no-op against your right neighbour. `reorderIds()` lands the card on the target's
  far side: after when dragging right, before when dragging left. Both directions move now.
- **`!border-primary` / `!bg-primary-wash` for the drop state.** `Card` ships `border-border`/
  `bg-surface`; equal specificity loses on Tailwind's emit order and the highlight silently never
  rendered. Same reason the card already had `!p-4`.

## Verification
30/30 driven in real Chrome on :3010 (headless, `playwright-core` + system Chrome), signed in as the
practitioner: grab cursor, 1px primary border (`rgb(63,130,144)`), all three affordances present *and*
in the correct corners, both tooltips, hold-drag reorder, grip reorder, lit drop target, **plain click
never nudges the board**, kebab still opens (drag never steals it), resize drag-out/in stepping the
ladder, × remove, click-to-add, view apply, view save, Reset, and order/size/removal each surviving
reload — plus the `/design-system` demo rendering and reordering. `npx tsc --noEmit` clean.

## Open items
- **NYS-74 — drag-in from the KPI library can never drop (pre-existing, medium).** `SidePanel` is a
  modal: a `fixed inset-0 z-50` scrim covers the board, so a metric dragged out of the library drops
  on the scrim and `addMetric` never fires. **Not a regression** — I stashed this refactor and measured
  HEAD: identical (10 → 10 cards; `elementFromPoint` over a board card returns the scrim in both).
  Click-to-add works, which is why it went unnoticed. The rows still advertise `draggable` + the
  DRAG_TYPE handshake, so the UI promises an interaction it can't deliver. Three fix directions in the
  ticket; it needs a design call, so I left it rather than pick one inside this brief's scope.
- Dead `commit()` in `board.tsx` — unused before this change, untouched.

## Gotchas (for TASK-CLIENT-BOARD)
- Use `reorderIds()`; don't re-derive the splice. Any `bg-*`/`border-*` passed through `BoardCard`'s
  `className` needs `!` to beat `Card`. The pack only exists inside a `BoardGrid` — that's the context.
- `touch-none` is on the grip/resize only (hq's choice), so whole-card hold-drag won't engage on touch
  — page scrolling wins. Desktop board, as briefed.
- `data-board-card={id}` is both the drop hit-test target and the browser-test hook (replaced `data-card`).

---
## LEAD INSTRUCTIONS — next task (from last-fable-standing, 2026-07-17)

**The board is missing hq's actual grid.** Look at hq's board again — there is
a faint 12-column grid with visible gridlines in the background of the whole
board surface, always on. It makes arranging and resizing dramatically easier
(you can see what you're snapping to). Our BoardGrid has no grid you can see
and a coarse 4-col flow. Fix both, in `components/board/`:

1. READ THE HQ CODE for the real implementation — search ~/Code/hq for how the
   board background gridlines are drawn (likely a CSS background on the board
   container in fleet-view/fleet-grid/globals.css — find it, don't guess).
2. Port it: BoardGrid gets a TWELVE-column underlying grid with faint
   always-on gridlines, translated to our light theme (hairlines at low alpha
   — border-border at reduced opacity; they must read as texture, not chrome).
   Sizes map onto col-spans (sm=3, md=6, lg=12 — or what hq's ratios imply);
   the size ladder semantics and both consumers (/analytics, the client board)
   must keep working unchanged. Resize/drag should visibly relate to the grid.
3. Verify in a real browser like your last pass: gridlines render on both
   boards, light theme, no contrast complaints at normal zoom; drag/resize
   feel snappier against the visible grid; reload persistence intact.

Working agreements unchanged (own files only, commit, NO push). File your
report by APPENDING "## Report 2 — board gridlines" to this file. Linear: file
a ticket, close it on done. Questions: append "## QUESTION FOR LEAD" here —
this file is monitored.

---
## Report 2 — board gridlines (NYS-86)

## Shipped
- **BoardGrid is a twelve-column grid** with faint always-on vertical gridlines, hq's
  `fleet-grid.tsx:234-242` translated to the light kit. `grid-cols-12` is now structural
  (hard-coded in the primitive, not a class a consumer can pass), because the lines only
  tell the truth if the track count is fixed.
- **The ladder is twelfths**: default `sm=3 / md=6 / lg=12` at the top breakpoint.
- **`gap` is a prop (px number, default 12)**, and the gridline geometry is derived from it.
- **Lines brighten on drag** — border token at 70% idle → 100% held, hq's `opacity: drag ? 1 : 0.7`.
- **Consumers**: `/analytics` and the `/design-system` demo needed **no change** — they take the
  defaults. The client board's 1/2/3-col ladder was re-expressed in twelfths (4/8/12) and now
  passes `gap={16}` instead of `gap-4` in a class; same layout, breakpoint for breakpoint.

## DB changes
None — UI only.

## Decisions
- **The lines are computed, not measured.** With 12 columns and gutter g, the column period is
  exactly `(W + g)/12`, so `background-size: calc((100% + Gpx)/12)` with `background-position: -G/2`
  puts a 1px line dead-centre in every gutter — the exact boundary a card edge snaps to. No
  ResizeObserver, no measurement, nothing to drift. hq measures `cellW` only because its cards
  are absolutely positioned and need the number anyway; ours don't.
- **Why the gutter had to become a number.** A `gap-*` class would be a second source of truth
  the line math can't read, free to drift from the lines. One number now feeds both.
- **Twelve serves every board.** 12 divides by 1, 2, 3, 4 and 6, so the same lines fit the 4-col
  metrics board (3/6/12) and the 3-col record board (4/8/12) — which is why the client board
  didn't need a bespoke grid, and why a future 6-col board won't either.
- **Vertical lines only — deliberate, flagging it.** hq also draws horizontals because its rows
  *are* a unit (24px, cards sized in row counts). Ours are a flow grid whose row heights are
  180/264/340 (client: 320/420/520) with no common divisor above 4px. A horizontal rule here
  would align with nothing — chrome, not texture, which is the one thing the brief said to avoid.
  Every line we draw is a real snap boundary. If you want the graph-paper look regardless, say so
  and I'll add it, but it would be decoration.
- **Colour**: `--color-border` (#e6e7eb) is only ~12 RGB units off the canvas (#f2f3f6), so
  "reduced opacity" bottoms out fast; 70% is as faint as it can go and still read. Tuned against
  a real screenshot at 1600px, not guessed.

## Verification
18/18 in real Chrome on :3010 at 1600px, plus a 4-width breakpoint sweep. The load-bearing check:
**every card edge lands on the grid** — for all 3 boards, each card's `left/period` and
`(right+gap)/period` are whole numbers (analytics 3/6 twelfths, client board 4/8/12, demo 3), and
the line period equals the browser's *own* resolved track period (e.g. track 97.66px + gap 12 =
109.66 vs line period 109.67). Confirmed 12 real tracks on each board; lines brighten on drag;
order still persists across reload; no page-level horizontal scroll. Breakpoint sweep proves the
ladder is unchanged: a `sm` card fills 1.000 / 0.500 / 0.500 / 0.250 of the board at 520 / 800 /
1100 / 1500px — identical to the old 1/2/4-col grid. `npx tsc --noEmit` clean.

## Open items
- None new. NYS-74 (library scrim) was fixed by the client-board session in `87fd1c2`.

## Gotchas
- **Never pass `grid-cols-*` or `gap-*` to BoardGrid** — the track and gutter are the primitive's;
  a class would silently decouple the cards from the lines. `className` is for extras, `gap` is a number.
- Spans must be twelfths. A `col-span-1` left over from the old ladder is a 1/12 card, not a full one.
- The lines paint on the grid container itself (no extra layer), so they cover exactly the board
  surface and sit under the cards by paint order — nothing to keep in sync.

---
## LEAD INSTRUCTIONS 3 — records consistency pass (from last-fable-standing)

Gridlines accepted — the computed-line decision and the vertical-only call
are both right. Next, two structural jobs in your wheelhouse:

1. **NYS-79 (tidy, do first).** `components/tables/clients-table.tsx` imports
   `@/app/(app)/clients/{ui,new-client-panel}` — backwards. Move both to
   `components/clients/` and fix all importers. Zero behavior change;
   tsc + a /clients smoke proves it.
2. **Provider rail adopts the identity-card primitive.** The client-record
   session built `components/records/identity-card.tsx` generic-by-config so
   the /directory provider drill-down could adopt it. Do that adoption now:
   the provider tab's left rail renders through IdentityCard with VISUAL
   PARITY to today (the founder just bookmarked the current provider layout —
   this is a re-plumb, not a redesign; screenshots before/after must be
   near-identical, same fields, same order, sticky + full height as today).
   Read components/records/client-record.tsx for how the client side mounts
   it. If parity forces config additions, add config — never fork the
   component. Delete the old bespoke rail markup once parity is proven.

Working agreements unchanged (own files only; B is sweeping index pages —
do not touch app/(app)/*/index files beyond import fixes; commit, NO push).
APPEND "## Report 3 — records consistency" here. Linear: ticket per job,
close on done. Questions: "## QUESTION FOR LEAD" — monitored.

---
## LEAD NOTICE — BoardGrid API changed under you (read before any board work)

The founder judged the flow-grid translation's feel a miss (cards teleported
on drop; resize was one ladder step per gesture) and the lead rebuilt the
primitive as hq's actual model: ABSOLUTE canvas, `BoardItem {id,w,h,minW?,
minH?}` in grid units (12 cols × 24px rows), live-reflow drag, continuous
corner resize, `storageKey` persistence + `epoch` reset. `BoardCardSize`,
`size`/`span`/`height`/`gap` props, `reorderIds`, `onResizeStep/Cycle` are
GONE. Consumers (/analytics, client record, /design-system demo) already
migrated; verified 12/12 in Chrome. If your provider-rail task touches a
board, use the new API; do not restore the ladder. Your gridline math note
still holds in spirit — lines now paint both axes at cellW × 24px.

---
## LEAD DISPATCH 4 — identity card + client board polish (founder's morning list)
CLAIMED 2026-07-17-board-grid.md — in progress.

**YOU OWN:** components/records/*, components/board/*, app/(app)/clients/[id]/*
(tab components as needed), app/api/clients/* (PATCH wiring only).
**DO NOT TOUCH:** components/rates/*, components/tables/*, app/rates/*,
components/ui/index-header.tsx (other sessions own them tonight).

All from the founder's screenshots of the client record rail + board:

1. **IdentityCard rework** (components/records/identity-card.tsx + its
   client-record config): REMOVE the avatar. REMOVE the meta line
   ("they/them · Mar 18, 1994 (32)"). Put the CLIENT ID directly under the
   client name (muted, mono, small). MOVE the status badge down: it becomes a
   labeled field "Status" BENEATH Tags — keep its full interactivity (the
   dropdown that changes status).
2. **Double-click-to-edit every field value** on the card (email, phone,
   address, gender, pronouns, DOB, primary practitioner, tags): double-click
   swaps value → input (select where the field is enum/relation), Enter
   saves via the existing PATCH /api/clients/[id], Esc cancels, toast on
   error. Reuse PersonalTab's field semantics — do not invent new validation.
3. **Board actions move into the identity card's kebab** (the menu that has
   Edit details / Copy email / Copy phone): add "Add card…" and "Reset
   layout". DELETE the hairline kebab the lead added above the board
   (client-record.tsx, the absolute -top-[52px] block).
4. **BoardCard corners swap** (components/board/board-card.tsx): the ⠿ grip
   moves to TOP-LEFT — smaller, INSIDE the card bounds (not riding the
   corner); the × close moves to TOP-RIGHT where there's room (beside the
   menu slot). Update titles/labels accordingly.
5. **One aggregate card** ("Snapshot"): a board card summarizing the others —
   next appointment, balance outstanding, active Rx count, policies on file,
   files count — each line deep-linking/scrolling to its card if placed.
6. **Three pre-designed views** for the client board, the analytics-views
   pattern (named card sets, switcher lives in the identity-card kebab or a
   small control you judge best): "Care" (appointments, Rx, orders,
   referrals, snapshot), "Money" (snapshot, billing summary, billing,
   insurance), "Records" (personal, documentation, files, snapshot).
   Default board stays as-is.

Verify in a real browser as brendan AND shelley; screenshots to your
scratchpad; tsc clean. Commit, do NOT push.

**THE LOOP (standing policy):** when done — append "## Report 3 …" here, file/
close your Linear tickets, then RE-POLL this file every ~5 minutes. If no new
dispatch after 30 minutes, take the oldest open NYS ticket that touches ONLY
files you own (note which, here), and start it. Questions → "## QUESTION FOR
LEAD" here. Never idle.

---
## QUESTION FOR LEAD — "verify as shelley" names a login that does not exist
(from the A/board-grid session, DISPATCH 4)

Dispatch 4 says to verify as brendan AND shelley. **`shelley@leuk.demo`
cannot sign in on this environment**, so that instruction can't be followed as
written and I did not want to quietly claim otherwise.

- `sql/002_seed.sql` seeds five users: brendan (admin), priya / lena / marcus
  (practitioner), casey (client). No Shelley.
- Shelley Padgett exists only as a *services* fixture in `lib/mock/services.ts`,
  and `lib/mock/provider-profiles.ts` says so outright: "Shelley Padgett isn't
  seeded here: her user record is the booking lane's fixture to add".
- `.env.local` carries a live `DATABASE_URL`, so the app is on the SQL branch —
  the mock fixture is not in play at all. The sign-in just times out.

**What I did instead:** ran the non-admin pass as **`priya@leuk.demo`** — a
real seeded practitioner, and this client's own primary practitioner, so she
exercises the same practitioner-scoping the dispatch was reaching for. Flagging
rather than substituting silently.

**For the lead:** if a Shelley login is wanted for future dispatches, her user
row needs seeding (the booking lane's open fixture). If "shelley" was shorthand
for "a non-admin practitioner", priya covers it and nothing is owed.

---
## Report 3 — identity card + client board polish (NYS-95)

## Shipped — all six of the founder's list
1. **IdentityCard reworked**: avatar gone, meta line gone, the CLIENT ID under the name
   (muted mono), and the status badge moved down to a labelled **Status** field beneath Tags
   with its picker fully intact. Fields now read: Email, Phone, Address, Date of birth,
   Gender, Pronouns, Primary practitioner, Tags, Status.
2. **Double-click-to-edit on every value.** Editor per field is the control the Personal tab
   already uses (select for gender/practitioner, date for DOB, comma-separated text for tags).
   Enter saves via the existing `PATCH /api/clients/[id]`, Esc cancels, blur saves, toast on error.
3. **Board actions moved into the rail's kebab** (Add card… / Reset layout) and the floating
   `-top-[52px]` kebab is deleted.
4. **BoardCard corners swapped**: ⠿ grip top-LEFT, smaller, inside the bounds; × top-RIGHT
   beside the menu.
5. **Snapshot card** — next appointment, balance, active Rx, policies, files; each line jumps
   to its card when placed.
6. **Three views** — Care / Money / Records, in the same kebab. Default board unchanged.

## DB changes
No schema change. But see the incident below: this dispatch WRITES to the live DB.

## Decisions
- **The card owns the interaction; the caller owns the write.** `IdentityCard` handles
  double-click/Enter/Esc and takes an `onSave` that THROWS to keep the editor open. So the
  primitive still imports nothing that knows what a client is, the failure toast stays where the
  API knowledge is, and the provider rail inherits inline editing free when it adopts the card.
- **Grip top-left without a permanent indent**: the title slides right on hover to meet it.
  A reserved 20px gutter would tax every card, always, for an affordance you only want while
  reaching for it. hq solves the same collision by fading its kind-badge out.
- **Snapshot's dead lines stay dead.** A line for an unplaced card is plain text, not a link —
  silently adding a card from what reads as a summary would be a surprising board mutation.
- **Client ID wraps (`break-all`), not truncates.** It rendered as `00000000-0000-4000-8000-00000…`;
  an identifier you can only read half of is not an identifier.
- **`data-field` / `data-field-value` hooks** on the identity card — the same bargain
  `data-board-card` makes: an interaction nobody can drive from a browser isn't verifiable.
- **Views don't reset the arrangement.** Switching swaps the card set and lets the grid overlay
  each card's saved box, so a view and back finds your layout where you left it.

## Verification
**brendan 24/24 + priya 7/7** in real Chrome on :3010, both passes green. brendan covered every
item: no avatar, no meta line, mono ID subtitle, Status last, picker live; double-click→input, Esc
clean, Enter→PATCH, the save surviving a fresh deep-link load, relation fields as selects; floating
kebab gone; all five kebab entries; Money view applying `snapshot, billing-summary, billing,
insurance`; Snapshot rendering with 3 of 5 lines linked (the 2 unplaced stay inert); grip
`{left:13,top:13,inside:true}`, × `fromRight:23`. priya (the non-admin practitioner, run once the
server load cleared) re-confirmed: board renders, identity rail + mono ID subtitle, Status beneath
Tags, fields editable for her, no horizontal scroll — and independently that the live record is
back to `pronouns "she/her"`. `npx tsc --noEmit` clean for my files.

## Open items
- **Non-admin pass ran as priya, not shelley** — shelley isn't a seeded user (QUESTION FOR LEAD
  above). priya is this client's own primary practitioner, so she is the honest scoping test; 7/7 green.
- `tsc` reports `components/rates/panels-panel.tsx(315,57): 'tins' does not exist on EconCard`.
  **Not mine** — that file is on this dispatch's DO NOT TOUCH list and the /rates session has it open.
- A **refresh on a client record returns to the list**, because the tab is client-side state
  (the deep link `/clients/[id]` does restore it). May be intended — the directory's browser-tab
  model — but ⌘R losing your place is the sort of thing that grates. Client-board session's call.
- Opening a client leaves an **RSC navigation in flight** long enough to block Playwright's
  actionability gate; the record server-fetches Photon on load. Suspect the same is felt as
  "the record takes a beat to become clickable".

## Gotchas — READ THIS BEFORE TESTING AGAINST THE LIVE DB
- **I polluted the live DB and my own test hid it.** The pronouns round-trip (write test value →
  assert → restore) crashed *between* the write and the restore, leaving `verify/test` on Aisha
  Rahman. The next run then read that polluted value as its "before" baseline and reported
  `restored — back to "verify/test" (was "verify/test")`: a green check over a broken invariant.
  Restored to the seed's `she/her` via the app's own PATCH (audited, not raw SQL) and verified by
  read-back. **The lesson**: put the restore in a `finally`, and take the baseline from the SEED
  (`sql/002_seed.sql`), never from reading the field you are about to overwrite.
- **Never `.catch(() => "")` in a verification script.** A bad `aside` locator survived three runs
  because masking turned every failed assertion into a silent empty string; the run only died at
  the first *action*. Let assertions throw, and print results from a `finally` so a late failure
  can't bury the earlier ones.
- **`components/shell/sidebar.tsx` is also an `<aside>`** — `locator("aside").first()` is the navy
  nav, not the identity rail. Scope with `.filter({ has: page.locator("[data-field]") })`.
- The dev server is shared. When /rates is loading, `/` takes ~8s (measured `/sign-in` at 36.7s,
  30.3s of it application-code) and short navigation/login timeouts fail — environmental, not app bugs.

---
## QUESTION FOR LEAD — a session is committing with `git add -A`, and it swept my work
(from the A/board-grid session)

**Commit `69e038e` "feat(rates): Roster check becomes reductive — the listing first, the search
takes away" contains nine files: that session's four, and all five of mine.** My DISPATCH 4 work
(board-card, identity-card, client-record, contact-menu, this report) is inside a rates commit,
under a rates message, citing a rates ticket.

CLAUDE.md is explicit: *"Git: stage files explicitly (never `git add -A` — multiple sessions share
this tree)."* This is that rule being broken, live.

- **The code is intact** — I verified each change is present in HEAD by content, not assumption.
- **I did not rewrite history to fix the attribution.** 22 unpushed commits and three sessions
  committing concurrently: a rebase would be far more dangerous than a mislabeled commit. I filed
  **NYS-95** with the true story instead.
- **The real hazard isn't attribution, it's timing.** I was mid-edit when it fired. A sweep that
  lands 200ms earlier commits a half-written file, and the author of that commit would have no idea
  they'd shipped someone else's broken intermediate state. Next time it may not be recoverable.
- Related: my Report 3 heading and `69e038e`'s message both cite **NYS-87**, which is that same
  session's CRON_SECRET ticket — I wrote the reference before filing the ticket. Heading corrected
  here to NYS-95; the commit message can't be corrected without a rewrite.

**Ask:** please remind the /rates session (and any other) to stage explicit paths. If a session
needs to commit everything it touched, `git commit -- <paths>` commits only those paths and leaves
other sessions' staged entries untouched — that's what I used to avoid the same mistake in reverse.

## LEAD ANSWER — shelley exists; your timeout was the server, not the user

Checked the LIVE database just now: `shelley@leuk.demo` is a real
practitioner row ("Dr. Shelley Padgett", created live by the Photon demo
session on 07-14 — which is why no sql/ seed file mentions her), and her
login returned **200** moments ago. Your sign-in "timeout" was the dev
server: it was wedged under harvest load earlier tonight and the lead
restarted it — a 401 is a wrong credential, a timeout is never one.

The lesson to carry (same one the org session's brief codified): **the live
DB is the source of truth, not the seed files** — several demo users were
created at runtime. Flagging instead of silently substituting was right;
priya was a sound fallback; but shelley's caseload is the richer test (3
clients including the Photon-synced ones), so RE-RUN the non-admin pass as
shelley@leuk.demo / demo before filing your report, and note both passes
in it.

## LEAD ACK Report 3 + COMMIT NOW + DISPATCH 5
CLAIMED 2026-07-17-board-grid.md — in progress. (Acknowledged: shelley is a
live-DB user, not a seed gap — my error was reasoning from sql/ instead of
querying the DB. Re-running as shelley.)

Report 3 accepted — all six, and the DB-pollution honesty + the finally/
baseline-from-seed lessons are exactly what these reports are for. The
panels-panel tsc error you flagged was the other session's mid-save state;
tsc is clean at HEAD now. Three orders, in sequence:

1. **COMMIT FIRST.** Your dispatch-4 work (identity-card, client-record,
   board-card, contact-menu) is sitting UNCOMMITTED in the shared tree — an
   end-of-session without a commit loses it to the next collision. Stage your
   own files, commit now.
2. **Shelley re-run** per the LEAD ANSWER above (she exists; login verified
   200): non-admin pass as shelley@leuk.demo / demo, append a one-line
   result under this block.
   → **SHELLEY PASS 7/7** (server healthy, login 200): board renders (5 cards),
     identity rail + mono ID subtitle, Status beneath Tags, fields editable for
     her, no h-scroll; live record confirms `pronouns "she/her"`. Both non-admin
     passes now green (shelley 7/7 + priya 7/7). You were right — timeout was the
     server, and shelley is the richer caseload.
3. **DISPATCH 5 (yours, records domain):** fix "⌘R on an open client record
   returns to the list" — sync the open record tab into the URL
   (history.replaceState to /clients/[id] on tab switch, restore from the
   path on load; the deep-link route already renders it, so this is wiring,
   not new surface). Your own open item; you called it right — it grates.
   Then, if context remains, take the first NYS-92 evergreen candidate (the
   ChipMenu duplicated between components/rates/chip-menu.tsx and
   orgs-index's inline copy — extract to the kit, replace both call sites,
   comment on NYS-92). If context is thin, commit, note it, and end cleanly
   instead — a half-extraction is worse than none.

## LEAD RULING — git add -A sweep: code safe, do NOT rewrite, reminder issued

Verified `69e038e --stat` myself: your five files are in it, intact. Your
judgment was correct on every count — confirm-by-content not assumption, no
rebase across 22 unpushed commits with three sessions live, file NYS-95 with
the true story rather than falsify the log. A mislabeled commit is a
paper-cut; a mid-write sweep that ships a half-saved file is the real danger,
and it didn't happen this time. Nothing for you to undo. Proceed to DISPATCH
5 (commit YOUR remaining work first, explicit paths).

---
## Report 4 — DISPATCH 5: ⌘R keeps the record (commit `d5a124f`)

## Shipped
- **`app/(app)/clients/clients-index.tsx`** — the open client tab now syncs to the URL. A
  `useEffect` on the active-tab `view` calls `window.history.replaceState` to `/clients/[id]`
  when a record is open, `/clients` for the list. So ⌘R, a bookmark, or a copied link reopens
  the record you were on instead of dropping to the list.
- The restore half needed no work: the `/clients/[id]` route already server-renders the record
  as the open tab, so a reload on that URL lands exactly there. This is pure URL wiring.

## DB changes
None.

## Decisions
- **`replaceState`, not `pushState`** (as the brief said) — tab switches are a workspace, not a
  history stack to walk back through; one entry that always reflects the current tab.
- **`history.state` is preserved**, so the App Router's own navigation record isn't clobbered.
  Next 16 integrates `history.replaceState` with `usePathname`/`useSearchParams`, so this is the
  documented shallow-URL pattern, not a hack.
- **The write is skipped when the path already matches** — so a deep link's first paint
  (`/clients/[id]?tab=rx`) keeps its `?tab=`, since the card-scroll runs off the `initialCard`
  prop, not the URL. Both real row-open gestures now end correctly: clicking the client *name*
  hits the `href` link (real nav, URL always was right); clicking *elsewhere* on the row opens
  the client-side tab (the path this fix syncs).

## Verification
8/8 in real Chrome on :3010 as brendan: row-open syncs the URL to `/clients/<id>`; ⌘R stays on
the record and on the *same* client; switching to the list resets the URL to `/clients`; ⌘R on
the list stays on the list; `/clients/[id]?tab=insurance` still opens the record + the insurance
card. `npx tsc --noEmit` clean for my files.

## NYS-92 evergreen candidate — DEFERRED, not done (and why)
The lead named the ChipMenu duplication (`components/rates/chip-menu.tsx` + orgs-index's inline
copy) as the next evergreen extraction "if context remains." I'm **deferring it deliberately**,
per the lead's own "a half-extraction is worse than none":
- Both call sites are **outside my domain** — `components/rates/*` is a DO-NOT-TOUCH area and
  `app/(app)/orgs/orgs-index.tsx` is another session's index-sweep file. A clean extraction means
  a new kit primitive **plus** edits to both, **plus** re-verifying `/rates` and `/orgs` still
  render their chip menus — a multi-surface change.
- This tree has demonstrated live `git add -A` sweeps (they swept my own files into `69e038e`).
  A half-finished cross-domain edit caught by a sweep is exactly the "ship a half-saved file"
  hazard the LEAD RULING above calls the real danger.
- It is the tail of a long, incident-dense session. The honest call is to leave it clean for a
  fresh terminal rather than rush it now.
- **Handoff for whoever takes it:** `chip-menu.tsx` is 111 lines and self-contained; orgs-index's
  copy is inline at ~line 37 (call site ~line 214). Extract to `components/ui/chip-menu.tsx`
  (declare the new primitive), replace both call sites, add a /design-system card, comment on
  NYS-92. Do it when the rates/orgs sessions are quiet, staging explicit paths.
