# Aetna API Recon — 2026-08-10

**Mode:** read-only. No DB writes, no ingest, no code changes. Free HTTP only (~45 requests).
**Creds:** `AETNA_CLIENT_ID` / `AETNA_CLIENT_SECRET` read from `.env.local` at runtime; never written to disk, never logged.

> **UPDATE — post-subscription, same day.** Brendan subscribed the app to `public-providerdirectory-fhir` + `public-medicare-providerdirectory-fhir`. **Auth is now green and both families return live production data.** See §0 for the smoke-test results, which supersede the "blocked" framing in §1. §1 is retained as the diagnostic record.

---

## 0. POST-SUBSCRIPTION RESULTS (authoritative)

### 0a. Token — working

`client_credentials` now returns `200`:

```json
{"token_type":"Bearer","access_token":"<redacted>","scope":"Public NonPII",
 "expires_in":3600,"consented_on":1786413517}
```

- **TTL: 3600s (1 hour).** Cache and reuse; don't re-mint per request.
- **`scope` is mandatory.** Both no-scope variants now return `400 invalid_scope` / *"Missing scope in the request"* — an error that was previously masked by the catch-all 401. Confirms the §1 diagnosis: the old failure was subscription, not credentials.
- Basic-auth header and body-credentials both work. Prefer Basic.
- **Sandbox still `401`** — the app is Production-only. Expected, and consistent with the sandbox having no directory anyway (§2d).

### 0b. Family A smoke — `200`, and the data is excellent

`GET /fhir/v1/providerdirectorydata/Practitioner?family=Smith&_count=1` → **`200`**, 2,343 bytes, 1.4s.

| Signal | Value |
|---|---|
| `Bundle.total` | **11,208** — totals *are* returned, so work is countable in advance |
| Pagination | `next` link carries `_page_token=ASTp7RNRfqUGVfl4…` (opaque cursor), plus `first`/`self` |
| **`meta.lastUpdated`** | **`2026-08-10T04:31:34Z` — earlier today.** The directory is refreshed daily |
| **`meta.tag`** | `COMM` (Commercial) + `MDCR` (Medicare) — **product line is tagged per resource**, so the two books are separable without separate queries |
| `meta.profile` | `plannet-Practitioner` — conformant Plan-Net |

Fields on a single `Practitioner` (real record, NPI `1205387412`):

- **`identifier`** — NPI (`http://hl7.org/fhir/sid/us-npi`) **plus** an *Aetna Provider Identification Number* (PRN `0008562078`). A payer-internal ID we don't have from any other source — potentially a stable join key for Aetna-side reconciliation.
- **`address`** — 11 addresses, each with a **`geolocation` extension carrying lat/long**. Free geocoding.
- **`qualification`** — 4 entries, each with license status and **`whereValid` state** (CO, MD, UT, WA). License-state data per practitioner.
- `communication` — languages (`en-US`).
- `telecom` — multiple ranked phone numbers.
- `active`, `gender`, `name` (family/given/suffix/text).

> **⚠️ Pagination gotcha — verify before writing the crawler.** Every link and `fullUrl` in the Family A bundle points at **`https://apif1.aetna.com/fhir/prod/v1/providerdirectorydata/…`** — note the extra **`/prod`** segment, which is *not* the documented public path (`/fhir/v1/…`) and not what we called. Following `next` verbatim may 404 or bypass the gateway. **Untested — I stopped as instructed.** This is the single highest-priority thing to check before any paged walk, because it breaks on page 2, not page 1. Family B does *not* have this problem (its `self` link uses the correct public path).

### 0c. Family B smoke — works, but the identifier format deviates from the IG

First attempt used the FHIR-canonical token form and **failed**:

```
GET /fhir/v1/providerdirectory/Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|1639311244
→ 400  OperationOutcome / MSG_PARAM_INVALID
   diagnostics: "NPI should be 10-digit number"
```

That's a malformed-request error, not a data answer, so I re-ran once with the corrected format:

```
GET /fhir/v1/providerdirectory/Practitioner?identifier=1639311244&_count=1
→ 200  Bundle/searchset, total: 0
```

**Family B NPI search works — but `identifier` takes a bare 10-digit NPI, not `system|value`.** This is an Aetna deviation from the Plan-Net IG and would silently 400 an IG-conformant client. Worth encoding in the `payer_sources` capability columns.

`total: 0` is a genuine negative — that NY psychiatrist (sourced from public NPPES) simply isn't in Aetna's Medicaid network. One NPI proves the endpoint, not the coverage rate; hit rate needs the sampled probe from `TASK-AETNA.md:147`.

### 0d. Rate limits changed once authenticated — and the two families are wildly asymmetric

| Context | Header |
|---|---|
| Unauthenticated `/metadata` | `name=default,10000` |
| **Family A, authenticated** | **`name=rate-limit-1,18000`** (remaining 17999) |
| **Family B, authenticated** | **`name=rate-limit-1,1`** (remaining **0**) |

Family A's budget is **18,000** — better than the 10,000 measured unauthenticated. Family B reports a bucket of **1**, on both the `400` and the `200`.

I did not probe further (instructed to stop), so I won't assert the window. The two readings consistent with the evidence are a **1-request-per-second throttle** or a genuine near-zero quota. **This must be characterized before the Medicaid crawl is planned** — at 1 req/sec a NY-wide `PractitionerRole` walk is hours of wall-clock but feasible; a true quota of 1 would make Family B unusable at any scale. It does not change the §7 ordering (Family A first), but it does mean the Medicaid step needs its own sizing pass.

### 0e. Corrections this supersedes

- §4a stands and is now **confirmed from the live response**: Family A returns NPI inside `identifier` but cannot be *searched* by it; Family B can.
- The §7 Step-0.4 smoke-test replacement (`family=Smith`) **works as predicted** — `200` where the documented `identifier` test would have failed.
- Family A freshness is now measured, not assumed: **daily**.

---

## TL;DR

1. **We are blocked on a portal action, not on code.** Every `client_credentials` token request returns `401 unauthorized_client` — across 5 auth variants, both prod and sandbox. A control test proves Aetna's error string is generic and cannot distinguish "bad secret" from "app not subscribed". Given the app was approved and creds issued, **the overwhelmingly likely cause is a missing product subscription** (`public-providerdirectory-fhir`). That's a click in the portal + 2–5 min propagation. Nobody should debug the client code.
2. **The no-auth surface turned out to be far richer than expected.** Both directory families serve a full FHIR `CapabilityStatement` at `/metadata` with **no auth at all**, and the portal ships its complete 139-endpoint API catalog as a public static JSON. Between them we now have Aetna's *authoritative* supported-parameter list — which is what the login-walled Swagger would have told us. **The `⚠️ UNVERIFIED` block in `docs/AETNA-INTEROP.md:147` can be resolved.**
3. **Two load-bearing assumptions in `docs/TASK-AETNA.md` are wrong**, and both would have cost real time. NPI search does *not* exist on the family we planned to use it on, and the 10,000-request rate limit makes the documented Medicaid plan infeasible as written. Details in §4.

---

## 1. Auth: what actually happened

### Token endpoint — all variants fail identically

`POST https://apif1.aetna.com/fhir/v1/fhirserver_auth/oauth2/token`

| # | Variant | Result |
|---|---|---|
| A | Basic auth + `scope=Public NonPII` | `401 unauthorized_client` |
| B | Body creds + `scope=Public NonPII` | `401 unauthorized_client` |
| C | Basic auth, no scope | `401 unauthorized_client` |
| D | Body creds, no scope | `401 unauthorized_client` |
| E | **Sandbox** token endpoint, Basic + scope | `401 unauthorized_client` |

```json
{"error":"unauthorized_client",
 "error_description":"Invalid client ID or secret, or client not subscribed to this API"}
```

### The control test — why the message tells us nothing

I ran two deliberate controls:

- **Bogus client id + bogus secret** → *byte-identical* error.
- **Our real creds + `grant_type=totally_bogus_grant`** → *byte-identical* error.

Aetna returns one catch-all string for every failure class. **Do not read "Invalid client ID or secret" as evidence the secret is wrong.** It is equally consistent with a valid, unsubscribed app.

### Can we pre-flight whether the client is registered? No.

I tried the authorize endpoint as a probe (no login performed):

- Our `client_id` → `302` to `https://www.aetna.com/AccountManagerV3/v/login?...&appname=SMRTPP`
- A bogus `client_id` → `302` to the **same login page**

Aetna defers client validation until after member login, so there is no anonymous way to confirm registration. Diagnosis has to happen in the portal UI.

### What to check in the portal (Brendan)

Per `AETNA-INTEROP.md:47`, subscription is a **separate step after app creation** and is the step most easily missed:

1. My Applications → Refresh → find the app → **Products**
2. Subscribe to `public-providerdirectory-fhir` (and `public-medicare-providerdirectory-fhir`)
3. **Wait 2–5 minutes**, then re-run the token sweep
4. Confirm the app is **Production**, and that "I Am Representing" is Third-Party or Payer — the app *type* gates which products are even subscribable

> Also worth confirming the secret was captured intact: Aetna shows it **copy-once**. Both values in `.env.local` are 32 chars, which is the right shape, so this is lower-probability than the subscription.

---

## 2. What IS reachable with no auth (hit today, live)

### 2a. `/metadata` — both families, `200 OK`, no credentials

This is the find of the session. It is the authoritative, machine-readable statement of exactly which resources and search parameters Aetna supports — i.e. the content we were blocked from getting out of the Swagger.

| | **Family A — Commercial + Medicare** | **Family B — Medicaid** |
|---|---|---|
| Base (confirmed via `implementation.url`) | `https://apif1.aetna.com/fhir/v1/providerdirectorydata/` | `https://apif1.aetna.com/fhir/v1/providerdirectory/` |
| FHIR version | 4.0.1 | 4.0.1 |
| Plan-Net IG | **1.2.0** (2025-05-25) | **1.1.0** (2022-04-04) |
| CapabilityStatement date | **2026-06-18** | **2023-06-29** |
| Bulk `$export` | ✅ `export` + `exportstatus` declared | ❌ none |
| Resources | 7 (incl. `HealthcareService`) | 6 (no `HealthcareService`) |
| Pagination | `_page_token` (cursor) | `page` (offset) |
| `_include` / `_revinclude` | ✅ | ❌ **neither** |
| CORS | `false` | `false` |
| Formats | `json`, `application/fhir+json` | same |

**Family A is actively maintained; Family B has not been re-issued in ~3 years.** Plan accordingly — Medicaid data freshness is a real question to raise with Aetna.

### 2b. Rate limit — now a known quantity

Response headers on every call:

```
x-ratelimit-limit:     name=default,10000;
x-ratelimit-remaining: name=default,9909;
```

**10,000 requests per window.** The window length isn't published in the headers (no reset header), and `remaining` fluctuates non-monotonically across calls (9852 → 9851 → 9907), indicating a **per-edge-node counter behind Akamai** rather than one global counter. Treat 10k as the order of magnitude, not a precise budget. This is the single most important operational constraint on the crawl plan — see §4.

### 2c. Public API catalog — 139 endpoints

`GET https://developerportal.aetna.com/assets/Data/Fhir.json` → `200`, no auth.

This is the portal's own catalog feed, and it is **more complete than `docs/aetna-api-catalog.csv`** (18 rows). Saved analysis below; full inventory in §3.

### 2d. Dead ends (recorded so nobody re-runs them)

