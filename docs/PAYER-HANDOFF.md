# Payer Insurance-Network Harvest — Handoff

_Last updated 2026-07-11 (overnight harvest session). A fresh session should be able to resume from this file alone._

## RUN STATE (updated 2026-07-11 ~14:55 ET) — read this first

**HEADLINE: 15,562 of 99,105 providers (15.7%) have ≥1 in-network record across 4
payers** (500 of those are Healthfirst coarse rows; full-quality = Cigna+Humana+UHC).
Was 2,148 / 2.2% / 1 payer at session start.

- **✅ CIGNA COMPLETE (14:49 ET, finished clean, 0 errors).** All 99,105 NPIs probed:
  12,907 hits (13.0%) → **12,752 distinct NPIs · 115,900 rows · 226 networks ·
  97.7% accepting**. **EVERNORTH/EBH = 11,922 NPIs (93.5% of matched)** — the
  Evernorth thesis fully confirmed at scale. `status='live'`.
- **✅ Humana Path B COMPLETE (11:08 ET).** 4,524 NPIs · 86,339 rows · 135 networks ·
  98.2% accepting · 808 unmatched parked. `status='live'`.
- **▶ UHC — RUNNING** (open public API, no registration; base
  `flex.optum.com/fhirpublic/R4/`) — **19% hit rate**, projects ~18-19k matched
  (would become our biggest payer). Two-step enrich driver; log
  `.harvest/uhc-full.log`, checkpoint `.harvest/uhc-enrich.json`. ~1 day.
  **See PAYER-RESEARCH.md "★ THE CENTRAL FINDING"** — UHC publishes Behavioral
  Commercial/Medicaid as EMPTY SHELLS; re-verify at completion with
  `node --env-file=.env.local .harvest/uhc-shell-check.mjs`.
- **✅ MVP COMPLETE (23:19 ET 07-11, zero errors).** 20,675 NPIs (20.9% — LARGEST
  payer) · 638,561 rows · 18 networks · 95.6% accepting · **MVP EPO/PPO commercial
  = 99.7% of matched roster** (the Carelon control, full scale). status='live'.
- **✅ Healthfirst coarse COMPLETE** (rerun recaptured all 3,286 listings; coarse
  rows count in the filter per Brendan, accepting stays unrendered). status='live'.
- **CDPHP + Molina: probed and parked** (no deterministic join key; evidence in
  `.harvest/cdphp-recon/` + research-doc registry). **Aetna + Anthem: submitted,
  awaiting approval emails** (see payer-registration-checklist.md).

Babysitters: `.harvest/babysit.sh` (auto-`--resume` on crash, halt for good on
KILL SWITCH). Resume commands: `.harvest/RESUME.md`. Neon conn-blips: flush
retries once then crashes for restart; next recurrence → drop that job to
concurrency 2 (Brendan's rule).

**Two hard-won bug fixes (both in `scripts/ingest-payers.mjs`, uncommitted):**
1. **Cigna 0-rows root cause found**: Node fetch (WHATWG URL) leaves `|`
   unencoded in query strings and Cigna hard-400s a raw pipe. Every prior Cigna
   run failed on 100% of requests because of this. `roleQuery` now sends `%7C`.
   (curl encodes it, which is why manual probes measured 12.9%.)
2. **Humana location OR-list limit is 50, not ≥100**: 50 ids (3.3k URL) → 200
   JSON; 75+ ids (≥5k URL) → HTTP 200 **Firely Auth HTML page**; POST `_search`
   → Akamai 403. `--loc-batch` defaults to 50.

**Status check:** `node --env-file=.env.local .harvest/status.mjs --networks`
**Resume by hand if dead:** relaunch the same babysit lines (see `.harvest/RESUME.md`).

Adds insurance-network data (which plans a provider is in + accepting-new-patients status) to
our ~99k NY behavioral-health providers, by harvesting payer FHIR **Da Vinci PDex Plan-Net**
directories under the CMS interoperability mandate. NPPES stays the source of truth for
provider identity; payers only enrich.

---

## Current DB state (what's actually harvested)

**Headline: 2,148 of 99,105 distinct providers (2.2%) have ≥1 in-network record, across 1
payer (Humana only).** Everything else is scaffolding awaiting a harvest.

| Payer | participation rows | distinct NPIs | accepting (distinct NPIs) | networks | unmatched |
|---|--:|--:|--:|--:|--:|
| **Humana** | 40,682 | 2,148 | 2,109 | 131 | 88 |
| Cigna | 0 | 0 | 0 | 0 | 0 |
| Healthfirst | 0 | 0 | 0 | 0 | 0 |
| all others | 0 | 0 | 0 | 0 | 0 |

Humana's number is **partial** — its reverse-lookup was stopped at ~44% (index 43,348 of 99k;
checkpoint state below). **Do NOT resume that reverse-lookup** — Humana is re-routed to a walk
(see Routing). Existing Humana rows stay valid (same idempotency key) and the walk upserts over
them. Cigna wrote 0 (every run was an unlucky low-NPI slice or killed before it hit rows).

