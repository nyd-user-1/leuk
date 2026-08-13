# Aetna Interoperability API — Working Reference

CMS Interoperability & Patient Access Final Rule (CMS-9115-F) APIs from Aetna/CVS Health.
Covers Aetna, Innovation Health, Allina Health. Prior-auth pieces also fall under CMS-0057.

**For Leuk, the API that matters is the Provider Directory API** — it's public, non-PII, requires no member consent, and is the cleanest path to Aetna directory data. It's a useful complement to Aetna's MRF rates, whose per-NPI-per-TIN-per-plan duplication is already solved at the band/median layer (NYS-28 cracked the files, NYS-38 the distinct-schedule count, sql/024/025 the aggregates); the open remainder is display-side dedup (NYS-44), not a blocker on the data. Everything else on the portal is member-data or prior-auth machinery that only becomes relevant if/when Leuk submits claims or acts as an EHR integration.

---

## APIs at a glance

| API | Purpose | Auth burden | Leuk relevance |
|---|---|---|---|
| **Provider Directory** | Provider + pharmacy directory data | Low — app token only, no member consent | **High — start here** |
| Patient Access | Claims, encounters, formulary, clinical for a consenting member | High — member auth / IAL2 | Later, if patient-facing |
| Payer-to-Payer | Same data, payer→payer, member-directed | High | Only if Leuk is a payer |
| Provider Access | Bulk export of attributed members (treatment) | High — JWT/SMART | Only as EHR |
| Prior Authorization (CRD/DTR/PAS) | End-to-end prior auth | High — JWT/SMART | **Coming Soon — not live yet** |
| RTPBC | Medication cost + coverage | Med/High | Only if handling Rx |

PAS update transactions planned for a later 2026 release. All "clinicaldataexchange", "coveragerequirementsdiscovery", "priorauthorizationsupport" products are marked *Coming Soon*.

---

## App types → what they can access

Selected via "I Am Representing" at app creation. **The app type gates which APIs you can subscribe to.** S = Sandbox, P = Production.

- **Third-Party Developer** → Patient Access (S+P), Prior Auth (P, coming), Provider Directory (S+P), RTPBC-Member (P)
- **Payer** → Payer-to-Payer (S+P), Provider Directory (P)
- **EHR** → Prior Auth (S+P), Provider Access (S+P), RTPBC-Provider (S+P)
- **Provider System** → Prior Auth (S+P)
- **Broker** → Medicare Provider Directory only (P); reserved for Medicare NextGen partners

**For Leuk Provider Directory access: create a Third-Party (or Payer) Production application.**

---

## Account + app setup

1. Login/Register → business email, first + last name → accept Terms of Use.
2. Email security code (**expires in 10 min**) → create username + password.
3. My Applications → Create New → pick "I Am Representing" → pick Sandbox or Production → Continue.
4. First app of a type requires a **Questionnaire** (one-time per app type). Submit it.
5. **Aetna reviews questionnaire: 2–4 business days.** Track under My Dashboard → My Approvals → Approval Status. A Notification box appears if they need more from you.
6. On approval: Create Application → fill details → Submit → **record Client ID + Secret immediately** (copy-once).
7. My Applications → Refresh → find app → Products → subscribe to the Product(s) → Subscribe Now → Yes.
8. **Wait 2–5 min** for subscription to take effect.

> Production note: if Sandbox was already granted for that app type, moving to Production still triggers a 2–4 business day subscription review.

---

## Provider Directory — the path we care about

- **No Authorize endpoint. No member consent. Public non-PII data → application token only.**
- Create a **Production** Third-Party or Payer app.
- Subscribe to Products:
  - `public-providerdirectory-fhir`
  - `public-medicare-providerdirectory-fhir`
- Auth = **Client Credentials grant** (client secret), not the member authorization flow.

**Token request (Client Credentials):**
- Grant type: `client_credentials`
- Token URL: `https://apif1.aetna.com/fhir/v1/fhirserver_auth/oauth2/token`
- Client ID + Client Secret: from your app
- Scope: `Public NonPII`
- Client auth: Basic Auth header **or** credentials in body