- **Swagger YAML is not public.** Every `developerportal.aetna.com/fhir/apis/swagger/*.yaml` path returns the Angular SPA shell (`200`, `text/html`, 553–1055 bytes), as does every other unknown path — it's a catch-all route. The SPA loads specs from a runtime-injected AEM host; the only hosts in the bundle are internal (`*-dev.aetna.com`, `qaintaet-oci.aetna.com`). Swagger stays login-walled.
- **Sandbox has no provider directory at all.** Both `vteapif1.aetna.com/fhirdemo/v1/providerdirectory{,data}/metadata` → `404`. The sandbox is **Patient Access only**. The "never harvest the sandbox" rule in `TASK-AETNA.md:190` is moot for directory work — there is nothing there to harvest.
- **No SMART discovery document.** `.well-known/smart-configuration` → `404` on both v2 patientaccess and providerdirectorydata. OAuth URIs are instead published inside the CapabilityStatement `security` extension.

---

## 3. Full API inventory (from Aetna's own catalog)

139 entries across 6 product families. Consolidated:

| Product family | Endpoints | Env | Auth | Member-scoped? | Leuk relevance |
|---|---|---|---|---|---|
| **Provider Directory — Commercial + Medicare** (`/v1/providerdirectorydata/*`) | 9 (incl. `$export`, `$exportstatus/{id}`) | Prod | client_credentials, `Public NonPII` | **No — public** | **Primary target** |
| **Provider Directory — Medicaid** (`/v1/providerdirectory/*`) | 9 | Prod | client_credentials, `Public NonPII` | **No — public** | **Secondary target** |
| Patient Access v2 (`/v2/patientaccess/*`) | 33 prod + 30 sandbox | Both | authorization_code + member login | **Yes — PHI** | Only if patient-facing |
| **Patient Access v3** (`/v3/patientaccess/*`) | 19 | Prod | authorization_code | **Yes — PHI** | ⚠️ **undocumented in our notes — see below** |
| RTPBC (`/v1/realtimepharmacybenefitcheck/$process-message`) | 2 prod + 2 sandbox | Both | — | Member Rx | Only if we handle Rx |
| Prior Auth / CRD / Clinical Data Exchange | 5 | Both | JWT client-assertion | Provider-scoped | EHR-role only |
| Provider Access (`/provideraccess/v1/Group`) | 1 (sandbox, no swagger) | Sandbox | JWT/SMART | Attributed members | EHR-role only |

### Two things in the catalog that aren't in our docs

- **A whole `v3/patientaccess` generation exists** (version 3.0.0, 19 production endpoints) that neither `AETNA-INTEROP.md` nor `TASK-AETNA.md` mentions — they document v1/v2. v3 adds `QuestionnaireResponse`, `Specimen`, and `ServiceRequest` on top of the USCDI set. If Patient Access ever becomes a real project, **start at v3, not v2.**
- **`Patient/{id}/$everything`** is published (sandbox). That's a single-call full-record pull — materially cheaper than resource-by-resource fan-out if we ever build patient import.

### Formulary — answering the original question directly

**Aetna does not expose a standalone formulary/drug-coverage API on this portal.** There is no `/formulary` product and no USDF (Da Vinci Formulary) implementation guide in the catalog. The nearest equivalents are:

- `MedicationKnowledge` and `MedicationRequest` / `MedicationDispense` under Patient Access — **member-scoped PHI**, requires a consenting member login.
- **RTPBC** (`$process-message`) — real-time benefit check for a *specific* member + drug, not a browsable formulary.

So: no public formulary data. Any drug-coverage feature would be member-consent-gated, per-member, per-query. Worth noting because it's a common assumption that CMS-9115 forced payers to publish formularies openly — it did so for **Medicare Part D plan finder data via CMS**, not via payer FHIR endpoints.

---

## 4. Corrections to our existing docs

These are the operationally expensive ones.

### 🔴 (a) NPI search does **not** exist on Family A

`TASK-AETNA.md:35` states Family A `Practitioner` is "**Searchable by NPI**". **It is not.** Aetna's own CapabilityStatement:

```
Family A  Practitioner   params: _count, _revinclude, name, family, given, _id, _page_token, _lastUpdated
                                 ^^^ no `identifier`
Family B  Practitioner   params: address-state:exact, address-city:exact, address-postalcode:exact,
                                 name:contains, family:contains, identifier, page, _count
                                                                 ^^^ identifier IS supported
```

**It is exactly inverted from the doc.** Consequences:

- The `--mode=enrich` NPI-reverse-lookup shape (`AETNA-INTEROP.md:225`) **cannot run against Commercial/Medicare**. For Family A the only route in is `$export`, or a `PractitionerRole` walk. This makes `$export` not merely preferable but effectively **mandatory** for Family A.
- Step 0.4 of `TASK-AETNA.md:86` (`GET {familyA}/Practitioner?identifier={NPI}` as the auth smoke test) **will fail even with a working token.** Use `GET {familyA}/Practitioner?family=Smith&_count=1` instead, or run the NPI check against Family B.
- NPI is still recoverable from Family A — it lives in `Practitioner.identifier` in the *response* body, and `PractitionerRole` does support `identifier` as a query param. We just can't query `Practitioner` *by* NPI.

### 🔴 (b) The 99k-NPI Medicaid reverse-lookup is infeasible under the rate limit

`TASK-AETNA.md:137` proposes reverse-lookup across "our ~99k NPIs" as the preferred Medicaid driver. At **10,000 requests/window**, that's ~10 windows of continuous querying for one refresh — before retries.

**The good news: we don't need it.** Family B supports server-side geographic filtering that the doc was unsure existed (`TASK-AETNA.md:142` asks "Is there any server-side geographic filter?"). Answer: **yes, on every resource.**

```
Practitioner            address-state:exact, address-city:exact, address-postalcode:exact
Organization            address-state:exact, address-city:exact, address-postalcode:exact
Location                address-state:exact, address-city:exact, address-postalcode:exact
PractitionerRole        location.address-state:exact   ← chained
OrganizationAffiliation location.address-state:exact   ← chained
InsurancePlan           address-state
```

A paged `PractitionerRole?location.address-state:exact=NY` walk is NY-bounded server-side and costs on the order of *hundreds* of requests, not 99,000. **This should replace the reverse-lookup plan outright.**

Family A also supports `Location.address-state` — useful as a fallback if `$export` is denied, though `$export` remains first choice.

### 🟡 (c) Family B has no `network` param and no `_include`

Family B exposes **no `network` search parameter on `PractitionerRole` or `OrganizationAffiliation`**, and supports **neither `_include` nor `_revinclude`**. So for Medicaid:

- The network-walk strategy (`AETNA-INTEROP.md:226`) is **not available** — you cannot query by network.
- Graph collapsing is impossible; resolving practitioner → org → location → network is **N+1 by construction**. Budget requests accordingly, and lean on `Practitioner`/`Location` state-filtered sweeps rather than role-first traversal.

Family A has both (`network` on `PractitionerRole` + `OrganizationAffiliation`, plus `_include`/`_revinclude`), so the network-keyed join to our rate data works there — which is where it matters most.

### 🟢 (d) Base paths — now verified, not inferred

`AETNA-INTEROP.md:147` flags the base path as `⚠️ UNVERIFIED — confirm before use`. **Now confirmed** from each server's own `implementation.url`:

- Family A: `https://apif1.aetna.com/fhir/v1/providerdirectorydata/`
- Family B: `https://apif1.aetna.com/fhir/v1/providerdirectory/`

Both match what `TASK-AETNA.md` already had. The warning block can be replaced with the verified table in §2a.

### 🟡 (e) Pagination differs per family — and neither is offset-classic

- **Family A: `_page_token`** — an opaque cursor the server issues. *"This value will be provided by the Server. If a search returns more resources than fit on one page, the response…"* Follow the bundle `next` link; never synthesize it.
- **Family B: `page`** — plain offset paging.

Two different pager implementations in one payer. A `payer_sources` capability column should carry this per-family, not per-payer.

### 🟡 (f) `cors: false` on both — server-side only

