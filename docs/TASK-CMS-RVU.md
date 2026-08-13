# TASK — Free CMS benchmark layer: own-vocabulary `cpt_codes` + PFS RVU → %-of-Medicare

Supersedes docs/TASK-CPT-API.md (AMA API integration — deferred, see licensing
note below). Decision already made, do NOT revisit: we are NOT licensing AMA CPT
content now. No AMA/CMS descriptor text may be stored in display columns or
shown on any surface. Bare five-digit codes are not copyrightable and are fine.

Why this task: `provider_rate_signals` holds 9.3M negotiated rates keyed by
`billing_code`. The CMS PFS Relative Value Files (free, no key, no license, no
signup) give us the Medicare-allowed amount for any code × NY locality by pure
arithmetic: `(work×GPCIw + PE×GPCIpe + MP×GPCImp) × CF`. That turns every rate
we hold into "% of Medicare" — the benchmarking product in embryo.

DB: Neon Postgres, database `neondb` (verified 2026-07-16 — assert
`select current_database()` = neondb before writing anything). Connect the house
way: `node --env-file=.env.local scripts/...` reading `DATABASE_URL`. Existing:
`provider_rate_signals` (9.3M rows, text `billing_code`), `services` (EHR
catalog, NO code column — leave it alone this phase), no `cpt_codes`/`cms_rvu`/
`cms_gpci` tables yet (verified).

## 1 — `cpt_codes`: our OWN descriptor vocabulary
Schema in `sql/033_cms_pfs.sql` (033 is the next free number; note `sql/` has a
duplicate-029 collision — don't repeat that; put ALL of this task's DDL in 033).
Columns: `code` text PK, `display_name` (our own plain-language wording),
`patient_friendly_name` (own text, nullable), `category`, `active` bool,
`notes`, `created_at`/`updated_at`. Seed the working behavioral-health set with
our own wording: 90791/90792 diagnostic evaluations; 90832/90834/90837
psychotherapy 30/45/60 min; 90833/90836/90838 psychotherapy add-ons; 90846/90847
family therapy (without/with patient); 90853 group psychotherapy;
99213/99214/99215 established patient visits (low/moderate/high).
**Reconcile wording with what already ships**: `lib/rate-table.ts:25` (RATE_CODES)
has live UI labels for the five core codes — the seed must match those exactly
where they exist so copy doesn't fork; invent consistent phrasing for the rest.
Flag all wording in the report as draft/editable content, not final copy.

## 2 — PFS RVU ingest → `cms_rvu`
Source: https://www.cms.gov/medicare/payment/fee-schedules/physician/pfs-relative-value-files
Download the LATEST CY2026 release zip (RVU26B = April; check whether a newer
RVU26C/July update is posted — take the newest). Save under `.harvest/cms/`
(gitignored; download the whole zip before unzipping — central directory is at
the end). **Verify or refute before schema**: unzip, print the PPRRVU header row
and 3 sample data rows, and build against the REAL column names. Heads-up: the
PPRRVU CSV historically opens with several rows of copyright/notes junk before
the true header — inspect, don't assume row 1.
Target columns: `hcpcs_code`, `modifier`, `status_code`, `work_rvu`,
`pe_rvu_nonfacility`, `pe_rvu_facility`, `mp_rvu`, `total_rvu_nonfacility`,
`total_rvu_facility`, `global_period`, `source_release` (e.g. 'RVU26B'),
`effective_year`. **EXCLUDE the short-descriptor column entirely** — that text
is AMA-copyrighted CPT carried under CMS's license, not ours to store; put a
comment in the script saying exactly that. Idempotent upsert on
(hcpcs_code, modifier, effective_year); prove by running twice.

## 3 — GPCI + conversion factor
Same zip: GPCI file → `cms_gpci`: `locality_code`, `locality_name`,
`gpci_work`, `gpci_pe`, `gpci_mp`, `effective_year`. Report which NY localities
you find (there are several — Manhattan, NYC suburbs, Long Island, rest-of-NY
etc.). Conversion factor: expected ~$33.4009 non-APM for CY2026 but VERIFY
against the files/docs inside the zip — do not trust this brief. Note there are
TWO 2026 CFs (APM vs non-APM); store both if both are in the docs, in a small
`cms_pfs_config` table (key, value, source annotation), same sql/033.