That's the whole handshake — get token, call the FHIR directory endpoints. Download the Swagger from API Library → Provider Directory → Swagger Specifications for exact resource paths + params.

---

## Environments / base URLs

**Sandbox**
- Base: `https://vteapif1.aetna.com/fhirdemo/v1`
- Authorize: `https://vteapif1.aetna.com/fhirdemo/v1/fhirserver_auth/oauth2/authorize?aud=https://vteapif1.aetna.com/fhirdemo`
- Token: `https://vteapif1.aetna.com/fhirdemo/v1/fhirserver_auth/oauth2/token`
- Sandbox has **no member consent** — test member data comes from the Swagger in API Library.

**Production**
- Authorize: `https://apif1.aetna.com/fhir/v1/fhirserver_auth/oauth2/authorize`
  - aud options: `.../fhir` | `.../fhir/v1/patientaccess` | `.../fhir/v2/patientaccess`
- Token: `https://apif1.aetna.com/fhir/v1/fhirserver_auth/oauth2/token`

**EHR / Provider System token endpoints (SMART / JWT — different host, CVS):**
- EHR token — Sandbox: `https://apix-sit1.cvshealth.com/provider/fhir/auth/oauth2/v1/token` · Production: `https://apix.cvshealth.com/provider/fhir/auth/oauth2/v1/token`
- Provider System token — Sandbox: `https://apix-sit1.cvshealth.com/interop/external/oauth2/v1/token` · Production: `https://apix.cvshealth.com/interop/external/oauth2/v1/token`

---

## Auth flows (member-data APIs — Patient Access etc.)

Three PKCE variants; pick by whether the client secret is exposed:

1. **Secret, no PKCE** — backend-to-backend, secret never exposed.
2. **PKCE, no secret** — single-page apps where secret would leak. Uses Code Verifier + Code Challenge.
3. **Secret + PKCE** — backend, belt-and-suspenders.

- **Code Verifier**: random string, 43–128 chars, charset `A–Z a–z 0–9 - . _ ~`
- **Code Challenge**: base64url(SHA-256(verifier))
- Grant types: Authorization or Client Credentials
- Scope (member data): `launch/patient patient/*.read`
- Authorize params: `client_id`, `scope`, `redirect_url`, `response_type=code`, `state`, `skin=skin13`, `aud`

**IAL2** (identity proofing via CLEAR/ID.me) is **optional** for Third-Party apps — member username/password still works. Production IAL2 requires subscribing to `ial2-tokenexchange-fhir`. Switching IAL2 ↔ member-auth after creation isn't self-serve — email AetnaInteroperabilityProductionAccess@AETNA.com.

---

## JWT client-assertion (EHR / Provider System — Prior Auth, Provider Access)

Only needed if Leuk ever integrates as an EHR/provider system. Uses `client_assertion` JWT signed with the app's private key (JWKS).

- Body: `grant_type=client_credentials`, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `client_assertion=<signed JWT>`, `scope=system/*.read`
- Header: `alg` (RS256/RS384/ES256 — Provider System requires **RS384**), `typ=JWT`, `kid`
- Payload: `iss`/`sub` = Client ID, `aud` = token endpoint URL, `exp` ≤ 5 min from `iat`, `jti` = UUID
- Extensions: `hl7-b2b` (subject_id = requestor NPI, organization_id = org NPI or `urn:aetna:contract#...`, purpose_of_use e.g. `#treatment`) and `hl7-b2b-user` (FHIR Person of requestor).

---

## Response codes

`200` OK · `400` missing required param · `401` not subscribed to that API · `404` no data for input · `500` Aetna server/connectivity — retry.

---

## Practical sequence for Leuk (Provider Directory)

1. Register with business email; verify code within 10 min.
2. Create **Production Third-Party** app → complete questionnaire → wait 2–4 business days.
3. On approval, generate Client ID/Secret; store securely (copy-once).
4. Subscribe to `public-providerdirectory-fhir` (+ Medicare variant if useful); wait 2–5 min.
5. Client-credentials token, scope `Public NonPII`, against the production token URL.
6. Pull Provider Directory Swagger for resource paths; call FHIR endpoints.