The read layer is **already committed** (`lib/repos/networks.ts` + `lib/mock/networks.ts`, in
commit `250877d`) and validated against the live DB — the insurance badge on provider cards is
unblocked against real data now, independent of further coverage. UI brief:
`docs-payer-networks-ui-brief.md`.

---

## Schema (migrations applied to live Neon)

- **013** `payer_sources`, `payer_networks`, `provider_network_participation`,
  `payer_unmatched_npis`. (Named `payer_sources`, NOT `payers` — that's the billing table.)
  Idempotency key: `(npi, payer_source_id, network_id, location_ref)`.
- **014** capability/probe columns on `payer_sources`: `auth_strategy`, `pagination_strategy`,
  `supports_include`, `supports_lastupdated`, `bulk_export_url`, `ig_version`,
  `role_cardinality`, `status`, `last_probe_at`, `last_probe_result` JSONB, `max_last_updated`.
- **015** `data_completeness` (`full`|`coarse`) + `network_id` nullable + partial unique index
  `uq_pnp_coarse (npi, payer_source_id, location_ref) WHERE network_id IS NULL` — so coarse
  (Healthfirst) rows stay idempotent without a network.

`payer_sources.last_probe_result` holds the raw capability probe per payer.

---

## The hard rules (non-negotiable)

1. **Never harvest a sandbox** — synthetic data. Any URL with `devportal|sandbox|sbx|demo|
   test|dev|vte|staging` is a sandbox. Never write its data.
2. **Provider Directory ONLY, never Patient Access** (member PHI behind login/consent). Note
   Aetna's directory and Patient Access share a host (`apif1.aetna.com/fhir/v1`) on different
   paths — a path typo crosses the line.
3. **Never touch clearinghouses** (Optum/Availity/Change Healthcare/Waystar/Claim.MD — EDI
   270/271/837). Exception: a payer's *behavioral-health network directory* if it serves
   Plan-Net; judge by the API, not the brand.
4. **"Public" ≠ "no auth."** CMS "public" = no member consent, not no credentials. A 401 is a
   finding (→ registration checklist), not a failure.

Plus: enrich-only (never create a provider row from payer data); a truncated crawl is a
correctness bug → mark the payer `probing`, never `live`; don't fabricate coverage (zero is
honest).

---

## Measured payer facts (probed, not assumed)

**Both Cigna and Humana cap `_count` at 100** (page size). Neither exposes a server-side
geographic filter on `PractitionerRole`.

**Humana** (`https://fhir.humana.com/api/`, no auth):
- WAF (Akamai) blocks **chained** params (`practitioner.identifier=`, `location.address-state=`)
  and rapid bursts — but **NOT plain `specialty=`** (returns 200; national totals below). A
  chained param ≠ a token param.
- `location=` is a reference param and **accepts comma-separated OR-lists**; batch **≥100**
  Location ids per request works (URL ~7.4k chars OK). Roles **carry location refs** → geo-
  boundable. `Location?address-state=NY` → **total 75,993**.
- National BH role totals (Σ ≈ **1,463,203**): Psychiatry 210,063 · Clinical SW 538,538 ·
  Psych NP 290,720 · MH Counselor 179,364 · Psychologist(103T*) ~166k · MFT 42,046 · others
  small. Networks are national/multi-state, **Medicare-Advantage-skewed** (weak NY commercial).
- Full Plan-Net: `network-reference` (name in `display`), `newpatients`, NPI on included
  Practitioner. Reverse-lookup hit rate ~5% (a method artifact, not its real footprint).

**Cigna** (`https://fhir.cigna.com/ProviderDirectory/v1/`, no auth, IG 1.0.0):
- Anonymous; `specialty` + `_include(practitioner|location|network|organization)` +
  `_lastUpdated` + `link.next` all work. **NPI present**, **newpatients present**. Network
  NAME is on the `_include`'d **Organization**, NOT `network-reference.display`.
- **Reverse-lookup works**: `PractitionerRole?practitioner.identifier=<us-npi>|<npi>`.
  Random-sample hit rate **12.9%** (higher than Humana). Use `_include=PractitionerRole:network`
  ONLY — the 3+ include combo transiently **400s** (Cigna is flaky: transient 400s + occasional
  empty pages; retry clears them).
- **Cannot be geo-bounded**: roles carry **no location reference**, chained `location.*` returns
  0, `location=` batch caps ~25 (403 at 50, URL/WAF), and Cigna returns **no `Bundle.total`**
  (national walk length not even projectable).

