# ClinicalTrials.gov API v2 Recon — 2026-08-10

**Mode:** read-only. No DB writes, no ingest, no code changes. Free HTTP only (~400 requests + one 2.5 GB bulk download, all anonymous).
**Creds:** none. The API is fully open — no key, no token, no registration, no `Authorization` header.
**Base:** `https://clinicaltrials.gov/api/v2` · `apiVersion 2.0.5` · `dataTimestamp 2026-08-10T09:00:05`

---

## TL;DR

1. **This is the best-engineered public API I've looked at for us.** No auth, clean `400`s with readable messages, cursor pagination, field projection, CSV *and* JSON, ETag/`304` conditional GETs, and **91 req/s measured with zero throttling**. Compare the ORCID recon: unknown field → `500`, no rate-limit headers, 20-year token. This one behaves.
2. **Delta sync is real and cheap — the headline finding.** `filter.advanced=AREA[LastUpdatePostDate]RANGE[2026-08-09,MAX]` gives exact daily deltas. Volume is **~800–1,150 studies/weekday, and exactly 0 on weekends** (posting is weekday-only — I verified 10 consecutive days). A daily catch-up on the whole corpus is **2 API calls**. This is a genuine incremental feed, not the ORCID situation where `last-modified-date` wasn't even searchable.
3. **The slice that matters to Leuk is tiny and complete.** We're a NY mental-health platform, so the relevant universe is **281 actively-recruiting NY mental-health trials** (321 incl. not-yet-recruiting; 2,651 all-time). On that slice: **100% have eligibility criteria, 100% have a brief summary, 100% of NY sites have zip + lat/lon, 98.6% have a contact email.** Full ingest is **~46 MB and 3 API calls**. This is cheap enough to not need a business case.
4. **Same fuzzy-match honesty as the ORCID report — but the answer here is different, and better.** There is still no NPI, no CCN, no TIN. But unlike ORCID we get **zip + lat/lon + facility name**, and — critically — **academic-sponsored trials anonymize nothing** (0% generic site names, 0% placeholder investigators, measured). Industry trials are the opposite: **18.5% of sites are literally named "Research Site"** and 6.1% of investigators are placeholders like "Study Director". So the org join is feasible with geo-blocking; **the investigator join is not, and I'd recommend against building it** (§7).

---

## 1. Surface map

### Endpoints

| Endpoint | Purpose | Status |
|---|---|---|
| `GET /studies` | Search + list, the workhorse | `200` |
| `GET /studies/{nctId}` | Single full record | `200` |
| `GET /studies/metadata` | **Full schema tree** — every field, type, nesting | `200` |
| `GET /stats/size` | Corpus size, largest studies | `200` |
| `GET /stats/field/values` | Enum values + per-value study counts | `200` |
| `GET /version` | API version + data timestamp | `200` |
| `GET /studies/download` | **Full corpus zip** — `format=json.zip` only | `200` |

`/studies/metadata` is the thing to read before writing any mapper — it's a machine-readable schema of the entire record, so we never have to guess a field path.

### Record shape — 6 top-level sections

```
protocolSection    13 modules   ← what the trial IS
resultsSection      5 modules   ← what the trial FOUND (only if hasResults)
annotationSection   1 module
documentSection     1 module    ← protocol/SAP PDFs
derivedSection      3 modules   ← MeSH terms, computed
hasResults          boolean
```

### `protocolSection` modules