The only gate is the 2–4 day human review. Provider Directory itself is the low-friction surface — no consent, no PKCE, no JWT.

---

# Provider Directory — FHIR Resource Paths & Query Reference

Aetna's Provider Directory implements the **HL7 Da Vinci PDex Plan-Net IG (STU 1.2, FHIR R4)** — the CMS-mandated standard. This means the resource model and search parameters below are **standardized, not Aetna-proprietary**: the same query shapes work against any Plan-Net payer directory (useful if we generalize the harvest beyond Aetna). Always confirm exact supported params against Aetna's downloaded Swagger, but the IG defines the contract.

**Production FHIR base (Provider Directory):** Auth = client-credentials token, scope `Public NonPII`. No Authorize endpoint, no member consent.

> ⚠️ **UNVERIFIED — confirm before use.** The base path `https://apif1.aetna.com/fhir` is *inferred* from Aetna's published token endpoint (`https://apif1.aetna.com/fhir/v1/fhirserver_auth/oauth2/token`), not confirmed. The actual FHIR resource-root path and Aetna's precise supported-parameter list live in the Provider Directory Swagger, which is behind the portal login and could not be fetched. **First action after approval: download the Swagger (API Library → Provider Directory → Swagger Specifications) and confirm (a) the exact resource-root URL and (b) which of the search params below Aetna actually supports.** Treat the base path as a hypothesis until then.

**What IS verified vs. inferred:**
- ✅ *Verified against the HL7 IG:* the resource model, the query shapes/`_include` patterns below, the Plan-Net search params. These are the CMS-mandated standard and are payer-agnostic.
- ⚠️ *Inferred / unconfirmed:* the Aetna base path, and whether Aetna implements every optional param (payers may support a subset).

## The six resources and how they interlock

Plan-Net is a graph. The join structure is what makes it powerful — and it mirrors our own domain model almost exactly:

- **Practitioner** — the individual. Name, gender, languages, qualifications (NPI lives here for Type 1). *Does not itself carry network participation.*
- **PractitionerRole** — the join node. Ties a Practitioner to an Organization, Location(s), specialty codes, and **Network(s)**. This is where in-network participation for an individual is asserted.
- **Organization** — the group/facility (our Type 2 / TIN-bearing entity). Name, type, address, NPI.
- **OrganizationAffiliation** — the org-level join node. Links a participating org to networks + HealthcareServices (the org-level analog of PractitionerRole).
- **Network** — a payer network product (profiled on Organization). **This is our `network_product`.** Every rate we hold is keyed to one of these.
- **InsurancePlan** — the plan; points to one or more Networks. **This is our `plan → network_product` pointer**, and Plan-Net models it exactly the way our domain model already insists on: plans inherit a network's full participation set.
- **HealthcareService** — category/specialty/type of service an org (or solo practitioner) offers. **Search often starts here** — `category` + `specialty` are the top-level organizing fields.
- **Location** — where service is delivered (address, geo).

Mapping to our model: `InsurancePlan → Network` is our plan→network-product pointer; `PractitionerRole.network` / `OrganizationAffiliation.network` is how a provider inherits participation; Organization NPI ↔ our TIN registry. The directory gives us the **participation graph**; the MRF gives us the **rate keyed to (TIN × network × code)**. Same Network is the join key across both.

## Core query patterns (verified against the IG)

**Currently-active practitioner roles** (swap the date for today; `date=ge<today>` filters to active periods):
```
GET /PractitionerRole?date=ge2026-07-17
```

**Find providers by specialty** — Plan-Net's recommended entry point is HealthcareService.category/specialty, then include the roles:
```
GET /HealthcareService?specialty=<code>
GET /PractitionerRole?specialty=<code>&_include=PractitionerRole:practitioner
```