**Healthfirst** (`https://hf-fhir-provider-directory-sys-api-prod.us-e1.cloudhub.io/`, no auth):
- Bare `PractitionerRole` — **no network-reference, no newpatients**. NPI present and the
  **practitioner ref id IS the NPI**. No `_count`, no `_include`, no pagination; **100-row cap**
  per enumeration slice → truncation risk. **Point-query `?practitioner.id=<npi>` sidesteps the
  cap entirely** (matched by construction). → **coarse** presence only.

**Gated / not open** (→ registration checklist): **Aetna** (token; Commercial+Medicare endpoint
has **`$export`** NDJSON bulk + NPI search — best next target), **Elevance** (HTML portal SPA),
**CareFirst/Molina** (developer portals), **LA Care** (unreachable).

---

## Settled routing (per payer)

- **Cigna → reverse-lookup.** Only NY-bounded option (matched = NY by construction; roles have
  no location to geo-filter, no total to project a walk). Query:
  `PractitionerRole?practitioner.identifier=http://hl7.org/fhir/sid/us-npi|<npi>&_include=PractitionerRole:network&_count=50`.
  Downside: no discovery of providers we don't already hold. ~99k requests, 12.9% hit.
- **Humana → Path B, NY-location-scoped walk.** Enumerate `Location?address-state=NY` (75,993 →
  ~760 pages), batch ids into `location=` OR-lists (≥100), walk `PractitionerRole?location=<batch>`
  following `link.next` per batch, filter BH client-side (this auto-covers the 103T*/103G*
  psychologist families without subcode enumeration). Projected ~2,300–2,800 requests, fully
  NY-bounded, and it **discovers** unmatched NY providers. **Do NOT resume the 44% reverse-lookup.**
  (Projections: national walk ~14,650 req / Path B ~2,500 / reverse-lookup 99k.)
- **Healthfirst → point-query coarse.** `?practitioner.id=<npi>` per our NPI; write ONE coarse
  row per hit: `network_id = NULL`, `accepting_new_patients = 'unknown'` (never guessed),
  `data_completeness = 'coarse'`. Report its matched count **separately** so the headline stays
  honest.

The ingester (`scripts/ingest-payers.mjs`) already implements `walk`, `reverse`, and `coarse`
drivers + the `enrich` (Humana two-step) legacy driver. Path B (location-batch walk) is the one
NEW driver still to build.

---

## Ingester + DB-safety (built; keep)

`scripts/ingest-payers.mjs` — config-driven `PAYER_REGISTRY`, per-payer `defaultMode`. Flags:
`--payer --mode --concurrency --delay --limit --resume --wait-for-unblock --report-only`.
Hardened: WAF/403 + transient-400 retry with backoff, circuit breaker (`--cooldown`),
`--wait-for-unblock` preflight, final retry pass, local checkpoints, `stripNarrative` (drops
`text.div`), 500-row batched upserts, **kill switch** (any DB write error halts the run).
`scripts/probe-payers.mjs` — read-only capability prober (writes only `last_probe_result`).
`scripts/lib/mh-taxonomy.mjs` — the editable behavioral-health NUCC include-set.

DB constraints (Neon 1 CU, previously overwhelmed): batch 500-row upserts · ≤5 total
connections across jobs · ≤3 HTTP concurrency per payer · never hold a txn across an HTTP
request · checkpoint to local file · strip `text.div` · kill switch, no tight retry loops.
**Before any full walk: run one bounded slice, report timing + counts, confirm DB health.**

Run examples:
```
node --env-file=.env.local scripts/probe-payers.mjs
node --env-file=.env.local scripts/ingest-payers.mjs --payer=cigna --concurrency=2 --delay=100
node --env-file=.env.local scripts/ingest-payers.mjs --payer=<x> --report-only
```

---

## Humana reverse-lookup checkpoint (preserved — do NOT resume)

`{"mode":"enrich","index":43348,"stats":{"probed":43348,"hits":2168,"matched":34159,
"participation":40682,"pages":2181}}` — was at `$TMPDIR/leuk-ingest-humana-enrich.json`,
copied to `docs/humana-reverse-checkpoint.json`. Kept only as a record; routing abandons it for
the Path B walk.

---

## Open items for the next session

1. Build the Path B NY-location-batch walk driver; run Humana Path B (one bounded slice first).
2. Re-run Cigna reverse-lookup to completion (nothing persisted yet).
3. Run Healthfirst coarse point-query.
4. Write `docs/payer-registration-checklist.md` — **Aetna first** (`$export` NDLJSON → `COPY`
   into a staging table + set-based upsert, not row inserts; registration submitted, 2–4
   business-day review), then Anthem (longest lead), UHC, Elevance, CareFirst, Molina, LA Care.
5. Recompute the headline once Cigna + Humana-walk land; report `full` vs `coarse` separately.