## 4 — Benchmark view + the payoff query
View `medicare_benchmark_ny` (in sql/033): each NY locality × code present in
`cpt_codes`, non-facility Medicare allowed =
`(work_rvu×gpci_work + pe_rvu_nonfacility×gpci_pe + mp_rvu×gpci_mp) × CF`.
Restrict to payable status codes (likely status_code='A' — verify meaning
against the zip's documentation file and say what you chose).
Then the verification query, in the report: for the five core codes
(90791, 90834, 90837, 90853, 99214), median negotiated rate as % of the
Manhattan-locality Medicare benchmark for the top 5 payers by row count.
Filters — ALL THREE are load-bearing (same set sql/027 uses):
`lower(billing_class)='professional'`, `negotiated_type NOT ILIKE '%percent%'`,
`negotiated_rate > 5`.

## 5 — HCPCS Level II descriptors → `hcpcs_codes` (free AND displayable)
The descriptor constraint exists only on the CPT side. HCPCS Level II
(alphanumeric: H, G, J, T…) is CMS-maintained public data — its official
descriptors CAN be stored and displayed freely. Behavioral-health relevance:
H-codes are the NY Medicaid managed-care workhorse (H0004 counseling, H0015
IOP, H0031, H2019…), G-codes cover Medicare behavioral/telehealth, J-codes are
long-acting injectable antipsychotics.
- Source: the CMS quarterly HCPCS Level II file —
  https://www.cms.gov/medicare/coding-billing/healthcare-common-procedure-system/quarterly-update
  (free, no signup; page 403s default curl — use a browser User-Agent). Take
  the latest quarterly zip → `.harvest/cms/`. Inspect real headers first, same
  rule as step 2.
- `hcpcs_codes` (same sql/033): `code` PK, the real descriptor columns
  (short/long as the file names them), coverage/category fields if present,
  `source_release` (e.g. 'HCPCS-2026-Q3'), `effective_date`, `status`/action
  flag if present. Full file, not a subset. Idempotent upsert on code.
- `scripts/cms/ingest-hcpcs.mjs`.
- Unified lookup: view `service_code_names` (sql/033) = `cpt_codes` rows
  (source 'leuk', our wording) UNION `hcpcs_codes` rows (source 'cms',
  official text) → (code, display_name, source). One surface for future
  typeahead; the NLM Clinical Tables API stays a dev-time lookup convenience
  only (it is Level II only — verified 90791→0 hits).
- KNOWN FACT (verified 2026-07-16, don't re-derive): `provider_rate_signals`
  contains ONLY the five CPT codes (99214 3.07M / 90837 1.94M / 90853 1.83M /
  90791 1.26M / 90834 1.24M) — zero alpha-prefixed rows. The MRF scanner's
  code list was CPT-only. Harvesting H/G/J-code rates = re-scanning MRFs with
  an expanded code list = a separate future task; list it under Open items in
  your report (suggest a Linear ticket), do NOT attempt it here.

## 6 — Licensing note + repo surface
- `scripts/cms/LICENSE_NOTE.md`: AMA license evaluated 2026-07-16 and
  deliberately deferred ($1,050/yr upfront + usage-report royalties; "user"
  definition captures downstream report consumers). Revisit trigger: external
  providers onboarding to Leuk for coding workflows needing the full
  searchable CPT vocabulary with official descriptors. Until then: own
  descriptors only, bare codes as keys, no AMA descriptor text stored or
  displayed. Record the asymmetry: HCPCS Level II descriptors are public and
  freely displayable — the constraint is CPT-only. NLM Clinical Tables HCPCS
  API is Level II ONLY (probed 2026-07-16: 90791→0 hits) — dev-time lookup, not
  a CPT source.
- `lib/repos/admin.ts:105`: flip the `planned("cpt_codes", …, "NYS-50")` entry
  to a live `table(...)` row; add `cms_rvu`/`cms_gpci`/`hcpcs_codes` rows to
  the /admin/data listing in whichever section fits (read the file's grouping
  first).

## Hard requirements
- Scripts in `scripts/cms/` (new dir), style-matched to `scripts/mrf/` and the
  header-comment bar set by `scripts/nppes-sync.mjs`; streaming-friendly;
  retries/error handling self-contained.
- CMS downloads need no credentials — if any page demands auth, STOP and report
  rather than working around.
- Show real file headers + sample rows in the report, per step 2.

## Out of scope
AMA API integration (superseded brief). PPL API. Any UI surfacing of benchmarks.
Adding a code column to `services`. Harvesting H/G/J-code RATES from MRFs
(future scanner-expansion task — Open item only). Facility-rate benchmarks
(non-facility only this pass — note facility columns are ingested for later).

## Done when
1. `cpt_codes` seeded (own wording, matches RATE_CODES labels), `cms_rvu` +
   `cms_gpci` + `cms_pfs_config` + `hcpcs_codes` populated,
   `medicare_benchmark_ny` + `service_code_names` live.
2. Report shows: real PPRRVU + HCPCS header proof, NY locality list, verified
   CF, the five core codes' NY (Manhattan) Medicare benchmark dollar amounts,
   the %-of-Medicare table (5 codes × top-5 payers), and H0004/H0015/J0401
   resolving to official descriptors in `hcpcs_codes`.
3. Both ingests re-run as no-ops (prove it).
4. /admin/data renders the new tables; `npx tsc --noEmit` clean.

## Working agreements
Stage ONLY your own files (`git add <paths>`, never `-A` — concurrent sessions
share this tree). Commit locally; do NOT push. Never print secrets. Downloads
under `.harvest/cms/` only. Report to `docs/reports/2026-07-16-cms-rvu.md`,
60-line cap, sections: Shipped / DB changes / Decisions / Open items / Gotchas.
Linear (NYS team): this task closes NYS-50 (cpt_codes) — mark it Done with a
one-line comment; file+close a ticket for the benchmark layer itself; every
Open item in your report (incl. the H/G/J MRF scanner expansion) gets its own
open Linear ticket. If you lack Linear access, say so in the report instead.
