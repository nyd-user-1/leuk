# 2026-07-15 — HANDOFF: /published-rates 2.0

Pushed to `main` at `20f237a`. Nothing in flight. Working tree clean except
`docs/TASK-PHOTON-PHASE2.md` (another session's — left alone).

## State of the page

`/published-rates` (signed in, `(app)` route). 38,716 rows across 6 payers.

| | |
|---|---|
| Named | **36,963 / 38,716 = 95.5%** (was 90.9% at session start) |
| Rows showing dollars | 14,490 (`n_leaves = 1`) |
| **Group headers** (empty, chevron) | **24,226 (63%)** |
| Headers over the cap, no children | 242 → link to `/orgs` |
| Child rows | 129,490 |

A billing ID with >1 published row is a **group header**: label + chevron, empty
across every rate column. Children are one row per (NPI, network, setting) —
what the payer literally published. Every rate cell is a dollar or a blank.

## The one thing to look at first

**63% of rows are empty headers and they sink to the bottom under the default
`90837 desc` sort.** This shipped without review. A browsing provider sees mostly
rows that say nothing until opened. Options: default-expand, sort headers
differently, or reconsider which rows become headers. Brendan has not reacted to
this yet — do not assume it is accepted.

## Commits (all on main)

- `b1d851a` naming from the full NPPES file; `entity_kind` from `sole_proprietor`
- `775a32b` NPPES weekly sync + endpoint/taxonomy reference; refresh routine in `sql/README.md`
- `750a27c` clinician sub-rows + rate counts *(design superseded by 20f237a)*
- `52e3bfd` 584 nonprofit groups named from IRS EO data (ProPublica)
- `9caead4` reports for 750a27c + 52e3bfd
- `20f237a` group headers; network/setting as columns

Reports: `2026-07-15-published-rates-final.md`, `-nppes-infrastructure.md`,
`-published-rates-tree.md` (marked superseded), `-ein-enrichment.md`,
`-published-rates-group-header.md`.

## DB — ahead of nothing, but built by hand

Every migration is committed, but the DATA exists because it was loaded this
session. A fresh clone + `sql/` gives empty tables. Loaders are in `sql/README.md`.

- `sql/030` **`nppes_npi` 9,671,888 rows** (full NPPES, nationwide, both entity types)
  + `nppes_other_names` 719,947
- `sql/031` `nppes_endpoints` 556,512 (45,902 FHIR) · `nucc_taxonomy` 883 · `nppes_sync_log`
- `sql/032` `rate_table_child_mv` 129,490
- `sql/027` `rate_table_mv` 38,716 (+ `n_rates` per code, `n_leaves`)
- `tin_registry` 29,742 (+584 `source='irs_eo'`)

## Open tickets

- **NYS-64** (High) — `scan-tic.mjs` drops `billing_code_modifier`. Explains the
  ~9% of leaves still reading "N rates" (one NPI, one network, one setting,
  several prices, every stored column identical). Also the reason Aetna scores
  4% single-rate and is excluded — **that is 7.9M of 9.3M rows riding on a stat
  that may be measuring our own data loss.** Blocked on signed URLs.
- **NYS-66** (Med) — 1,480 for-profit groups IRS EO cannot name (they file no
  990s). The MRF `business_name` sidecar is the only route keyed on the EIN
  itself; same signed-URL fetch as NYS-64. Do them together.
- **NYS-63** (Med) — consolidate identity onto `nppes_npi`. `nppes_organizations`
  is 100% contained in it (104,060/104,060); `directory_providers` 99.9%.

## Not done, from the genesis brief

1. **Nobody has seen it.** The original plan was to show Leuk Psychiatry the
   same night and watch the reaction. Two sessions on the artifact instead.
2. **It is behind sign-in.** The genesis doc says "public, no login" three times;
   a derived brief contradicted itself and auth won. That blocks self-serve
   distribution, not a demo.
3. **The header sentence is removed** ("Cigna pays N different rates for a
   60-minute session"). It is the thesis, computed, not a percentile.
4. **Codes never expanded** — still 5 (90832, 90847, 90792, 99213, 99215 open).
5. **The API was never built** (`/rates/peers?npi&code` etc.). Note `/directory`
   already IS that endpoint rendered.

## Gotchas

- **`place_of_service` is a pipe-joined list**, not a scalar. Office contains
  `11`; facility contains `21|22`. Real price difference (Dart 90791: $137.47
  office / $133.02 facility).
- **`CSTM-00` is Cigna's own marker, NOT a facility code.** The $1,183 Boston
  Children's rate lives there. Do not filter it as a facility rate.
- **`tin` is not a TIN.** It is whichever identifier the payer chose — `ein:` or
  `npi:`, payer's choice. Never label it "TIN".
- **NPPES holds no EIN** (0 of 9.67M). EIN→name is impossible there.
- **The dev server caches repo reads in-process for 1h.** An MV rebuild alone
  does not show up until restart. `.next` reached 1.5GB this session; `rm -rf`
  it when the server feels slow.
- **The undici 300s `headersTimeout` is not Neon's ceiling** (NYS-65) — long
  scans go through psql, not the node driver.

## A regret worth recording

The per-payer cap fix (Hackensack → 41 children) was verified and reviewed on its
own, then bundled into `20f237a` with the group-header rework instead of being
committed separately. Brendan asked to roll back to exactly that point and there
is no commit to return to. Reconstructible in ~10 min: revert `20f237a`,
re-apply the `2..100` children-per-(tin,payer) gate to `sql/032`, rebuild both
MVs. Checkpoint a verified change before starting the next one.