No browser-direct calls, ever. Fine for our harvest architecture, but it forecloses any client-side directory widget.

---

## 5. The authorization-code flow (documented, not built)

Per instruction: **documented only, nothing implemented.** Only relevant if we ever pursue Patient Access; the directory work does **not** need this.

| Piece | Value |
|---|---|
| Authorize | `https://apif1.aetna.com/fhir/v1/fhirserver_auth/oauth2/authorize` |
| Token | `https://apif1.aetna.com/fhir/v1/fhirserver_auth/oauth2/token` |
| `aud` options | `.../fhir` · `.../fhir/v1/patientaccess` · `.../fhir/v2/patientaccess` (add v3 — catalog shows v3 is live) |
| `response_type` | `code` |
| Scope | `launch/patient patient/*.read` |
| Callback | `https://ehr.nysgpt.com/api/aetna/callback` |
| PKCE | 3 variants supported; verifier 43–128 chars from `A–Z a–z 0–9 - . _ ~`, challenge = base64url(SHA-256(verifier)) |
| Extra params | `state`, `skin=skin13` |

**Confirmed live today:** the authorize endpoint accepts our parameter shape and `302`s to Aetna's member login (`https://www.aetna.com/AccountManagerV3/v/login`, `appname=SMRTPP`). No login was attempted.

**⚠️ One concrete gotcha found, worth capturing now.** I sent `state=recon` and Aetna echoed **`state=cmVjb24=`** into the login redirect — that's base64(`recon`). Aetna base64-encodes the `state` parameter as it passes through its identity layer. Whether the *final* callback receives the encoded or original form is untested (would require a real member login). **The callback handler must not assume byte-equality on `state` round-trip** — decode-and-compare, or the CSRF check will reject every legitimate callback. This is exactly the kind of thing that costs a day of debugging.

**Not needed for directory access:** the Provider Directory uses `client_credentials` with scope `Public NonPII` — no authorize step, no member consent, no PKCE.

---

## 6. Data offered, per API

| API | Fields available | Volume | Freshness | Scope |
|---|---|---|---|---|
| **Directory — Commercial+Medicare** | Practitioner (name, gender, languages, qualifications, NPI in `identifier`); PractitionerRole (specialty NUCC, location, org, **network**, role, period); Organization (name, type, address, NPI); OrganizationAffiliation (network, service); InsurancePlan (type, coverage-area, network, period, owned-by); HealthcareService (specialty, category, delivery-method); Location (address + state/city/zip, type) | Whole Aetna Commercial + Medicare book — national. Not yet measurable (auth-blocked) | `_lastUpdated` supported on every resource → incremental sync viable. Server metadata refreshed 2026-06-18 | **Public, non-PII** |
| **Directory — Medicaid** | Same minus HealthcareService; **no network**, no `_include` | Aetna Medicaid, state-scoped | `_lastUpdated` **not** offered → no incremental sync; full re-crawl each time. Metadata stale since 2023-06-29 | **Public, non-PII** |
| Patient Access v2/v3 | Full USCDI: EOB, Coverage, Condition, Encounter, Procedure, Observation, MedicationRequest/Dispense/Knowledge, AllergyIntolerance, CarePlan, CareTeam, DocumentReference, Goal, Device, Immunization, DiagnosticReport (+v3: QuestionnaireResponse, Specimen, ServiceRequest) | One member per authorization | Live | **Member-scoped PHI** |
| RTPBC | Real-time drug cost + coverage | Per query | Live | Member Rx |
| Prior Auth / CRD / CDex | Coverage requirements, PA submission, attachments | — | — | Provider-scoped, JWT |

**Trimmed JSON sample — Family A CapabilityStatement (verbatim, truncated):**