| Module | Key fields |
|---|---|
| `identificationModule` | `nctId`, `nctIdAliases`, `orgStudyIdInfo`, `secondaryIdInfos[]` (NCT/DOI/other registries), `briefTitle`, `officialTitle`, `acronym`, `organization{fullName,class}` |
| `statusModule` | `overallStatus`, `startDateStruct`, `primaryCompletionDateStruct`, `completionDateStruct`, `studyFirstPostDateStruct`, **`lastUpdatePostDateStruct`** (the sync cursor) |
| `sponsorCollaboratorsModule` | `leadSponsor{name,class}`, `collaborators[]`, `responsibleParty{type,investigatorFullName,investigatorTitle,investigatorAffiliation}` |
| `oversightModule` | FDA-regulated flags, IRB/DMC info |
| `descriptionModule` | `briefSummary`, `detailedDescription` (markup) |
| `conditionsModule` | `conditions[]`, `keywords[]` |
| `designModule` | `studyType`, `phases[]`, `enrollmentInfo{count,type}`, `designInfo{allocation,maskingInfo,primaryPurpose}` |
| `armsInterventionsModule` | `armGroups[]{label,type,interventionNames[]}`, `interventions[]{type,name,otherNames[],armGroupLabels[]}` |
| `outcomesModule` | `primaryOutcomes[]`, `secondaryOutcomes[]`, `otherOutcomes[]` — each `{measure,description,timeFrame}` |
| `eligibilityModule` | `eligibilityCriteria` (free text), `sex`, `minimumAge`, `maximumAge`, `stdAges[]`, `healthyVolunteers` |
| **`contactsLocationsModule`** | `centralContacts[]{name,role,phone,email}`, `overallOfficials[]{name,affiliation,role}`, **`locations[]{facility,status,city,state,zip,country,geoPoint{lat,lon},contacts[]}`** |
| `referencesModule` | PubMed refs, links, IPD |
| `ipdSharingStatementModule` | Data-sharing plan |

### `resultsSection` modules (79,594 studies have them)

`participantFlowModule` (groups, periods, milestones, drop-withdraws) · `baselineCharacteristicsModule` (denoms, measures by arm) · `outcomeMeasuresModule` (per-outcome `classes[]/categories[]/measurements[]` with `paramType`, `dispersionType`, `unitOfMeasure`, plus `analyses[]` with p-values and CIs) · `adverseEventsModule` (`seriousEvents[]`/`otherEvents[]` by `organSystem` and `term`, with `frequencyThreshold`) · `moreInfoModule` (limitations, agreements).

The sampled semaglutide trial has **43 outcome measures** with full statistical detail. This is real structured results data, not links to papers.

---

## 2. Search & filter

### Query params (all verified `200`)

| Param | Example | n |
|---|---|---|
| `query.cond` | `depression` | 12,673 |
| `query.term` | `machine learning` | 3,174 |
| `query.intr` | `semaglutide` | 734 |
| `query.spons` | `Pfizer` (incl. collaborators) | 6,063 |
| `query.lead` | `Pfizer` (lead only) | 3,861 |
| `query.locn` | `New York` | 6,644 |
| `query.titles` | `artificial intelligence` | 1,841 |
| `query.outc` | `HbA1c` | 11,895 |
| `query.id` | `NCT00000102` | 1 |
| `filter.overallStatus` | `RECRUITING` (pipe-OR) | 64,874 |
| `filter.geo` | `distance(40.7128,-74.0060,50mi)` | 39,445 |
| `filter.ids` | `NCT00000102` | 1 |
| `aggFilters` | `status:rec` | 64,874 |
| **`filter.advanced`** | `AREA[LastUpdatePostDate]RANGE[2026-08-01,MAX]` | 5,659 |

`filter.advanced` is the powerful one — `AREA[Field]value`, `AREA[Field]RANGE[a,b]`, with `AND`/`OR`/parens and `MAX`/`MIN` sentinels. It reaches fields the `query.*` shortcuts don't.

**Unknown param → `400` with `` `query.bogus` is unknown parameter ``.** Readable, correct status. (ORCID returned `500` for the same class of mistake — worth appreciating.)

### Pagination

- `pageSize` **silently clamps to 1000** — `pageSize=5000` returns 1000 with no warning. Don't infer your page size from the request; count the response.
- `pageToken` / `nextPageToken` cursor. Verified a 3-page walk returns disjoint IDs.
- `countTotal=true` adds `totalCount` (costs a little; skip it when paging).
- `sort` accepts `LastUpdatePostDate:desc`, `EnrollmentCount:desc`, `StartDate:asc`, `@relevance`.

### Projection & formats

