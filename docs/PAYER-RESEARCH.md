# PAYER RESEARCH — Leuk

**Companion to `docs/PAYER-HANDOFF.md`.**
That file is *how the machine works* (schema, drivers, measured API facts).
**This file is *which payers matter and why*** — the registry, the strategy, and the
data-quality reality that shapes how we present this data to patients.

Last updated: July 11, 2026

---

## 1. THE STRATEGIC PICTURE

### Why Cigna is the most valuable payer we can reach

**Confirmed empirically (July 11, 2026):** of the first 324 matched Cigna NPIs, **311 (96%)
are in EVERNORTH BEHAVIORAL HEALTH networks.** Top networks: EVERNORTH BEHAVIORAL HEALTH
(311), EBH NATIONAL STANDALONE NETFLEX (252), EBH EAP (84).

Evernorth is Cigna's behavioral-health arm (renamed from Cigna Behavioral Health, Sept 2021).
Cigna's NY directory is not *incidentally* behavioral — it's **essentially all** behavioral.

**Why this matters so much:**

**Optum Behavioral Health, Carelon Behavioral Health (ex-Beacon), and Magellan Healthcare
publish NO standalone FHIR provider directories.** The CMS mandate (CMS-9115-F) falls on the
*payer/plan*, not on the subcontracted managed behavioral health organization (MBHO). So
behavioral-health network data must flow into the **parent plan's** feed — and frequently
doesn't.

**Evernorth is the exception.** It appears fully integrated into Cigna's public, anonymous
FHIR directory. **It is the only major behavioral-health carve-out network reachable through
a public API.** For a psychiatry-first product, this single payer may be worth more than the
rest combined.

### The carve-out map (which NY plans delegate behavioral health to whom)

| Plan | Behavioral health managed by |
|---|---|
| Empire Plan / NYSHIP | **Carelon** (confirmed — 24hr clinical referral line on cs.ny.gov) |
| EmblemHealth | Historically Beacon→Carelon; **moved in-house** after the Feb 2026 AG settlement |
| MetroPlusHealth | Beacon→Carelon |
| MVP Health Care | Carelon |
| Empire BCBS (Anthem/Elevance NY) | Carelon |
| Fidelis (Centene) | In-house / Centene-managed |
| Healthfirst | In-house |
| **Cigna** | **Evernorth — AND IT'S IN THEIR FHIR DIRECTORY** |
| CDPHP, Excellus | Unconfirmed — likely internal/regional |

**Implication:** for every payer except Cigna, assume behavioral-health providers may be
**missing or stale** in the parent's FHIR feed. Test, don't assume.

---

## ★ THE CENTRAL FINDING — UHC publishes its commercial behavioral network as an EMPTY SHELL (2026-07-11)

In UnitedHealthcare's public Plan-Net directory (`https://flex.optum.com/fhirpublic/R4/`,
production, anonymous), the behavioral-health carve-out is **structurally acknowledged and
substantively unpublished** for the commercial book. This is a **mechanism, not a symptom** —
UHC didn't omit behavioral health from the schema; they published the networks and attached
nobody to the commercial one. It confirms, from both directions, that **Cigna/Evernorth is
the only complete commercial behavioral-health network reachable through any public API.**

### 1. The empty shells (the citable core)

UHC's feed declares **six dedicated behavioral networks** as `Organization` resources with
`type=ntwk`. Exact role counts, measured **2026-07-11T18:44Z** via
`GET [base]/PractitionerRole?network=Organization/{id}&_count=1`
(note: the server caps `Bundle.total` at 10,000 — an unfiltered all-roles query also reports
exactly 10,000, so 10,000 means "≥10,000"):