**Everything about a practitioner in one call** (role + the practitioner, org, location, network it points to) — `_include` pulls referenced resources into the bundle so you don't N+1:
```
GET /PractitionerRole?practitioner.name=<name>&_include=PractitionerRole:practitioner&_include=PractitionerRole:organization&_include=PractitionerRole:location&_include=PractitionerRole:network
```

**Providers participating in a specific network** (the query that matters most for us — it's the directory-side of our rate key):
```
GET /PractitionerRole?network=<Network/id>&_include=PractitionerRole:practitioner
GET /OrganizationAffiliation?network=<Network/id>&_include=OrganizationAffiliation:participating-organization
```

**Plans → networks** (walk from an insurance product to its networks, then to participants):
```
GET /InsurancePlan?type=<plan-type>
# then take InsurancePlan.network references → query PractitionerRole?network=...
```

**Reverse-include** (given an org, pull the roles that reference it) — `_revinclude` is the inverse of `_include`:
```
GET /Organization?name=<org>&_revinclude=PractitionerRole:organization
GET /Organization?_revinclude=OrganizationAffiliation:participating-organization
```

**Provider by NPI** (identifier search — the clean join back to our NPPES layer):
```
GET /Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|<npi>
GET /Organization?identifier=http://hl7.org/fhir/sid/us-npi|<npi>
```

## Plan-Net-specific search parameters

Six custom search params the IG adds on top of base FHIR (these are the ones a generic FHIR server has to be extended to support, so they're the ones worth testing first against Aetna's endpoint):

- `coverage-area` — on HealthcareService, InsurancePlan, Organization
- `plan-type` — on InsurancePlan
- `network` — on OrganizationAffiliation and PractitionerRole ← **our key param**

Base-spec params already available: `name`, `specialty`, `identifier`, `date`, `address`, `location`, `organization`, `practitioner`, plus `_include` / `_revinclude` / `_count` / `_lastUpdated`.

## Harvest strategy notes

**The ladder, in order — `$export` bulk first, crawl last.**

1. **`$export` bulk NDJSON first.** Aetna's Commercial+Medicare Provider Directory serves a bulk `$export` — the whole directory as NDJSON, no crawl. It's the biggest single haul available and the cheapest; take it before writing a single search loop. (The Medicaid family has no bulk export and needs the reverse-lookup crawl in step 3.)
2. **Then enrich-by-NPI.** For the NPIs we already hold, resolve each directly — `Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|<npi>` (and the same on `Organization`). Every hit is matched by construction; this is the `--mode=enrich` shape `ingest-payers.mjs` already runs for Humana. NPI is the reconciliation key back to our NPPES identity layer and TIN registry.
3. **Network-walk only where the first two leave gaps.** Enumerate InsurancePlans → collect their Network references → page `PractitionerRole?network=` / `OrganizationAffiliation?network=`. **Degeneracy warning:** networks are not a clean partition. Anthem publishes 541 of its 1,133 networks sharing a single roster (NYS-69) — walking every network there re-fetches the same providers 541× for one book. Expect Aetna to have its own version; dedup by NPI as you go, and never treat network count as a proxy for how much work remains.

- **Use `_include`/`_revinclude` to collapse the graph** into single bundles (avoid per-provider follow-ups), and **page with `_count` + bundle `next` links** rather than offset. **But these vary per payer:** which optional params a payer actually implements, and how it paginates, is not guaranteed by the IG — that per-payer variance is exactly why our `payer_sources` table carries the capability columns it does. **Test each against Aetna's downloaded Swagger before trusting the IG.**
- **Implementation is a `PAYER_REGISTRY` entry in `scripts/ingest-payers.mjs`, not a new harvester.** Aetna's Plan-Net directory is the CMS-standard shape that ingester already speaks (Humana is the reference source; a new payer is a config entry + an auth strategy, not a new code path). The same registry generalizes to any Plan-Net payer directory with a base-URL swap.
- **This harvest is participation + identity, a different axis from rates.** The MRF-dedup work (above) doesn't gate it — which is why the Provider Directory is the Aetna surface worth pursuing now regardless of the display-side rate cleanup (NYS-44).