- `fields=NCTId,BriefTitle,…` for JSON (schema names).
- `format=csv` — **different column names**: `NCT Number`, `Study Title`, `Study Status`, `Sponsor`, `Conditions`, … Passing JSON names to CSV → `400 Parameter 'fields' contains invalid CSV column name: 'NCTId'`. Two vocabularies; don't mix them.
- CSV flattens repeated values with `|` (`Gout|Hyperuricemia`).

> ⚠️ **Projection gotcha that cost me a cycle:** `fields` is a strict allowlist — a field you filter *on* is not returned unless you also *request* it. I filtered locations by `state` while only requesting `LocationFacility`, and every `state` came back `None`, silently producing an empty result set. No error. Request every field you branch on.

### Enums (`/stats/field/values`)

| Field | Distribution |
|---|---|
| `OverallStatus` (14) | COMPLETED 326,411 · UNKNOWN 95,839 · RECRUITING 64,874 · TERMINATED 34,089 · NOT_YET_RECRUITING 29,128 · ACTIVE_NOT_RECRUITING 21,902 |
| `LeadSponsorClass` (9) | OTHER 427,395 · INDUSTRY 131,536 · OTHER_GOV 15,860 · NIH 11,561 · NETWORK 5,000 · FED 4,921 |
| `InterventionType` (11) | DRUG 210,859 · OTHER 122,738 · DEVICE 75,279 · BEHAVIORAL 63,655 · PROCEDURE 59,707 · BIOLOGICAL 29,814 |
| `StudyType` (3) | INTERVENTIONAL 456,305 · OBSERVATIONAL 139,562 · EXPANDED_ACCESS 1,062 |
| `Phase` (6) | NA 234,000 · PHASE2 89,682 · PHASE1 65,343 · PHASE3 49,625 · PHASE4 35,631 · EARLY_PHASE1 6,433 |

Note **`UNKNOWN` = 95,839 (16%)** — studies whose sponsor stopped updating them past their completion date. Any "is this trial live?" logic must treat `UNKNOWN` as stale, not as active.

---

## 3. Bulk & delta

### Full corpus download — measured, not quoted

```
GET /api/v2/studies/download?format=json.zip
→ 200 application/zip, content-disposition: attachment; filename=ctg-studies.json.zip
```

| Property | Measured |
|---|---|
| Compressed | **2.53 GB** (2,717,993,022 bytes) |
| Uncompressed | **10.33 GB** (3.9× ratio) |
| Entries | **597,913** — exactly `totalStudies`, one JSON per study |
| Layout | 100 shard dirs by last 2 digits of NCT ID: `35/NCT02252835.json` |
| Avg study JSON | 17,275 bytes · largest 3,596,689 bytes |
| Download time | **74 s @ 36.7 MB/s** |

`format=json.zip` is the **only** accepted value (`csv`, `json`, `csv.zip` → `400`), and **the endpoint rejects all filters** — `filter.ids` → `400 Invalid prefix in parameter name`. It's all-or-nothing.

> ⚠️ If you cap the download by time you get a truncated file that *looks* plausible (I got 346 MB) but fails `zipfile` with `BadZipFile` — the central directory is at the end. Always verify the archive opens before trusting a fetch.

### Delta sync — per-day, 10 consecutive days

| Date | Day | Updated |
|---|---|---|
| 2026-07-31 | Fri | 911 |
| 2026-08-01 | Sat | **0** |
| 2026-08-02 | Sun | **0** |
| 2026-08-03 | Mon | 805 |
| 2026-08-04 | Tue | 871 |
| 2026-08-05 | Wed | 837 |
| 2026-08-06 | Thu | 939 |
| 2026-08-07 | Fri | 1,060 |
| 2026-08-08 | Sat | **0** |
| 2026-08-09 | Sun | **0** |
| 2026-08-10 | Mon | 1,147 |

**Posting is weekday-only.** A scheduler that expects daily movement will log two false "no data" alarms every week — make the tripwire *business*-day aware, or it'll cry wolf ~104 times a year.

Cumulative windows: 7d = 5,659 (0.9% of corpus) · 30d = 17,081 (2.9%) · 90d = 45,034 (7.5%) · 365d = 124,589 (20.8%).

