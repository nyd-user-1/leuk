# TASK — Directory provider profile page (+ auto-scoped Rates tab)

_Own lane: `app/(app)/directory/*` (new route), `components/providers/*`
(new components), and a small, additive change to
`components/rates/panels-panel.tsx` / `components/rates/rates-shell.tsx` (an
optional pre-fill prop — do not restructure those files, they're actively
used elsewhere). Do NOT touch `app/(app)/clients/*` or `app/(app)/billing/*`
— both are flagged for separate fixes, out of scope here. Read
`BUILD_SPEC.md` and browse `/design-system` before writing any UI — reuse
primitives, never invent one without saying so in your report._

## Why

The internal workspace Directory (`app/(app)/directory/`, where Brendan
browses referral candidates and NPPES/Medicaid-sourced provider records)
only has a slide-over (`SidePanel` in `directory-client.tsx`) — click a row,
get a right-side panel with ~10 label/value rows and a "Refer a client"
button. Clients (`app/(app)/clients/[id]/`) already has the real pattern:
click a row, navigate to a full page with a header (avatar, name, status
badge, key facts) and real tabs (Overview, Personal, Insurance,
Documentation, Billing, Files).

Separately: the Rates page (`/rates`, `components/rates/rates-shell.tsx`)
has a "Panels" tab that shows a clinician's full payer-book standing — every
insurer, network, TIN, and rate that lists their NPI. Today it always starts
empty ("Know what payers actually pay — before you credential") until you
type a 10-digit NPI. That's correct behavior for a general-purpose lookup
tool reached directly from the sidebar — there's no sensible "default"
standing table without a person to check standing for. But reached FROM a
specific provider's own page, there's an obvious default: that provider's
own NPI. Giving Directory a real profile page, with a Rates tab pre-scoped
to that page's NPI, is how Panels gets a coherent default at that entry
point — without changing anything about how the standalone `/rates` tool
behaves for a direct visit.

## Scope

1. **New route** `app/(app)/directory/providers/[npi]/page.tsx` (10-digit
   NPI as the URL param — that's the stable identifier
   `lib/repos/rate-signals.ts` and `directory_providers` both key on, unlike
   the directory row's internal `id`). Thin server page per this repo's
   convention (see `app/(app)/clients/[id]/page.tsx` for the shape); real
   content in a client component.
2. **Row click in `directory-client.tsx`** (`Table`'s `Tr onClick`) navigates
   to `/directory/providers/{npi}` instead of opening the `SidePanel`. Drop
   the `SidePanel`/`selected` state once the page covers its content — but
   keep the "Refer a client" flow (`ReferModal` + its API call) working,
   moved to a page-level action (TopBarActions or a button on the page,
   matching the canonical-layout rule: entity-detail pages are the
   allowed H1 exception, so the provider's name can be the page's own H1
   here, same as Clients does for a client's name).
   - **Caveat**: some Directory rows have no NPI (programs, or provider rows
     where NPPES/Medicaid didn't carry one — check `DirectoryProvider.npi:
     string | null` in `lib/types.ts`). Rows without an NPI have nothing to
     route to — keep the `SidePanel` (or an inline non-clickable state) for
     those, or gate the row's clickability on `npi` being present. Decide
     and document whichever you pick.
3. **Page tabs, minimum viable set:**
   - **Overview** — today's `SidePanel` fields (Specialty, Sub-specialty,
     Insurance/network summary, Credential, Gender, Address, Phone,
     License, Practice, In-practice-since, NPI + verify, Source), laid out
     as a real page, not a `<dl>` in a drawer. **Most Directory rows are
     external NPPES/Medicaid-sourced records with no Leuk account** —
     thin data is the common case, not the exception. `components/providers/
     provider-panel.tsx` already solved exactly this problem for the public
     marketing site (a provider profile page that reads as complete with as
     few as 4 facts, one panel instead of three near-empty cards,
     conditionally rendering "Qualification and insurance" / "Care details"
     sections only when they have content) — use it as the layout precedent,
     don't design this from scratch. It may not be directly reusable
     as-is (client-safe by construction, built for the public site's
     content shape) — read it, adapt what fits, say in your report what you
     reused vs. rebuilt.
   - **Rates** — the `PanelsPanel` standing table
     (`components/rates/panels-panel.tsx`), pre-scoped to this page's NPI
     with no manual entry required. Cleanest path: extract or expose a
     prop on `PanelsPanel` (or a thin wrapper) that accepts an
     `initialNpi` and looks it up on mount, reusing the exact same
     `/api/rates/standing?npis=` call and table it already has — do not
     duplicate that table. When the provider has no published rate rows,
     the existing "no published rate rows" banner already covers that
     case; when the NPI isn't found in `directory_providers` at all
     (shouldn't happen — you're arriving from a directory row that has
     one — but the KYR repo functions already handle a not-found NPI
     gracefully, so no new work needed there).
   - Anything past these two is your judgment call — a KYR "Recruiting"-
     style footprint summary might belong here too (`/recruiting` already
     has this exact per-NPI card, see `components/rates/recruiting-shell.tsx`
     for the pattern), but don't build it unless it's a small, obviously
     correct addition. Flag it in your report instead if you think it
     belongs and want a second opinion before building.
4. **Do not** change the standalone `/rates` page's default behavior —
   Panels reached directly from the sidebar keeps today's "enter an NPI"
   empty state. This task only adds a second, pre-scoped entry point via
   Directory; it doesn't touch the first one.

## Explicitly out of scope

- Clients page/table fixes (flagged separately, not this task).
- Billing drill-down page fixes (flagged separately, not this task).
- Any change to `lib/repos/rate-signals.ts`'s public API beyond what's
  needed to expose an NPI-prefill on the client side — the repo's data
  contracts are stable and used by five other screens (Recruiting, Roster
  check, Apply next, Panels, Affiliation economics); don't touch them.
- `components/ui/table.tsx` and any other shared primitive — consume as-is.

## Data notes

- `DirectoryProvider` type: `lib/types.ts` (has `npi: string | null`,
  `name`, `profession`, `credential`, `licensedIn`/license fields, address
  fields, `source: "nppes" | "medicaid"`).
- Rate-signal data for a given NPI: `getStanding(npi)` in
  `lib/repos/rate-signals.ts`, already wired through
  `GET /api/rates/standing?npis=` — this is what `PanelsPanel` calls today.
- No bare rate number ever leaves `lib/repos/rate-signals.ts` — same rule as
  every other KYR screen; you're consuming its wrapped output, not
  computing anything new.

## Verify before reporting done

- `npx tsc --noEmit` clean.
- Click a Directory provider row with an NPI → lands on the new page, header
  shows their identity, Overview tab matches (or improves on) today's
  slide-over content, Rates tab shows their standing table with zero manual
  input.
- A provider row with a thin NPPES record (most of them) still reads as a
  complete page, not a mostly-empty one — this is the main risk, verify it
  visually, not just structurally.
- "Refer a client" still works from the new page.
- The standalone `/rates` → Panels tab, visited directly (not via a
  Directory row), still shows its current empty state until an NPI is
  entered — confirm you haven't changed that.
- One H1 per page, in the TopBar for the Directory list and as the entity
  header on the new provider page (the documented exception).