```json
{
  "resourceType": "CapabilityStatement",
  "url": "https://apif1.aetna.com/fhir/v1/providerdirectorydata/metadata",
  "name": "AETNADaVinciPdexPlanNetCapabilityStatement",
  "status": "active",
  "publisher": "AETNA FHIR Project Team",
  "date": "2026-06-18T00:00:00+00:00",
  "fhirVersion": "4.0.1",
  "format": ["json", "application/fhir+json"],
  "implementation": {
    "description": "AETNA's implementation of DaVinci Payer Data Exchange Plan Network",
    "url": "https://apif1.aetna.com/fhir/v1/providerdirectorydata/"
  },
  "rest": [{
    "mode": "server",
    "security": {
      "extension": [{
        "url": "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
        "extension": [
          {"url": "token",     "valueUri": ".../fhirserver_auth/oauth2/token"},
          {"url": "authorize", "valueUri": ".../fhirserver_auth/oauth2/authorize"}
        ]
      }],
      "cors": false
    },
    "operation": [
      {"name": "export",       "definition": "https://hl7.org/fhir/uv/bulkdata/OperationDefinition-export.html"},
      {"name": "exportstatus", "definition": "https://build.fhir.org/ig/HL7/bulk-data/export.html#bulk-data-status-request"}
    ]
  }]
}
```

**Trimmed sample — `PractitionerRole` search params, Family A (verbatim):**

```json
{
  "type": "PractitionerRole",
  "documentation": "A specific set of Roles/Locations/specialties/services that a practitioner may perform at an organization for a period of time.",
  "interaction": [{"code": "search-type"}],
  "searchParam": [
    {"name": "network", "type": "reference",
     "definition": "http://hl7.org/fhir/us/davinci-pdex-plan-net/SearchParameter/practitionerrole-network",
     "documentation": "Select roles where the provider, which can be a practitioner or an organization, is a member of the specified network"},
    {"name": "specialty", "type": "token",
     "definition": ".../SearchParameter/practitionerrole-specialty"},
    {"name": "_page_token", "type": "string",
     "documentation": "This value will be provided by the Server. If a search returns more resources than fit on one page..."}
  ]
}
```

---

## 7. Recommendation — what to ingest first

**Step 0 (Brendan, portal, blocking everything):** subscribe the app to `public-providerdirectory-fhir` + `public-medicare-providerdirectory-fhir`, wait 5 min, re-run the token sweep. Rerun with:

```
zsh /private/tmp/claude-501/-Users-brendanstanton-Code-leuk/f2fcc8d0-9115-452e-9a0b-37d97f59b39d/scratchpad/token-sweep.sh
```

(Reads creds from `.env.local` at runtime; prints no secrets.)

**Then, in order:**

1. **Family A via `$export`.** Confirmed present in the CapabilityStatement. It's the only viable full-coverage route for Commercial+Medicare now that we know NPI search doesn't exist there, and it sidesteps the 10k rate limit entirely (one job, then file downloads). This is the biggest single haul available and should be the first thing attempted post-unblock.
2. **Family A network graph.** `PractitionerRole?network=...&_include=...` gives us the participation edge keyed to the same `network_product` our MRF rates are keyed to. This is the join that makes the directory worth more than NPPES — do it while `$export` files are still fresh. Watch for Anthem-style network degeneracy (`AETNA-INTEROP.md:226`); dedup by NPI as you go.
3. **Family B via state-filtered crawl** — `location.address-state:exact=NY`, **not** the 99k-NPI reverse-lookup. Bounded, cheap, and NY-scoped server-side. Medicaid matters disproportionately for behavioral health, and this is now clearly affordable.

**Do not** start with Family B NPI reverse-lookup, and **do not** run the Step 0.4 smoke test as written (§4a).

