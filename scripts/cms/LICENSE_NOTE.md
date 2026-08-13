# CPT licensing — evaluated 2026-07-16, deliberately deferred

**The rule, in one line:** bare five-digit CPT codes are ours to use freely; CPT
*descriptor text* is not. Never store or display AMA descriptor text.
**HCPCS Level II is the opposite** — official descriptors are public and
displayable. The asymmetry is real, and it is the reason this codebase has two
code-name tables that look redundant and are not.

## What was decided

We are **not** licensing AMA CPT content now. This is a settled decision, not an
open question — see `docs/TASK-CMS-RVU.md`.

The terms that drove it:

- **$1,050/yr upfront**, plus usage-report royalties.
- The agreement's definition of **"user" reaches downstream report consumers** —
  not just our staff. A benchmarking product whose whole point is to be shared
  with providers, payers, and prospects makes that definition expensive and
  hard to bound. We would be counting readers, not seats.

The cost is not really the $1,050. It is that the license attaches a metering
obligation to the exact thing the product is for.

## What we do instead

| | Source | Descriptor text | Where |
|---|---|---|---|
| **CPT (Level I)** | AMA | **Ours, self-authored** | `cpt_codes.display_name` |
| **CPT RVUs** | CMS PFS | **None stored — column dropped** | `cms_rvu` |
| **HCPCS Level II** | CMS | **Official CMS text, verbatim** | `hcpcs_codes.long_description` |

- Codes are **facts** and are not copyrightable. We key 9.3M negotiated rates on
  them, join on them, and display them without concern.
- The **descriptors** in the CMS PPRRVU file are AMA-copyrighted text that CMS
  ships under *CMS's* license with the AMA. That license does not extend to us.
  The file states this on its own line 2:
  > CPT codes and descriptions only are copyright 2026 American Medical
  > Association. All Rights Reserved. Applicable FARS/DFARS Apply.
  `scripts/cms/ingest-rvu.mjs` therefore reads column 2 and discards it, and
  `cms_rvu` has no column to hold it. Both facts are commented in place.
- Our own wording lives in `cpt_codes` and is **draft, editable content** —
  reconciled with `RATE_CODES` in `lib/rate-table.ts` so the five codes already
  shipping in `/published-rates` do not fork into two vocabularies.

## The Level II asymmetry (why `hcpcs_codes` may store descriptors)

HCPCS Level II is **CMS-maintained public data**. Its official descriptors are
free to store, display, and ship. This matters commercially, not just legally:
Level II is where NY Medicaid managed care actually pays for behavioral health
(H0004 counseling, H0015 IOP, H0031, H2019), where Medicare puts behavioral and
telehealth G-codes, and where the long-acting injectable antipsychotics live
(J-codes).

Verified 2026-07-16 against the July 2026 file: it carries **zero Level I
(numeric) codes and zero D-codes** — CMS omits the ADA-copyrighted CDT dental
series from the public alpha-numeric file. So no copyrighted descriptor can
arrive through this door. `ingest-hcpcs.mjs` asserts this rather than assuming
it, and **refuses to load** if a numeric or D code ever appears.

## NLM Clinical Tables API — dev-time convenience only

`https://clinicaltables.nlm.nih.gov/api/hcpcs/v3/search` is **HCPCS Level II
only**. Probed 2026-07-16: `90791` → **0 hits**. It is not, and cannot become, a
CPT descriptor source. Use it for ad-hoc lookup while developing; never wire it
into a product surface as a code-name resolver, because it will silently return
nothing for the exact codes our rate corpus is made of.

## Revisit trigger

Reopen the license question when **external providers onboard to Leuk for
coding workflows** — i.e. when someone needs to *search the full CPT vocabulary
by official descriptor* to pick a code to bill, rather than read a benchmark for
codes we already name. Our own wording is sufficient for naming ~14 known
behavioral-health codes; it is not sufficient for a searchable 11k-code set a
biller trusts.

Until that trigger fires:

- own descriptors only
- bare codes as keys
- no AMA descriptor text stored, logged, or displayed