**Four usable cursors:** `LastUpdatePostDate` (primary), `StudyFirstPostDate` (new studies only — 1,227 since Aug 1), `ResultsFirstPostDate` (results drops — 149), `LastUpdateSubmitDate` (submit vs post, runs ahead — 4,336).

**Conditional GET works:** the API returns an `ETag`, and `If-None-Match` yields **`304`**. Free polling for unchanged queries.

### Rate limits

**60 requests, 20-way parallel: 0.66 s → 91.1 req/s, all `200`, zero throttling.** No rate-limit headers, no documented quota. This is dramatically more permissive than ORCID's 12 req/s / 100k-per-day. Be a good citizen anyway — the delta design below needs 2 calls/day.

---

## 4. Volumes

| Cut | Studies |
|---|---|
| **All studies** | **597,913** |
| Interventional / Observational | 456,305 / 139,562 |
| With results posted | 79,594 |
| **RECRUITING** | **64,874** |
| RECRUITING + NOT_YET_RECRUITING | 94,002 |
| US sites | 194,281 |
| **New York sites** | **39,825** |
| NY + recruiting | 4,471 |
| NYC 50 mi radius | 39,445 |
| NYC 50 mi + recruiting | 4,478 |

**Per-condition** (`query.cond`): diabetes 24,210 · obesity 14,756 · depression 12,673 · hypertension 12,344 · anxiety 10,406 · chronic pain 7,650 · substance use disorder 4,427 · schizophrenia 4,196 · PTSD 2,643 · autism 2,282 · bipolar 2,034 · ADHD 1,967.

### The Leuk funnel (NY mental health)

| Cut | Studies |
|---|---|
| Mental/behavioral health, all geographies | 38,930 |
| MH + New York site | **2,651** |
| MH + NY + RECRUITING | **281** |
| MH + NY + RECRUITING or NOT_YET | 321 |
| MH + NYC 50 mi + RECRUITING | 286 |
| MH + US + RECRUITING | 1,943 |

By intervention type on the NY-recruiting slice: DRUG 109 · BEHAVIORAL 94 · OTHER 47 · DEVICE 39 · PROCEDURE 6 · SUPPLEMENT 6.

**Completeness of that 281-study slice** (this is what makes it usable):

| Field | Coverage |
|---|---|
| `eligibilityCriteria` | **100%** |
| `briefSummary` | **100%** |
| NY site `zip` + `geoPoint` | **100%** (423 NY location rows) |
| `healthyVolunteers` | 98.9% |
| `centralContact` w/ email | 98.6% |
| `centralContact` w/ phone | 98.2% |
| `minimumAge` | 98.6% |
| Site-level contact | 68% |

---

## 5. Data-quality findings

**Anonymization splits hard by sponsor class.** Measured over 1,000-study samples:

| Sample | Officials | Placeholder-named | Location rows | Generic/anonymized |
|---|---|---|---|---|
| All studies | 893 | 9 (1.0%) | 5,598 | 661 (**11.8%**) |
| **INDUSTRY lead** | 972 | 59 (**6.1%**) | 16,375 | 3,029 (**18.5%**) |
| **OTHER (academic) lead** | 870 | **0 (0.0%)** | 2,164 | **0 (0.0%)** |

Industry trials deliberately blind their sites — "Research Site" appeared 40 times in a single 400-study NY sample. Academic trials name everything. **Any matching pipeline should be scoped to non-industry sponsors**, where the data is clean, rather than trying to defeat intentional anonymization.

**Facility name variants are the classic entity-resolution mess.** Top NY facilities from one 400-study sample:

```
 40  Research Site                                          ← anonymized
 35  Memorial Sloan Kettering Cancer Center
 15  Memorial Sloan Kettering Cancer Center (All Protocol Activities)
  9  Memorial Sloan Kettering Westchester
 28  NYU Langone Health
 17  Columbia University Irving Medical Center
 16  Mount Sinai Hospital
 12  Icahn School of Medicine at Mount Sinai                ← same system as above
 12  University of Rochester                                ← and below
 10  University of Rochester Medical Center
 12  Montefiore Medical Center
  9  Northwell Health
```

Three MSK strings, two Mount Sinai entities, two Rochester strings. No identifier ties them.