**Before ingest:** the cardinality check in `TASK-AETNA.md:65` (Aetna's one-location-one-network-per-`PractitionerRole`) is still **unverified** — it needs real response bodies. Verify it against the first `$export` batch before any upsert, since it determines whether our natural key holds.

---

## 8. Compliance confirmations

- ✅ **No DB writes.** No database connection opened at any point.
- ✅ **No Patient Access resource endpoint contacted.** The only PHI-family host paths touched were the `/authorize` redirect (an OAuth entry point, no member login performed, no data returned) and one `.well-known/smart-configuration` probe (spec-defined public OAuth metadata, returned `404`). No `/v1|v2|v3/patientaccess/*` resource path was ever requested. The `TASK-AETNA.md:57` bare-path rule was respected.
- ✅ **No sandbox data ingested.** Sandbox was probed for existence only; it returned `404` for both directory families.
- ✅ **Free HTTP only.** No paid API calls, no model calls. ~40 requests total, ~0.4% of one rate-limit window.
- ✅ **Secrets.** Read from `.env.local` at runtime into env vars only. Not written to any file, not committed, not echoed into the report.

**Operational note:** `.env.local:65-66` has a space after `=` (`AETNA_CLIENT_ID= b12c…`). Next's dotenv parser trims it so the app is unaffected, but `source .env.local` / `eval` in a shell **silently yields empty strings** — which will read as "bad credentials" to anyone debugging from the CLI. Worth normalizing before the next agent hits it.

---

## Appendix — supported search parameters, verbatim from `/metadata`

### Family A — Commercial + Medicare (IG 1.2.0)

| Resource | Interactions | Search parameters |
|---|---|---|
| `Practitioner` | read, search | `_count`, `_revinclude`, `name`, `family`, `given`, `_id`, `_page_token`, `_lastUpdated` |
| `PractitionerRole` | search | `_count`, `_id`, `_include`, `specialty`, `location`, `organization`, `practitioner`, `role`, `_lastUpdated`, **`network`**, `identifier`, `_page_token` |
| `Organization` | read, search | `_count`, `_revinclude`, `_include`, `address`, `name`, `partof`, `_id`, `type`, `_lastUpdated`, `_profile`, `_page_token` |
| `OrganizationAffiliation` | search | `_count`, `_include`, `location`, `specialty`, `primary-organization`, `participating-organization`, `_id`, **`network`**, `_lastUpdated`, `service`, `_page_token` |
| `InsurancePlan` | search | `_count`, `owned-by`, `name`, `identifier`, `_id`, `coverage-area`, `_lastUpdated`, `_include`, `_page_token`, `type`, **`network`**, `period` |
| `HealthcareService` | read, search | `_count`, `_include`, `location`, `organization`, `specialty`, `_id`, `name`, `service-category`, `_lastUpdated`, `_revinclude`, `_page_token`, `delivery-method` |
| `Location` | read, search | `_count`, `_revinclude`, `_include`, **`address-state`**, `address-city`, `address-postalcode:exact`, `address`, `partof`, `organization`, `_id`, `type`, `_lastUpdated`, `_page_token` |

System-level operations: `$export`, `$exportstatus/{id}`.

### Family B — Medicaid (IG 1.1.0)

| Resource | Interactions | Search parameters |
|---|---|---|
| `Practitioner` | read, search | **`address-state:exact`**, `address-city:exact`, `address-postalcode:exact`, `name:contains`, `family:contains`, **`identifier`**, `page`, `_count` |
| `PractitionerRole` | search | `specialty`, **`location.address-state:exact`**, `location.address-city:exact`, `location.address-postalcode:exact`, `page`, `_count` |
| `Organization` | read, search | `address-state:exact`, `address-city:exact`, `address-postalcode:exact`, `name:contains`, `page`, `_count` |
| `OrganizationAffiliation` | search | `specialty`, `location.address-state:exact`, `location.address-city:exact`, `location.address-postalcode:exact`, `page`, `_count` |
| `InsurancePlan` | search | `address-state` |
| `Location` | read, search | `address-state:exact`, `address-city:exact`, `address-postalcode:exact`, `page`, `_count` |

No operations. No `_include`/`_revinclude`. No `network`. No `_lastUpdated`.

---

*Artifacts retained in the session scratchpad: `famA-metadata.json`, `famB-metadata.json`, `portal-fhir-catalog.json`, `token-sweep.sh`, `env.sh`.*
