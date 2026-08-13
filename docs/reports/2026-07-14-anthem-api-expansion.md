# 2026-07-14 — Anthem API expansion (NYS-53 epic)

_Updated 2026-07-15: five-resource harvest now RUNNING concurrently (see Decisions)._

## Shipped
- NYS-54 qualifications — `sql/028_provider_qualifications.sql`, `scripts/extract-qualifications.mjs` (commit 9f01506).
- NYS-53 harvester + recon — `sql/029_anthem_resources.sql`, `scripts/ingest-anthem-resources.mjs`, `scripts/probe-anthem-resources.mjs` (commit 56f6bf1).
- Linear — epic NYS-53 + subs NYS-54..60; NYS-54 Done.

## DB changes
- `provider_qualifications` (sql/028): 0 → **69,416 rows / 19,160 providers** (24,241 licenses incl. 16,979 NY; 15,821 degrees; 29,354 specialties).
- sql/029 created 5 tables. Full harvest IN PROGRESS: `fhir_locations` ~1k→climbing (34,861 target); `fhir_organizations`/`fhir_org_affiliations`/`fhir_healthcare_services`/`fhir_insurance_plans` still at smoke values (3/2/34/100) — `--resource=all` runs phases sequentially, location first.
- No matview changes.

## Decisions
- REVERSED "hold for go": started the five-resource harvest CONCURRENTLY with the running PractitionerRole harvest (concurrency 5). Rationale: no per-call cost (flat plan); the five resources are shared/deduped grain (34,861 locations for 106k providers), and at 80k probed ~95% of distinct locations/orgs are already discovered, so it runs in parallel now and a cheap idempotent re-run sweeps stragglers after the primary finishes.
- Escape hatch is AUTOMATIC: watcher b828nyzc9 auto-kills the five-resource harvest (by PID) if the primary near-stalls (<150 probed/3min ×2) OR sustained 429s appear; primary untouched.
- Separate OAuth client, not an edit to the running `ingest-payers.mjs`.
- Work enumerated from cheap columns (`location_ref`, `org_affiliations.org_ref`, `payer_networks.raw_network_id`), not JSONB scans.
- OrganizationAffiliation searched per-org (primary ∪ participating); sparse (~2/60 orgs) — correct, filter verified.
- Batched upsert via `jsonb_to_recordset`; text[]/jsonb serialize correctly.

## Open items
- Five-resource harvest running now; after it + the primary finish, re-run `--resource=all --resume` to catch stragglers.
- Re-run `extract-qualifications.mjs` post-primary (catches NPIs added since 19,160).
- NYS-60 (incremental `_lastUpdated`): not built. No UI surfacing of qualifications / fhir_* yet.

## Gotchas
- Watchers track by PID (harvest 51524, babysitter 5186), NOT `pgrep -f` — a pattern match self-matches the watcher's own command line (first watcher b4lq8wuke hit this; killed + relaunched).
- Row counts LAG mid-run: 500-row batch-flush, so a phase shows 0 rows until item 500.
- Checkpoints in `os.tmpdir()/leuk-anthem-<resource>.json`; `--resume` honors them.
- Anthem = Provider Directory scope only — no rates/TIN/member data; `patient360`/`fhir.anthem.com` forbidden.
- Pushes STOOD DOWN per Brendan — commits local only. Shared `main` also carries another session's 4 unpushed "Published rates" commits.
