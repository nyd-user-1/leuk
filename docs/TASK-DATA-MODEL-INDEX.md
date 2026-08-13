# TASK — Data-model index: every top-level entity we have, need, or are missing

_Brief for a fresh session (read-heavy, write-one-doc). Deliverable:
**docs/DATA-MODEL.md** — the single map of Leuk's data world, with Mermaid
ERDs. Brendan: "we have networks, insurers, providers, plans, books, rates…
I can't even imagine all you found via the MRFs and the API scans. I'd
benefit from an index of all the top-level ERDs we need, have, or are
missing." Linear: NYS-31._

## Sources to read (all in-repo; no crawling needed)

- `sql/001–017` — every live table. Key clusters: practice/EHR core (001–002),
  external directory (003–007: directory_providers/programs + NPPES
  enrichment), provider profiles/leads/onboarding (008/010/016), payer FHIR
  layer (013–015: payer_sources, payer_networks,
  provider_network_participation, payer_unmatched_npis, capabilities),
  TiC rates (017: provider_rate_signals).
- `docs/PAYER-RESEARCH.md`, `docs/MRF-RESULTS.md`, `docs/MRF-QUEUE.md` — what
  the crawls actually taught us (the conceptual entities live here, not in SQL).
- `docs/TASK-KYR-PHASE2.md` (pending tables: tin_registry, sql/018
  provider_affiliation_attestations), `docs/TASK-TELEHEALTH-GAP.md`.
- `lib/repos/*.ts` — the read-model vocabulary (what the app already names).
- `BUILD_SPEC.md` — the original entity model for the practice-management core.

## What DATA-MODEL.md must contain

1. **Have — physical ERDs (Mermaid), grouped by domain:**
   - Practice core: users/practitioners/clients/appointments/notes/invoices/
     insurance_policies + billing `payers` (NOT the same as payer_sources —
     document that collision explicitly).
   - Public directory: directory_providers/directory_programs (+ provenance
     values of `source`, incl. the new manual-NPPES demo rows).
   - Payer directory (FHIR): payer_sources → payer_networks →
     provider_network_participation (+ accepting_new_patients semantics,
     payer_unmatched_npis).
   - Rate signals (TiC): provider_rate_signals (+ the display rules that
     govern reads; the UNIQUE-key dedup contract; file_date vs as_of).
2. **Concept glossary — the entities reality forced on us** (one paragraph +
   where each shows up in data): *insurer/licensee entity* (reporting_entity_name;
   BCBS = 30+ licensees sharing hosts; state-code prefixes) · *network* vs
   *plan* vs *book* (a payer's published rate file ≠ a network ≠ a purchasable
   plan; Empire's "book" was a BlueCard catalog) · *BlueCard reach vs NY
   membership* · *contract holder / TIN* (practice P.C. vs platform P.C. —
   Headway = NEW YORK MEDICAL BEHAVIORAL HEALTH SERVICES) · *carve-out
   administrator* (Optum OHBS, Carelon/Beacon, Evernorth) · *group roster vs
   clinician* (NPI-2 vs NPI-1).
3. **Missing — named and prioritized** (with which product each blocks):
   - plan ↔ network mapping (which purchasable plan uses which network —
     needed before any patient-facing "your plan covers X" claim);
   - organization entity table (TINs are strings today; tin_registry is only
     names — no org⇄org, org⇄location structure);
   - liveness/utilization signals (attestations sql/018 is the seed; CMS
     Utilization File when finalized);
   - member/coverage linkage (insurance_policies ⇄ payer_sources ⇄ plan —
     currently three disconnected vocabularies);
   - out-of-state license expansion of directory_providers (NYS-26);
   - Empire NY rates (NYS-25), walled payers (NYS-28/29/30).
4. **One top-level "world map" diagram** tying the four domains together
   through their join keys (npi, tin, payer name/slug, plan) — and marking
   which joins are solid (npi), fuzzy (payer name regex), or missing (plan).

## Rules

- Document, don't refactor: no schema changes, no code edits — one new doc
  (plus optional docs/img if diagrams need splitting). Mermaid must render on
  GitHub.
- Name collisions and fuzzy joins are FINDINGS, not embarrassments — call
  them out loudly (payers vs payer_sources; payer-name regex bucketing in
  rollup.mjs/rate-signals.ts).
- Where a concept exists in docs but not schema, say "documented, unmodeled"
  — that's the "need" column Brendan asked for.