| Behavioral network | Organization id | PractitionerRoles |
|---|---|--:|
| **Behavioral Medicare** | `xDLOTOYNVrOijVMWTIq7RVCzwtVLw5lVUmKN3a8am9Y` | **≥10,000 (capped)** |
| **Behavioral Commercial** | `RD5noSllOKFrviCTcT84MBscCGOVG8R4wVHKfn8ORl1` | **0** |
| **Behavioral Medicaid** | `s4LOPHRDhKxyDelxihCKYBSViy5l3o3fV3OaG6L1Pk5` | **0** |
| Behavioral Compass HMO | `WiJNdDec0aSSHIrYFwBY8bNiQsWgjDOrRUcS8RUIPH8` | **0** |
| Behavioral UHC Core Essential HMO | `b3gDaUqgDelT0Hljlm0mM31ehJ8yk68rzlB9dU2RfMY` | **0** |
| Behavioral Navigate EPO | `UPlgxwPJ3Vos4Num14OLS67Jk8rUeRYEYJr764TbSiw` | **0** |

Declared but empty. Not missing from the schema — **published as empty shells.** The one
populated network is the book Medicare regulation watches most closely; the empty one is
precisely the book **Optum Behavioral Health manages.** (Defacto's defect class — "missing
practitioner-to-plan relationships" — applied *selectively by line of business*.)

**Verification protocol:** when the 99k-NPI harvest completes, re-run
`node .harvest/uhc-shell-check.mjs` (re-measures all six counts + our DB's per-network
matches). **If Behavioral Commercial still links zero roles after 99,105 probes at an 18.6%
hit rate, the finding is dispositive.**

### 2. Oxford and Empire Plan/NYSHIP are ABSENT from the feed entirely (second finding, NY-specific)

- Zero `type=ntwk` Organizations match Oxford / Freedom / Liberty / Metro (1,752 network
  orgs total in the feed). Zero match Empire / NYSHIP.
- `InsurancePlan?name=Oxford` → total 0.
- No separate Oxford tenant exists: `oxford.fhir.flex.optum.com` / `oxhp.fhir.flex.optum.com`
  don't resolve, UHC's own interoperability documentation contains **zero mentions of
  Oxford**, and no Oxford interoperability page could be found anywhere.

Oxford is one of the largest commercial books in New York and falls under the same CMS
mandate for its MA and exchange products. Its provider directory is **not publicly published
anywhere we could find** — a documented absence, not a hidden endpoint. Empire Plan/NYSHIP
(UHC-administered medical; Carelon BH) is likewise absent.

### 3. The TPA asymmetry (structural evidence, not technical failure)

At ~3% of the harvest, NY BH providers under **UHC-administered self-funded employer plans**
vastly outnumber those under **UHC-insured commercial products**:

- Administered (TPA book): Stanford Health Care **337** · Medica B/D/E/H **~520** ·
  Wespath **206** · MnFIRE **65**
- Insured commercial, ALL products combined: **~70** (Choice Plus 9 · NexusACO 11 ·
  Charter 8 · Select 8 · Doctors Plan 8 · Oscar NY 26)

**When UHC is the administrator, behavioral health publishes. When UHC is the insurer — when
the BH book belongs to Optum Behavioral Health — it doesn't.** The pipeline demonstrably
works; the carve-out data is what's withheld. That's structural, not technical.
_(Sample counts; the full run will replace them — the direction is already unambiguous.)_

### 4. The MVP control (probed 2026-07-11) — and the evidence hierarchy

MVP Health Care delegates behavioral health to **Carelon** — a carve-out plan, like
UHC-commercial/Optum-BH. Its public directory (`api.mvphealthcare.com/provdirfhirapi/`,
production, anonymous) was probed as a control, then fully harvested 2026-07-11
(all 99,105 NPIs, zero errors): **MVP publishes behavioral-health providers under its
COMMERCIAL networks at full depth.** Full-scale numbers: **20,675 matched NPIs (20.9%
hit rate — our largest payer, ahead of Cigna's 12,752)**, 95.6% accepting, and
**`MVP EPO / PPO` (commercial) carries 20,611 of them — 99.7% of the matched roster**,
alongside employer trusts (Kodak 20,183, 1199 National Benefit Fund 20,610, NY44
20,610) and government products (Medicaid 4,248, Essential Plans 5,103, CHP 4,259).
No Carelon-branded network exists in the feed (18 networks, all MVP-named) — the
carve-out publishes into the parent's networks, as expected.

**So a carve-out does not force non-publication.** The UHC empty shell is a choice, not
a structural inevitability of carve-outs.

**The evidence hierarchy (record this; do not let MVP be read as a control it isn't):**

1. **Strongest — within-payer, UHC's own feed:** the TPA-vs-insurer asymmetry. UHC
   publishes BH normally for self-funded employer plans it administers (Stanford,
   Wespath, Medica) and publishes an empty shell for the commercial book it insures —
   same feed, same pipeline, same payer. This controls for everything except who bears
   the risk.
2. **Falsification tests, same feed:** `network=` filtering verified against a
   populated network (UHC Complete → ≥10,000 roles through the identical query shape);
   Behavioral Commercial is `active: true` with stable ids — an active, empty,
   non-deprecated network. Outstanding: the 20-independently-verified-commercial-UHC-
   psychiatrists lookup (demonstrated absence of real providers vs. inference from an
   empty schema) — run before characterizing this externally.
3. **Directional only — MVP:** a different carve-out (Carelon) under a different
   regulatory posture. **Confound:** MVP operates under a 2025 NY AG settlement
   requiring 90-day provider re-verification; UHC-commercial faces no equivalent NY
   pressure. MVP publishing cleanly therefore *refines* the hypothesis (carve-outs
   suppress publication *unless* someone is watching — or Optum BH specifically
   withholds) rather than falsifying it. Had MVP also been empty, that would have been
   a second independent datapoint in the carve-out direction. It wasn't.

### What follows for Leuk

- **Cigna/Evernorth = the only complete public commercial BH source among national
  carriers** (96% of matched Cigna NPIs sit in Evernorth networks; 12,752 matched
  providers at full-harvest completion). Protect and refresh that harvest.
- **UHC = the best Medicaid/Medicare/TPA BH source** (18-19% hit rate).
- **MVP = the Carelon window + likely the freshest data in NY** (AG-mandated 90-day
  re-verification), with commercial BH published. Regional, but high quality.
- The commercial BH gap at the national carriers is real and now mechanism-documented.
  The product differentiator remains corroboration + honesty about confidence, per §2.

---

## 2. DATA-QUALITY REALITY (this shapes the product, not just the pipeline)

Directory data is **documented as catastrophically unreliable**, and behavioral health is the
worst slice of it:

- **HHS-OIG, Oct 2025 (OEI-02-23-00540):** across 40 Medicare Advantage + 20 Medicaid MC plans,
  **55% of behavioral health providers listed in MA networks did not actually provide care to
  enrollees.** Deputy regional IG: *"Almost three-quarters of them should not have been
  listed."* Also: the average MA plan contracts with only **16%** of the BH workforce; 7 plans
  had **zero** in-network BH providers in the counties studied.
- **NY Attorney General secret-shopper study:** only **14%** of listed behavioral providers
  offered an in-network appointment. The other 86% were "ghosts."
- **EmblemHealth, Feb 26, 2026:** paid **$2.5M** — the largest ghost-network penalty in NY
  history — after the AG found **>80%** of its BH providers marked "accepting new patients"
  were effectively unavailable. Emblem must now re-verify every listing every 90 days and
  correct inaccuracies within two business days. (Repeat offender — prior settlement in 2011.)
- **MVP settlement (2025):** must contact every network provider every 90 days to confirm
  participation.
- **Senate Finance Committee (May 2023):** 12 MA plans — 80% of BH listings inaccurate; 33%
  had nonworking phone numbers.
- **Defacto Health audit (June 2024)** of the top 137 CMS-regulated payers: the single most
  common defect is **missing Practitioner-to-Plan relationships** — and it names
  **Healthfirst** and **Centene/Fidelis** specifically. *(This is exactly the "bare roles"
  defect we found on Healthfirst — no `network-reference`, no `newpatients`. It's documented,
  not a quirk.)*
- **HHS-OIG maternal-health analog (2025):** 25–35% of genuinely in-network providers were
  **MISSING** from directories entirely — the mirror-image failure of the carve-out omission
  problem.

### What this means for Leuk

Leuk's homepage promises *"filter by your insurance, see your cost before you book."*
**That promise is exactly what these audits are destroying industry-wide.**

Our differentiator cannot be *having* network data — everyone has it and it's wrong. It has
to be **corroboration and honesty about confidence.**

**Product rules that follow:**
- **Never present single-source network or accepting-patients data as authoritative.**
- Store `data_completeness` (`full` | `coarse`) and, eventually, a `source_count` /
  corroboration score.
- **Healthfirst and Fidelis/Centene: flag network linkage as KNOWN-DEFECTIVE.** Only claim
  "appears in X's directory," never "in-network with plan Y."
- Never surface "accepting new patients" from a single payer flag without corroboration.
- An empty result is better than a false one. **Fake in-network data in a mental-health
  directory is a patient-safety failure, not a UX gap.**

---

## 3. PAYER REGISTRY

### ✅ Anonymous — no auth, harvestable now

| Payer | Base URL | Notes |
|---|---|---|
| **Cigna** | `https://fhir.cigna.com/ProviderDirectory/v1/` | Docs *explicitly* state no auth required. IG 1.0.0. **96% Evernorth BH.** ⚠️ Node `fetch` sends `\|` unencoded → Cigna hard-400s. Must encode to `%7C`. *(This bug silently produced zero rows for hours.)* |
| **Humana** | `https://fhir.humana.com/api/` | WAF blocks *chained* params + bursts only; `specialty=` and `location=` work. `location=` OR-lists cap at **50 ids** (75+ → Firely auth page w/ HTTP 200). POST `_search` WAF-blocked. |
| **Healthfirst** | `https://hf-fhir-provider-directory-sys-api-prod.us-e1.cloudhub.io` | **Bare roles** — no network, no accepting-status. Coarse signal only. Matches the Defacto-documented defect. |
| **CDPHP** | `https://cdphpfhir.healthsparq.com/api/provider-fhir-service` | ❌ **FULL RECON 2026-07-11 (CapabilityStatement + raw dumps of all 8 types + positive controls, archived `.harvest/cdphp-recon/`): NO DETERMINISTIC JOIN KEY.** Token: POST `{"insurerCode":"CDPHP_I","brandCode":"CDPHP"}` to `.../healthsparq-public-login-service/v1/token`, JWT in **`subject-token` response header**, 15-min TTL, send as `Subject-Token`. Base `.../v1/fhir/` (HAPI, fhirVersion 4.4.0). Caps DECLARE `npi(string)` on Practitioner/Organization/InsurancePlan — **all dead: positive controls (3 practitioners + Albany Med's 3 type-2 NPIs, all confirmed present by name) return total 0**. `identifier` formally unsupported (OperationOutcome). Chained `practitioner.identifier` **silently ignored** (returns all 95,885). No `$export` (404). Identifiers on every resource type = HealthSparq internal keys only, zero system URIs. `qualification` = bare degree code (OD/MD), **no license number** → no license→NPPES join. **NUCC codes ARE present** in specialty arrays (alongside custom codes) and BH IS in the feed (Psychiatry/Psychology/MHC/LCSW/ABA ≈7% of roles) — filterable but unmatchable. Only remaining path = strict multi-field NPPES cross-walk (name+address+taxonomy), which is probabilistic → needs explicit sign-off. Otherwise: park until HealthSparq populates NPI. Evidence: `.harvest/cdphp-recon/` (capability statement + one full raw record per resource type; bulk page dumps trimmed 2026-07-11 for repo size — re-probe live if ever contested). |
| **UnitedHealthcare / Oxford** | `https://flex.optum.com/fhirpublic/R4/` | ✅ **PROBED 2026-07-11: OPEN — no registration.** Production public directory, anonymous (registration is Patient-Access-only). Practitioner carries `us-npi`; NPI search works system-prefixed (`%7C` pipe); chained `practitioner.identifier` silently 0 → two-step enrich; roles carry `newpatients` + display-less `network-reference` (resolve org via `_include`; e.g. "UHC Complete"). Registry `uhc` wired; **queued behind Cigna**. ⚠️ sandbox `flex.optum.com/fhir/sandbox/`; `/fhirpublic2025` 502s; `apigw.optum.com` = clearinghouse. Defacto ranks UHC **#1**. First harvest answers §7. |
| **MVP Health Care** | `https://api.mvphealthcare.com/provdirfhirapi/` | ✅ **PROBED 2026-07-11: public production, no registration** (ClientID flow is Patient-Access-only). us-npi identifiers; chained `practitioner.identifier` works (single-request reverse); `network-reference` + `newpatients` + NUCC specialty all present; `_include` never populates → preload the 17 `type=ntwk` Organizations and resolve from cache; `specialty=` times out (no walk). 18.3% random hit rate. **Carelon carve-out plan that publishes BH under commercial EPO/PPO** — the control datapoint (see ★ central finding §4). Registry `mvp` wired (`reverse`); **queued behind UHC**. |
| **Molina / Affinity** | `developer.interop.molinahealthcare.com` | ⚠️ **Docs read 2026-07-11 (their POD Developer PDF, Nov 2021): production is crippled.** Practitioner search: `id`/`name`/`given`/`family` only — **`identifier` NOT supported** (so no NPI lookup). PractitionerRole: **no `identifier`, no `_include`, no `name`**. **Network profile not served at all** (prod or sandbox) — network only via OrganizationAffiliation. Base URL not published in the PDF; portal is an SPA. Even found, there's no NPI-keyed path → walk-only + per-resource point reads. Downgraded from "easy win" to "needs a session of its own, low expected yield." |

### 🔑 Registered — awaiting credentials

| Payer | Status |
|---|---|
| **Aetna** | **Production Third-Party app SUBMITTED July 11, 2026. Review: 2–4 business days.** Portal: `developerportal.aetna.com`. **HAS BULK `$export`** — entire directory as NDJSON, no crawl. See `docs/TASK-AETNA.md` and `docs/aetna-api-catalog.csv`. |

### 📝 Registration required — not yet started

| Payer | Where | Notes |
|---|---|---|
| **Anthem / Empire BCBS NY** | `anthem.com/developers/provider-directory-api-request` | **Longest lead time — START THIS.** Plan-Net conformant. ⚠️ `patient360.anthem.com/P360Member/fhir` and `fhir.anthem.com/r4/` are **Patient Access** — not ours. |
| **Excellus BCBS** | `https://fhir.excellusbcbs.com/fhir/api/metadata` | **25-record cap, NO pagination.** Must iterate specialty × geography. Likely also serves **Univera**. |
| **Elevance HealthOS** | `totalview.healthos.elevancehealth.com/fhir/` | HTML SPA, not an open FHIR server. Owns **Empire BCBS + Carelon BH**. |
| **Centene / Fidelis / Wellcare** | `developer.centene.com`, `partners.centene.com` | ⚠️ **Defacto names Centene as the largest Medicaid MCO with a non-functioning directory API** — missing Practitioner-plan relationships. Flag as unreliable. |
| **MetroPlusHealth** | `devportal.interop.metroplus.org:8446` | ⚠️ Hostname contains "devportal" — **confirm the production base URL.** |
| **EmblemHealth** | `emblemhealth.com/legal/interoperability-information` | HealthTranzform/HealthEdge portal. ⚠️ URLs contain "dev" tokens — verify production. |
| **CareFirst** | `developer.carefirst.com/product/fhir-provider-directory` | Public per their docs. |
| **LA Care** | `oauthq.lacare.org/fhir/us/davinci-pdex-plan-net-v1/api/` | Not NY; clean conformance reference. Nests `newpatients` under a `fromNetwork` sub-extension — **parse extensions by URL, never by index.** |

### ❓ Not yet probed (NY plans under the same CMS mandate)

Independent Health (Buffalo) · Highmark BCBS WNY (`mrfdata.hmhs.com`) · Amida Care ·
VNS Health Plans · Elderplan (MJHS) · Centers Plan for Healthy Living · Hamaspik · iCircle ·
Univera (likely shares Excellus's stack)

### 🎯 Vendor clustering — the shortcut

NY plans cluster onto a handful of FHIR vendors. **Solve one plan on a vendor and you've
largely solved the others.**

- **1upHealth** — Healthfirst formulary, CDPHP formulary
- **HealthSparq / Kyruus** — CDPHP directory
- **Optum FLEX** — UnitedHealthcare, Oxford, Empire Plan medical
- **Cognizant TriZetto** — Molina, Affinity
- **HealthEdge / HealthTranzform** — EmblemHealth
- Also: Smile Digital, Onyx, Edifecs, InterSystems

**Parent/subsidiary shortcut:** Centene→Fidelis/Wellcare · Molina→Affinity ·
Elevance→Empire/Carelon. A parent endpoint may cover all children — check parents first.

---

## 4. THE THREE TRAPS (check every new payer against all three)

**1. Sandbox** — real shape, **fake data**. `devportal` · `sandbox` · `sbx` · `demo` · `test`
· `dev` · `vte` · `staging`. Confirmed: Cigna `.../v1-devportal/`, Aetna
`vteapif1.aetna.com/fhirdemo`. **Never write to the DB.**

**2. Patient Access** — real payer, **wrong API**. Member PHI behind OAuth + consent. Never
probe, never register. Confirmed: Aetna `apif1.aetna.com/fhir/v1` (bare — **same host as the
directory, different path**), Anthem `patient360.anthem.com`, Healthfirst
`fhir.test1.apirt.hyphencare.com`.

**3. Clearinghouse** — real company, **wrong product**. Commercial paid EDI (270/271, 837,
X12). `apigw.optum.com` · `developer.optum.com` · Availity · Change Healthcare · Waystar ·
Claim.MD. **Optum's revenue-cycle gateway is NOT UnitedHealthcare's provider directory.**
*(Exception: Optum **Behavioral Health** as a network directory would be in scope — judge by
the API, not the brand.)*

**Corollary:** "Public" in CMS's language means **no member consent** — NOT **no credentials**.
Cigna and Humana are anonymous. Aetna, Anthem, and UHC all require OAuth despite being
"public."

---

## 5. FUTURE SOURCES (not started — separate projects)

### CMS National Provider Directory — launched April 9, 2026 🔥
`directory.cms.gov` · GitHub: `CMS-Enterprise/npd`
**27,204,567 records** across 6 FHIR resource types (Practitioner: 7,441,212). **Free public
domain, NDJSON + Zstandard, ~2.8 GB compressed.** Adds provider-organization affiliations and
digital endpoints that NPPES lacks. **Not** a network-participation source — it's Medicare
*enrollment* — but an excellent NPI/affiliation spine. High value, low effort.

### NPPES reference files we haven't loaded
Shipped in the same dissemination ZIP we already use:
- **Endpoint Reference File** (`endpoint_pfile_*.csv`) — Direct addresses, **FHIR server
  URLs**, HIE endpoints. *The EHR interoperability spine.*
- **Practice Location Reference File** (`pl_pfile_*.csv`) — all **non-primary** practice
  locations. **Our "near me" search is currently wrong for multi-office providers.**
- Other Names (org DBAs) · full 15-slot taxonomy + primary switch · license #/state ·
  deactivated NPIs
- **Use V.2 format** — CMS dropped V.1 on 2026-03-03.

### NUCC Provider Characteristics — the conditions-treated vocabulary
**This is the answer to "how do we identify providers by what they treat."**
NUCC **Taxonomy** = provider *type* (psychiatrist, therapist). NUCC **Characteristics** =
**conditions treated**. Different code sets. Never conflate.

- **Conditions:** `7B` ADHD · `7D` anxiety/panic · `7F` bipolar · `7G` depression ·
  `7H` personality · `7I` schizophrenia · `7J` autism · `7M` eating disorders ·
  `7Q` chemical dependency · `8C` OCD · `8G` abuse/assault/trauma · `8H` PTSD
- **Modality:** `7E` DBT · `7O` CBT · `7P` SFBT · `7V` family · `7W` group · `7Z` med mgmt ·
  `8A` neuropsych testing
- **Population:** `7Y` sexual orientation · `8E` transgender · `7T` cultural · `8O` geriatrics ·
  `8M` postpartum · `9A` linguistic/cultural needs
- **Level of care:** `8V`–`8Z` (residential → crisis → PHP → outpatient → IOP);
  substance-use parallel `8Q`–`8U`
- **Access:** `6E` telehealth · `6L` virtual only · `6F`–`6I` opioid MAT/OTP

**⚠️ It's a VOCABULARY, not a populated dataset. NOT in NPPES.** We must collect values via
**provider self-attestation** — but coded to a national standard from day one, so it's
payer-interoperable.
**This is what should back `/care/[topic]` pages.** Free CSV from nucc.org. Leuk is
non-commercial → no license request needed.

### Transparency in Coverage (MRF) — the back door around gated directories
A **different federal mandate** (HHS/DOL/Treasury, not CMS Interop). Every payer must publish
negotiated rates keyed by **NPI + TIN + billing code (CPT/HCPCS) + place of service**.

**Why it matters:** **Anthem's FHIR directory is gated behind a multi-week approval. Their MRF
is not.** MRFs are a second, independent network signal that bypasses gated directories
entirely — and one that could *corroborate* FHIR data, which is exactly what the ghost-network
problem demands.

- **Contains behavioral CPT codes:** 90791 (psych diagnostic eval), 90834 (45-min psychotherapy),
  90837 (60-min), 99214 (E/M med mgmt), 90853 (group).
- **Caveats:** proves a **paper contract**, not active participation or panel-open status.
  "Zombie rates" are pervasive (CMS's Dec 2025 proposed rule adds a Utilization File
  specifically to filter them). Says **nothing** about accepting new patients.
- **Scale:** individual files up to **1 TB**. Index-of-indexes structure.
- **Tools:** open-source **`danielchalef/mrfparse`** (Go + simdjson — 80 GB Anthem set → parquet
  in <5 min); `CMSgov/price-transparency-guide` (official schema + validator);
  `EndurantDevs/healthcare-mrf-api`.
- **Buy instead of build:** **Payerset** (`docs.payerset.com` — has per-payer guides, incl.
  Elevance/Anthem), Turquoise Health, Serif Health, Trilliant.
- **Legal:** must be posted free, no PII/account, non-proprietary open format, "without
  restrictions that would impede re-use." **Favorable for commercial use.**

**UHC MRF — probed 2026-07-12 (facts):**
- Index API, no auth: `GET https://transparency-in-coverage.uhc.com/api/v1/uhc/blobs`
  returns all **86,722** blobs in one 21 MB JSON (no pagination). Downloads via
  `.../api/v1/uhc/blobs/download/{YYYY-MM-DD}/{name}` (302 → blob store).
- File-type tally: **7,133 in-network-rates** files (~**82 TB** total, largest single
  ~22 GB gzipped) · 67,111 index/TOC · 12,474 allowed-amounts · 4 prescription-drug.
- Files are per-legal-entity/employer-group, NOT per-geography. **874 are Insurer-level**
  (network-wide rate tables, not employer-specific) — the tractable subset.
- **A NY-insurer behavioral-specific file exists:**
  `2026-07-01_UnitedHealthcare-Insurance-Company-of-New-York_Insurer_Behavior-Health_P3_in-network-rates.json.gz`
  (14.6 GB). The `Behavior-Health_P3` file is byte-identical across state entities → one
  national behavioral rate table (network id P3). This is the rate data the FHIR
  directory's empty "Behavioral Commercial" shell does not expose.
- **Oxford is present in the MRF** (40 in-network files, ~48 GB — e.g.
  `Oxford-Health-Plans--CT---Inc-_Insurer_Choice-Plus` 9.1 GB, `..._Core` 8.6 GB),
  despite having NO public FHIR directory (probed 2026-07-12: no FLEX tenant, no
  separate endpoint, oxfordhealth.com unreachable, zero Oxford in the flex feed). MRF is
  the only public NPI-level window into Oxford's NY commercial network.
- Structure (confirmed on the 2 MB NY file): standard CMS TiC schema — `provider_references`
  + inline `provider_groups`/`npi` front-loaded, then `in_network` array with `billing_code`
  + `negotiated_rates`. Self-contained (NPI lists inline, no separate reference file needed).
  `mrfparse` (danielchalef) targets this exact format.
- **Job shape (not built):** stream ~5-10 Insurer-level files (NY Behavior-Health P3 + NY
  Choice Plus/EPO + Oxford Choice-Plus/Core), each 8-15 GB gzipped, filter to our ~99k NPIs
  × the 5 behavioral CPTs → small rates table. ~60-100 GB streamed (not stored). Not TB.

### Eligibility / clearinghouse (270/271) — the EHR moat
The directory answers *"is she in-network?"* Eligibility answers *"what will MY visit cost?"* —
copay, deductible remaining, prior-auth required. **That's the Headway pitch to providers:
"we make the insurance mess go away."**
Options: Availity (likely cheapest entry) · Optum · Waystar · Claim.MD.
**The vendor disqualifier: BH carve-out coverage (Optum BH, Carelon, Magellan). Ask first.**
**Gating decision: do we bill insurance at launch, or cash-pay/superbill?** If cash-pay,
this waits a year.

### Other NY sources
- **NYS Medicaid Enrolled Provider Listing** (Health Data NY, datasets `keti-qx5t` / `w8nc-2w4d`)
  — weekly, NPI-keyed, all NY Medicaid FFS + MC-only providers with specialty, address, county,
  revalidation dates. **Free corroboration source.**
- **SAMHSA findtreatment.gov** — JSON export API. **Facility**-level (not practitioners), but
  carries **conditions treated** and payment types accepted.
- **CMS Provider Data Catalog** (`data.cms.gov`) — Doctors & Clinicians files, NPI-keyed.
- **CMS MA Plan Finder** (CY2027, testing May–Aug 2026) — CMS will **crawl MA plans' Plan-Net
  APIs daily** and publish validated directory data. Worth tracking — it may become a better
  source than scraping individual plans.
- **CMS-0062-P (proposed)** — would require payers to *report their FHIR endpoints to CMS*.
  If finalized, endpoint discovery becomes solved. Track it.
- **CAQH ProView / DirectAssure** — the upstream source of most directory data. **Not publicly
  accessible.**

---

## 6. RECOMMENDED SEQUENCE

**Now (free, anonymous, no waiting):**
1. ✅ Cigna (running — the Evernorth win)
2. ✅ Humana Path B (running)
3. ~~CDPHP~~ ❌ probed 2026-07-11 — **no NPI in their FHIR data at all**; not matchable (see registry).
4. ~~Molina/Affinity~~ ⚠️ downgraded 2026-07-11 — production drops `identifier` search + `_include` + Network profile (see registry).

**Start the clocks today (multi-week lead times, pure calendar cost):**
5. **Anthem/Empire** — `anthem.com/developers/provider-directory-api-request`. Longest wait.
6. **UnitedHealthcare** — OneHealthcare ID + Vendor Portal.
7. Aetna ✅ (already submitted July 11)

**When Aetna lands (2–4 days):**
8. `$export` bulk NDJSON — see `docs/TASK-AETNA.md`. **Biggest single haul available.**

**Then:**
9. CMS National Provider Directory (free bulk, 27M records)
10. NPPES Endpoint + Practice Location reference files
11. NUCC Provider Characteristics + provider self-attestation → `/care/[topic]`
12. MRF (build with `mrfparse`, or buy from Payerset/Turquoise) — corroboration layer

---

## 7. THE (FORMERLY) UNRESOLVED QUESTION — ANSWERED

**Does Optum Behavioral Health data appear in UnitedHealthcare's Plan-Net FHIR directory?**

**Answered 2026-07-11 — see "★ THE CENTRAL FINDING" section above.** Short version: UHC
declares six behavioral networks and populates exactly one (Behavioral Medicare, ≥10k roles);
**Behavioral Commercial and Behavioral Medicaid are published empty shells**, Oxford and
Empire Plan are absent from the feed entirely, and the TPA asymmetry shows the withholding is
structural. Final confirmation at full-harvest completion via `.harvest/uhc-shell-check.mjs`.

UHC is on the Optum FLEX platform, so it's technically best-positioned to include carve-out BH
providers. But UHC's member-facing directories route BH separately ("referred to Optum
Behavioral Health"), implying a different source system.

**This is empirically testable and nobody has tested it.** When UHC credentials land, query
`fhir.flex.optum.com` for psychiatry/psychology NUCC codes and inspect the network references.

If Optum BH providers are **absent** from UHC's feed, that confirms the structural gap — and it
means **Cigna/Evernorth is not just the best BH source, it may be the only complete one.**