**Investigator names are not normalized and often aren't people:**

```
Supriya G Mohile              → clean
Rakesh Sahni, MD              → credential inline
Katherine N Balantekin, PhD, RD
Study Director                → not a person
Medical Director, MD, PhD     → not a person
```

99% carry an `affiliation` string, which helps — but the name field mixes real names, credential suffixes, and role placeholders with no flag distinguishing them.

**`UNKNOWN` status is 16% of the corpus** — sponsors who stopped updating. Never render these as "active".

---

## 6. Join keys to our world — the honest read

Leuk's `organizations` is keyed on **NPI**, with `legal_business_name`, `other_names[]`, `city/state/zip`. `directory_providers` has `name`/`city` with **GIN trigram indexes already in place** (`sql/005`, `sql/022`, `pg_trgm` installed). So the matching infrastructure exists; the question is whether the match is *sound*.

**ClinicalTrials.gov carries no NPI, no CCN, no TIN, no DEA, no state license.** Same structural gap as ORCID. But two things make the org-side join materially better than ORCID's:

1. **Geography is exact.** Every NY location row has `zip` **and** `geoPoint{lat,lon}` — 100%, measured. Zip + state is a strong blocking key, so trigram similarity only has to disambiguate *within a zip*, not nationally. That's the difference between "which Mount Sinai" (tractable) and "which Fei-Fei Li" (not).
2. **The clean subset is identifiable up front.** `LeadSponsorClass != INDUSTRY` gives a population with 0% anonymized sites. We can scope to it deterministically instead of discovering the noise later.

### Org join — recommended, with guards

`ctgov.location.facility` + `zip` + `state` → `organizations.legal_business_name` / `other_names[]` + `zip` + `state`, via `pg_trgm` similarity, blocked on zip.

Guards I'd insist on: block on zip (never match nationally); drop rows matching `^(research site|investigative site|local institution|site \d+)`; scope to non-industry sponsors; **persist the similarity score and the raw source string** so a bad match is auditable and reversible; treat matches below threshold as unmatched rather than guessing. Expect genuine misses — the multi-campus systems above will need manual aliases, which is exactly what `other_names[]` is for.

### Investigator join — I'd skip it

`overallOfficials[].name` + `affiliation` → `directory_providers.name` is the tempting one, and it's the one I'd leave alone:

- No NPI, so the match is pure name + institution string.
- 6.1% of industry officials aren't people at all ("Study Director").
- Names carry inline credentials in inconsistent order (`, MD`, `, PhD, RD`).
- Our directory has **116k+ NY providers** — at that scale, common surnames collide constantly. The ORCID report's "three different Fei-Fei Li records" problem applies directly, and here there isn't even a stable identifier to disambiguate against.
- The failure mode is attributing someone else's clinical trial to a named provider on a **patient-facing** directory page. That's a credibility failure in a product whose entire premise is "trust the care is real and licensed."

If we ever want investigator linkage, the sound version is provider-attested (a clinician claims their own trials from a candidate list), not inferred. That's a product feature, not an ingest job.

---

## 7. Recommendation & sized ingest plan

**Ingest it. It's cheap, clean, genuinely useful, and it fits the product.**

The natural surface is patient-facing: a New Yorker searching for mental-health care who is uninsured, on a waitlist, or has treatment-resistant depression is exactly who a recruiting trial serves. We have 281 of them with 100% eligibility text, 100% geocoded sites, and a contact email on 98.6%. That's a real answer to "I need help and the normal path isn't working" — which is the home page's stated job.

### Sizing

| Scope | Studies | Raw JSON | API calls @1000 |
|---|---|---|---|
| **NY mental-health, all-time** | **2,651** | **~46 MB** | **3** |
| US mental-health, all-time | 15,495 | ~268 MB | 15 |
| NY all conditions, all-time | 39,825 | ~688 MB | 40 |
| Full corpus (bulk zip) | 597,913 | 10.33 GB | 1 download |

**Recommended scope: NY mental-health, all-time — 2,651 studies, ~46 MB, 3 API calls.** Backfill runs in well under a minute. Widening to all-NY or all-US mental health later is a config change, not a re-architecture.

### Delta design

Nightly, on the existing `harvestd` queue with a row in `sync_runs`:

1. Read the last successful `dataTimestamp` from `sync_runs` (not wall clock — use the API's own `/version` stamp as the cursor so a missed night self-heals).
2. `GET /studies?filter.advanced=AREA[LastUpdatePostDate]RANGE[{cursor},MAX] AND {MH} AND AREA[LocationState]New York&pageSize=1000`.
3. Page on `nextPageToken`. **Measured volume: ~37/week on this slice, ~118/month** — one page, essentially always.
4. Upsert on `nct_id`; write `last_update_post_date`, and re-run facility matching only for changed location rows.
5. Re-check `overallStatus` on the full stored set weekly — a trial going `COMPLETED`/`WITHDRAWN` may not touch `LastUpdatePostDate` in the window we're watching, and stale "recruiting" badges on a patient-facing page are the worst failure here.

**Cost: 2–3 API calls/night.** Use `If-None-Match` to make no-change nights free.

**Tripwire caveat:** make the "did it run" alarm **business-day aware**. Saturday and Sunday are legitimately zero — a naive daily-movement check fires ~104 false alarms a year.

### What I'd ingest

**Keep:** `nctId` · `briefTitle` · `overallStatus` · `lastUpdatePostDate` · `studyFirstPostDate` · `briefSummary` · `conditions[]` · `derivedSection.conditionBrowseModule.meshes[]` (normalized MeSH — better than free-text conditions for faceting) · `studyType` · `phases[]` · `enrollmentInfo` · `interventions[]{type,name}` · `primaryOutcomes[]{measure,timeFrame}` · `eligibilityCriteria` · `sex`/`minimumAge`/`maximumAge`/`healthyVolunteers` · `leadSponsor{name,class}` · `locations[]{facility,status,city,state,zip,geoPoint}` · `centralContacts[]{name,phone,email}` · `hasResults`.

**Skip for now:** the whole `resultsSection` (rich, but nothing in the patient-facing story needs 43 outcome measures), `documentSection` PDFs, `ipdSharingStatementModule`, `referencesModule`.

**Handle with care:** `centralContacts[].email`/`phone` are public recruitment contacts, not PHI — but they're real people's contact details, so they belong under the same no-logging discipline as everything else, and shouldn't be exposed in a way that invites scraping.

**One thing I did not verify:** whether ClinicalTrials.gov publishes terms restricting redisplay of contact details on a commercial directory. The data is US-government public domain and the API is unauthenticated, but "public domain" and "appropriate to republish contact emails on a consumer site" aren't the same question. Worth a look before that field reaches a page — it doesn't block the ingest.

---

## Appendix A — Sample 1: industry drug trial (`NCT04251156`, trimmed)

```json
{
  "nctId": "NCT04251156",
  "briefTitle": "Research Study of How Well Semaglutide Works in People Living With Overweight or Obesity.",
  "organization": { "fullName": "Novo Nordisk A/S", "class": "INDUSTRY" },
  "status": { "overallStatus": "COMPLETED", "startDate": "2020-12-08",
              "primaryCompletionDate": "2022-08-23", "completionDate": "2022-08-23",
              "firstPostDate": "2020-01-31", "lastUpdatePostDate": "2026-01-29" },
  "sponsor": { "lead": { "name": "Novo Nordisk A/S", "class": "INDUSTRY" },
               "responsibleParty": { "type": "SPONSOR" } },
  "conditions": ["Overweight", "Obesity", "Diabetes Mellitus, Type 2"],
  "design": { "studyType": "INTERVENTIONAL", "phases": ["PHASE3"],
              "enrollment": { "count": 375, "type": "ACTUAL" },
              "allocation": "RANDOMIZED", "masking": "QUADRUPLE",
              "primaryPurpose": "TREATMENT" },
  "interventions": [ { "type": "DRUG", "name": "Semaglutide" },
                     { "type": "DRUG", "name": "Placebo (semaglutide)" } ],
  "primaryOutcomes": [
    { "measure": "Change From Baseline in Body Weight (Percentage [%])",
      "timeFrame": "Baseline (week 0), week 44" } ],
  "eligibility": { "sex": "ALL", "minimumAge": "18 Years", "maximumAge": null,
                   "healthyVolunteers": false, "stdAges": ["ADULT", "OLDER_ADULT"] },
  "overallOfficials": [ { "name": "Clinical Reporting Anchor & Disclosure (1452)",
                          "affiliation": "Novo Nordisk A/S", "role": "STUDY_DIRECTOR" } ],
  "nLocations": 33,
  "locations_sample": [
    { "facility": "Instituto de Ciências Farmacêuticas de Estudos e Pesquisas",
      "city": "Aparecida de Goiânia", "state": "Goiás", "zip": "74935-530",
      "country": "Brazil", "status": null,
      "geoPoint": { "lat": -16.82333, "lon": -49.24389 } }
  ],
  "hasResults": true,
  "results": {
    "nOutcomeMeasures": 43,
    "adverseEvents": { "frequencyThreshold": "5", "nSeriousEvents": 19, "nOtherEvents": 14,
                       "firstSerious": { "term": "Abdominal pain upper",
                                         "organSystem": "Gastrointestinal disorders" } }
  }
}
```

*Three things to note: the lead "official" is a **disclosure mailbox, not a person**; `location.status` is `null` on a completed study (site-level status is only populated while recruiting); and the first site is **Brazilian** — global trials are the norm, so any US/NY scoping must filter on location, not sponsor.*

## Appendix B — Sample 2: behavioral-health trial (`NCT03900416`, trimmed)

```json
{
  "nctId": "NCT03900416",
  "briefTitle": "Adolescent Mindfulness Mobile App Study (RCT)",
  "organization": { "fullName": "Lawrence University", "class": "OTHER" },
  "status": { "overallStatus": "COMPLETED", "startDate": "2019-06-17",
              "primaryCompletionDate": "2021-02-03", "completionDate": "2021-02-03",
              "firstPostDate": "2019-04-03", "lastUpdatePostDate": "2021-11-08" },
  "sponsor": { "lead": { "name": "Lawrence University", "class": "OTHER" },
               "responsibleParty": { "type": "PRINCIPAL_INVESTIGATOR",
                                     "investigatorFullName": "Lori Hilt",
                                     "investigatorTitle": "Associate Professor of Psychology",
                                     "investigatorAffiliation": "Lawrence University" } },
  "conditions": ["Rumination", "Depression", "Anxiety", "Self-Injurious Behavior"],
  "design": { "studyType": "INTERVENTIONAL", "phases": ["NA"],
              "enrollment": { "count": 152, "type": "ACTUAL" },
              "allocation": "RANDOMIZED", "masking": "NONE",
              "primaryPurpose": "PREVENTION" },
  "interventions": [ { "type": "BEHAVIORAL", "name": "Mindfulness App" } ],
  "primaryOutcomes": [
    { "measure": "Children's Response Styles Questionnaire", "timeFrame": "baseline" } ],
  "eligibility": { "sex": "ALL", "minimumAge": "12 Years", "maximumAge": "15 Years",
                   "healthyVolunteers": true, "stdAges": ["CHILD"] },
  "overallOfficials": [ { "name": "Lori M Hilt, PhD", "affiliation": "Lawrence University",
                          "role": "PRINCIPAL_INVESTIGATOR" } ],
  "nLocations": 1,
  "locations_sample": [
    { "facility": "Lawrence University", "city": "Appleton", "state": "Wisconsin",
      "zip": "54911", "country": "United States",
      "geoPoint": { "lat": 44.26193, "lon": -88.41538 } }
  ],
  "hasResults": true,
  "results": { "nOutcomeMeasures": 57,
               "adverseEvents": { "frequencyThreshold": "0", "nSeriousEvents": 1,
                                  "firstSerious": { "term": "Suicide Attempt",
                                                    "organSystem": "Social circumstances" } } }
}
```

*Academic sponsor: named PI in `responsibleParty` **and** `overallOfficials`, named facility, `role` populated, nothing anonymized — the clean case the org-join should be scoped to. Also note the adverse-event terms are clinically sensitive even though the record is public; a patient-facing surface should not render `resultsSection` AE detail casually.*

## Appendix C — Sample 3: AI/ML-intervention trial (`NCT07087613`, trimmed)

```json
{
  "nctId": "NCT07087613",
  "briefTitle": "Deep Learning Detection of Pulmonary Hypertension and Low Ejection Fraction Via Digital Stethoscope",
  "organization": { "fullName": "Eko Devices, Inc.", "class": "INDUSTRY" },
  "status": { "overallStatus": "RECRUITING", "startDate": "2025-06-15",
              "primaryCompletionDate": "2027-05-31", "completionDate": "2027-05-31",
              "firstPostDate": "2025-07-28", "lastUpdatePostDate": "2026-06-18" },
  "sponsor": { "lead": { "name": "Eko Devices, Inc.", "class": "INDUSTRY" },
               "responsibleParty": { "type": "SPONSOR" } },
  "conditions": ["Hypertension, Pulmonary", "Heart Failure With Reduced Ejection Fraction"],
  "design": { "studyType": "OBSERVATIONAL", "phases": null,
              "enrollment": { "count": 3850, "type": "ESTIMATED" },
              "allocation": null, "masking": null, "primaryPurpose": null },
  "interventions": [ { "type": "DEVICE", "name": "Eko CORE 500 Digital Stethoscope" } ],
  "primaryOutcomes": [
    { "measure": "Sensitivity and specificity of the deep-learning algorithm for detecting pulmonary hypertension (PH)",
      "timeFrame": "Up to 24 months" } ],
  "eligibility": { "sex": "ALL", "minimumAge": "18 Years", "maximumAge": null,
                   "healthyVolunteers": null, "stdAges": ["ADULT", "OLDER_ADULT"] },
  "overallOfficials": [ { "name": "Rose McDonough, MD",
                          "affiliation": "Senior Manager, Medical Affairs",
                          "role": "STUDY_DIRECTOR" } ],
  "nLocations": 4,
  "locations_sample": [
    { "facility": "Prairie Cardiovascular", "city": "O'Fallon", "state": "Illinois",
      "zip": "62269", "country": "United States", "status": "RECRUITING",
      "geoPoint": { "lat": 38.59227, "lon": -89.91121 } }
  ],
  "hasResults": false
}
```

*Three structural lessons in one record: **observational studies null out `phases`/`allocation`/`masking`/`primaryPurpose`**, so a mapper assuming interventional shape will NPE; there is **no `resultsSection` at all** (only 79,594 of 597,913 have one — always branch on `hasResults`); and `overallOfficials[].affiliation` here is **"Senior Manager, Medical Affairs"** — a *job title*, not an organization. That field is not reliably an org name, which is another reason the investigator join in §6 doesn't hold up.*

---

## Appendix D — Reproducing this

```bash
API=https://clinicaltrials.gov/api/v2

# schema tree — read this before writing any mapper
curl -s "$API/studies/metadata" | python3 -m json.tool | less

# the Leuk slice
curl -s -G "$API/studies" -d countTotal=true -d pageSize=0 \
  --data-urlencode 'filter.advanced=AREA[ConditionSearch]( depression OR anxiety OR "mental health" ) AND AREA[LocationState]New York' \
  -d 'filter.overallStatus=RECRUITING' | python3 -c 'import json,sys;print(json.load(sys.stdin)["totalCount"])'

# nightly delta
curl -s -G "$API/studies" -d pageSize=1000 \
  --data-urlencode 'filter.advanced=AREA[LastUpdatePostDate]RANGE[2026-08-09,MAX]'

# full corpus (2.53 GB, ~74s) — format=json.zip only, no filters accepted
curl -o ctg-studies.json.zip "$API/studies/download?format=json.zip"
```

**Two traps worth remembering:** `fields` is a strict allowlist, so request every field you filter or branch on — omitting one yields silent `None`s, not an error. And CSV uses human-readable column names (`NCT Number`) while JSON uses schema names (`NCTId`); passing one to the other is a `400`.
