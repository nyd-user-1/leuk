# ORCID Public API Recon — 2026-08-10

**Mode:** read-only. No DB writes, no ingest, no code changes. Free HTTP only (~200 requests, all `GET`/token `POST`).
**Creds:** `ORCID_CLIENT_ID` / `ORCID_CLIENT_SECRET` sourced from `.env.local` at runtime; the access token was written to a session scratchpad (mode 600), never to the repo, never logged.
**Base:** `https://pub.orcid.org/v3.0` · token from `https://orcid.org/oauth/token`

---

## TL;DR

1. **Auth is trivial and the token is effectively permanent.** `client_credentials` + `scope=/read-public` returned `200` on the first attempt. `expires_in` is **631,138,518 s ≈ 20 years**. There is no refresh dance, no per-user consent, no portal subscription step. Contrast with the Aetna recon — this one just works.
2. **The search layer is the good part; the records are the weak part.** Search is a full Solr/Lucene surface (23 validated fields, boolean queries, 1,000 rows/page, deep paging past 10k) over **29.1M records**. But the records themselves are thin and self-curated: Yann LeCun's record has **zero works**, Bengio has 20. Neither is remotely a publication list. Do not treat ORCID as a bibliography.
3. **There is no NPI, no state license, no DEA — so there is no clean join to Leuk's provider directory.** Person-level external IDs in the wild are ResearcherID and Scopus Author ID only. Any ORCID→provider match must go through fuzzy name + institution, which at our scale means false positives on common names. §7 has the honest recommendation: **this is not a directory data source for us.** The one genuinely useful angle is org-side (ROR).
4. **Rate limits are published and I hit them empirically.** 12 req/s sustained, burst 40, **100k reads/day per client ID**, `503` on burst exceed. My 24-way parallel burst measured 11.5 req/s — right at the cap. A full crawl of 29.1M records is ~291 days at quota. Bulk is the annual CC0 public data file, not the API.

---

## 1. Auth

```
POST https://orcid.org/oauth/token
  client_id=…&client_secret=…&grant_type=client_credentials&scope=/read-public
→ 200
{"access_token":"ec577447-…","scope":"/read-public","orcid":"",
 "token_type":"bearer","expires_in":631138518}
```

All subsequent calls: `Authorization: Bearer <token>` + `Accept: application/json`.

| Property | Value |
|---|---|
| Token lifetime | ~20 years — no refresh logic needed |
| Scope | `/read-public` — public-visibility data only |
| Consent | None. Client credentials, no user in the loop |
| Registration | Already done; creds work as-is |

**Gotcha:** the API also answers *anonymously* (no `Authorization` header) at a lower quota — 25k reads/day per IP vs 100k per client ID. Always send the token, or we silently fall back to the IP bucket and collide with anything else on that egress.

---

## 2. Record anatomy — every section

`GET /v3.0/{orcid}/record` returns six top-level keys: `orcid-identifier`, `preferences`, `history`, `person`, `activities-summary`, `path`.

### 2.1 `history` — record trustworthiness

The most under-appreciated block. It is how you decide whether a record is worth believing.

| Field | Meaning |
|---|---|
| `claimed` | `true` = a human owns and controls it. `false` = created by an institution, never confirmed |
| `verified-email` / `verified-primary-email` | Email ownership proven |
| `creation-method` | `MEMBER_REFERRED`, `DIRECT`, `WEBSITE`, `API` — provenance of the record |
| `last-modified-date` | Epoch ms. The only freshness signal available |

Filter on `claimed:true` + `verified-email:true` before trusting anything. Unclaimed records are a large share of the 29.1M and are frequently stubs.

### 2.2 `person`

| Section | Content | Observed reality |
|---|---|---|
| `name` | `given-names`, `family-name`, `credit-name` | Reliable. `credit-name` often carries suffixes ("MD", "PhD") |
| `other-names` | Aliases, maiden names, transliterations | Sparse |
| `biography` | Free text, **in the record's locale** — Bengio's is French (`preferences.locale: "fr"`) | Present on serious records |
| `researcher-urls` | Named links (homepage, lab, Twitter) | Useful, sparse |
| `emails` | **Almost always `[]`** — default visibility is private | Effectively unavailable |
| `addresses` | ISO country code **only**. No street/city | Coarse but reliable |
| `keywords` | Self-declared research terms, free text, unnormalized, any language | Rich on real records; not a controlled vocabulary |
| `external-identifiers` | Cross-system IDs | Sampled types: **ResearcherID, Scopus Author ID**. No NPI/ISNI in sample |

### 2.3 `activities-summary` — eleven sections

Six are *affiliation-shaped* (identical schema, `affiliation-group[].summaries[]`): **employments, educations, qualifications, distinctions, invited-positions, memberships, services**. Two are *group-shaped* (`group[]`, deduped by external ID): **works, peer-reviews, fundings**. Plus **research-resources**.

Every affiliation entry carries the same shape — this is the highest-quality structured data in ORCID:

```json
{ "department-name": "Département d'informatique et de recherche opérationnelle (DIRO)",
  "role-title": "Professeur titulaire",
  "start-date": {"year":"1993","month":"09","day":"01"}, "end-date": null,
  "organization": {
    "name": "Université de Montréal",
    "address": {"city":"Montreal","region":"Quebec","country":"CA"},
    "disambiguated-organization": {
      "disambiguated-organization-identifier": "https://ror.org/0161xgx34",
      "disambiguation-source": "ROR" } },
  "put-code": 36453982, "visibility": "public" }
```

**`disambiguated-organization` is the single most valuable field in the API.** Sources seen: `ROR`, `FUNDREF` (Crossref Funder Registry DOI), plus `GRID`/`RINGGOLD`/`LEI` per the schema. It turns a free-text org name into a joinable key.

`end-date: null` means *current*. That's how you compute present affiliation.

### 2.4 Works

Grouped by external ID — one `group` = one logical output, possibly asserted by several sources.

- Summary fields: `put-code`, `title`, `type`, `publication-date`, `external-ids`, `url`, `journal-title`, `source`.
- Types seen on Bengio: `journal-article` ×16, `report` ×2, `preprint`, `conference-paper`. Schema also allows `book-chapter`, `dataset`, `dissertation`, `patent`, `software`, etc.
- External-id types: `doi` on all 20. Schema also supports `pmid`, `pmc`, `arxiv`, `isbn`, `eid`, `handle`.
- **`source` is the tell.** Bengio's works are sourced from **Crossref** (`source-client-id 0000-0001-9884-1913`), not from Bengio. Works arrive via publisher auto-deposit into whoever has claimed the ORCID; they are not a curated list.
- **Contributors only appear in the full work fetch**, not the summary. And `contributor-orcid` is **`null`** on all 10 contributors of the sampled paper — co-authors are name strings, not linked iDs. **You cannot build a co-authorship graph from this.**

### 2.5 Fundings

Best-structured section after affiliations:

```json
{ "title": "APPLICATION OF MACHINE INTELLIGENCE TO MEDICAL IMAGE INTERPRETATION…",
  "type": "grant",
  "organization": {"name":"Canadian Institutes of Health Research",
    "disambiguated-organization": {
      "disambiguated-organization-identifier":"http://dx.doi.org/10.13039/501100000024",
      "disambiguation-source":"FUNDREF"}},
  "amount": {"value":"150000.0","currency-code":"CAD"},
  "start-date":"2020-05", "end-date":"2023-05" }
```

`amount` + `short-description` + `organization-defined-type` + `contributors` appear **only in the full fetch** (`/funding/{put-code}`), not the summary. Coverage is low — 1 of the 21 records I sampled had any funding at all.

### 2.6 Peer-reviews

Double-nested (`group[].peer-review-group[].peer-review-summary[]`). Anonymized by design: you get the **reviewing organization** (e.g. Nature Publishing Group), `review-type`, `completion-date`, and an opaque `source-work-id` hash — never which manuscript. Grouped by journal ISSN. Useful as a signal of reviewer activity, useless for content.

### 2.7 Section endpoints

Every section is independently addressable — fetch only what you need:

```
/{id}/record            53 KB (Bengio)   ← everything
/{id}/works             31 KB
/{id}/person             8.8 KB
/{id}/educations         2.2 KB
/{id}/peer-reviews       2.0 KB
/{id}/employments        1.3 KB
/{id}/keywords, /external-identifiers, /researcher-urls, /fundings, …
/{id}/work/{put-code}    full detail incl. contributors
/{id}/funding/{put-code} full detail incl. amount
```

`/{id}/record-summary` → **404** (not on v3.0 public).

---

## 3. Search

Two endpoints matter.

### `expanded-search/` — the useful one

Returns `orcid-id`, `given-names`, `family-names`, `credit-name`, `other-name[]`, `email[]`, `institution-name[]` + `num-found`. One call gets you identity *and* affiliations — no per-record follow-up needed for triage.

### `search/` — returns bare `orcid-identifier` paths only. Skip it.

### `csv-search/` — best for bulk harvest

Supports an `fl` projection list. Lightest possible payload:

```
GET /v3.0/csv-search/?q=family-name:Bengio+AND+given-names:Yoshua
    &fl=orcid,given-names,family-name,current-institution-affiliation-name
Accept: text/csv

orcid,given-names,family-name,current-institution-affiliation-name
0000-0002-9322-3515,Yoshua,Bengio,"Université de Montréal,CIFAR,LoiZéro,Mila…,IVADO"
```

Default columns: `orcid, email, given-names, family-name, given-and-family-names, current-institution-affiliation-name, past-institution-affiliation-name, credit-name, other-names`.

### Validated field list

I tested 28 candidate fields. **Valid (23):**

`orcid` · `given-names` · `family-name` · `credit-name` · `other-names` · `email` · `affiliation-org-name` · `current-institution-affiliation-name` · `past-institution-affiliation-name` · `ror-org-id` · `grid-org-id` · `ringgold-org-id` · `funding-titles` · `digital-object-ids` · `doi-self` · `work-titles` · `keyword` · `biography` · `external-id-reference` · `pmc` · `pmid` · `isbn` · `text`

**Invalid (→ HTTP 500):** `scopus-id`, `researcher-id`, `profile-submission-date`, `last-modified-date`, `record-type`.

> ⚠️ **Gotcha: an unknown field name returns `500`, not `400`.** A typo looks exactly like an ORCID outage. Validate field names before shipping any query builder, and don't wire a `500` here to an alerting path.

> ⚠️ **`last-modified-date` is not searchable.** There is no "give me everything changed since X" query on the public API. This is the single biggest obstacle to incremental sync (§6).

### Behaviour

| Probe | Result |
|---|---|
| Boolean/fielded Lucene (`AND`, quoted phrases, `*` wildcards) | Works |
| `rows` max | **1,000** (1,001 → `400`) |
| Deep paging | `start=10000` returns results — **no 10k cap** observed; paging runs to `num-found` |
| `*:*` | 29,101,775 records |

### Query examples that worked

```
given-names:Yoshua AND family-name:Bengio                  → 1
affiliation-org-name:"Mila"                                → 542
ror-org-id:"https://ror.org/0161xgx34"                     → 5,025
keyword:"deep learning"                                    → 17,413
family-name:LeCun AND affiliation-org-name:"New York University" → 1
```

---

## 4. Rate limits & bulk

### Published (confirmed on info.orcid.org)

| Tier | req/s | Burst | Daily quota |
|---|---|---|---|
| Anonymous | 12 | 40 | 25k reads/day **per IP** |
| **Public (our tier)** | **12** | **40** | **100k reads/day per Client ID** |
| Member | 24 | 40 | none |

Exceeding burst → **`503`**. Exceeding the daily quota → blocked until the window resets.

### Measured

- 40 sequential requests: 5.77 s → **6.9 req/s**, no throttle.
- 48 requests, 24-way parallel: 4.17 s → **11.5 req/s**, zero `503`. Sits right on the published 12 req/s ceiling — the cap is real and the shaping is smooth rather than rejecting.
- **No rate-limit headers are exposed.** No `X-RateLimit-Remaining`, no `Retry-After`. We must track our own daily spend against the 100k budget; the API will not tell us how close we are.

At 100k reads/day, crawling all 29.1M records one-by-one is **~291 days**. The API is for targeted lookup, not enumeration.

### Bulk options

1. **Annual public data file — the real bulk path.** CC0 (public domain, no attribution required), hosted on Figshare (2025 file: `doi.org/10.23640/07243.30375589.v1`). XML only since 2018, `tar.gz`, sharded into folders by the last three digits of the iD, with separate summary and activities archives. ORCID ships an XML→JSON conversion library on GitHub. **If we ever want the whole corpus, this is how — not the API.**
2. **Bulk works fetch:** `GET /{id}/works/{putCode1},{putCode2},…` — **max 100 put-codes** per call (101 → `400`). Cuts full-detail work fetching by 100×.
3. **Webhooks** — member-scope. My probe was rejected by ORCID's WAF (the encoded `//` in the callback URL trips a malicious-string filter), so I could not confirm behaviour on our tier; the docs place it under Member API.

---

## 5. Data-quality findings

These matter more than the schema.

**Records are sparse and self-curated.** Section counts across 21 sampled AI researchers:

| Record | works | employments | educations | fundings |
|---|---|---|---|---|
| Yoshua Bengio | 20 | 1 | 2 | 0 |
| **Yann LeCun** | **0** | 1 | 2 | 0 |
| Léon Bottou | 12 | 0 | 0 | 0 |
| Richard Sutton | 3 | 3 | 0 | 0 |
| Most sampled records | 0–2 | 0–1 | 0–2 | 0 |

A Turing Award laureate with zero works is not an edge case — it is the norm. ORCID measures *engagement with ORCID*, not scholarly output.

**Name search does not resolve people.** `given-names:"Fei-Fei" AND family-name:Li` returns **three distinct records**, none of them the Stanford researcher. `family-name:Schmidhuber` returns Michael, Christoph, Christina — not Jürgen. Common names are worse. **Name alone is not an identity resolver**; you need name + affiliation + a claimed/verified filter, and even then expect misses.

**Reverse DOI lookup is near-useless.** `doi-self:"10.1038/nature14539"` (LeCun/Bengio/Hinton, *Deep Learning*, Nature 2015 — one of the most-cited CS papers ever) returns **2 records**, neither an author. You cannot go paper → authors here. Use Crossref or OpenAlex for that.

**Wildcard search is loose.** `email:*@mila.quebec` returned 5 records, the top hit being someone whose affiliations are Istanbul Technical University and METU. Treat wildcard results as suggestive, not filtered.

**Locale matters.** `preferences.locale` drives the biography and keyword language. Bengio's keywords are French (`Causalité`, `Modèles génératifs`). Any keyword matching must be locale-aware or it will silently under-match non-English records.

---

## 6. Incremental sync — the hard constraint

There is **no** public mechanism to poll for changes:

- `last-modified-date` is not a searchable field (`500`).
- No changes/updates feed on the public API.
- Webhooks are member-scope.
- The public data file is **annual**.

So the only options are (a) re-fetch a watchlist of iDs on a schedule and diff `history.last-modified-date` ourselves, or (b) accept annual freshness from the data file. For a watchlist of N researchers, refresh cost is N reads against the 100k/day budget — cheap up to ~50k iDs/day. That's workable *if* we have a bounded watchlist, which brings us to §7.

---

## 7. What's actually useful to Leuk

I'll be straight: **ORCID is a poor fit for Leuk's core domain, and we should not build directory ingest on it.**

### Why the obvious idea doesn't work

The tempting play is enriching `/directory` provider profiles with credentials and publications. It fails on two independent grounds:

**No join key.** ORCID carries no NPI, no state license number, no DEA, no taxonomy code. I checked explicitly — person-level external IDs in the wild are ResearcherID and Scopus Author ID. `other-id:NPI` and `external-id-type:"NPI"` are not even valid fields. Every ORCID→Leuk-provider match would be fuzzy name + institution. Given §5's evidence that name search returns the wrong Fei-Fei Li three times over, a fuzzy join at directory scale produces false attributions — and attaching the wrong person's credentials to a provider profile in a healthcare product is a materially bad failure, not a cosmetic one.

**Coverage is thin where we care.** Measured:

| Query | Records |
|---|---|
| All ORCID | 29,101,775 |
| `affiliation-org-name:"Icahn School of Medicine at Mount Sinai"` | 5,447 |
| `affiliation-org-name:"NYU Langone Health"` | 3,017 |
| `affiliation-org-name:"Northwell Health"` | 1,758 |
| `affiliation-org-name:"NewYork-Presbyterian Hospital"` | 876 |
| `keyword:"primary care"` | 965 |
| `keyword:"family medicine"` | 593 |
| `keyword:"psychotherapy"` | 1,587 |

Northwell employs on the order of 85,000 people. 1,758 ORCID records is ~2%, and skewed hard toward academic researchers rather than the practicing clinicians in our directory. For the independent and small-group practices Leuk actually serves, coverage approaches zero. ORCID skews academic-research, and we skew community-practice.

### What *is* worth something

**Org-side enrichment via ROR, not person-side via name.** `ror-org-id` and `affiliation-org-name` let us enumerate the research footprint of a health system as a single clean query. For `/orgs/[tin]` pages, "N ORCID-registered researchers, top research keywords, active grant funders" is a real, cheap, defensible signal — one search call per org, no fuzzy person matching, and the ROR ID is an exact key. That's the one integration I'd actually endorse, and it's a small one.

**Specific fields worth keeping if we ever do ingest:**

| Field | Why |
|---|---|
| `organization.disambiguated-organization` (ROR/FUNDREF) | The only exact join key in the whole API |
| `employments[].{role-title, department-name, start-date, end-date:null}` | Clean current-affiliation with provenance |
| `educations[].{organization, role-title, end-date}` | Degree + institution + year, well-structured |
| `history.{claimed, verified-email}` | Trust gate — filter on these first, always |
| `fundings[].{organization, amount, FUNDREF id}` | Funder + amount, when present |
| `keywords` | Research-interest tags (locale-aware!) |

**Fields to ignore:** `emails` (always empty), `contributors[].contributor-orcid` (always null), `peer-reviews` (anonymized), `addresses` (country only).

### Recommendation

Do **not** put ORCID on the ingest roadmap as a provider data source. If someone wants the credential-enrichment feature, the right sources are NPPES (which we already load) for taxonomy/identity and state license boards for credentials — both of which key on NPI and actually cover community practice.

Keep ORCID in the back pocket for one narrow use: **ROR-keyed research-footprint stats on org pages.** One search call, exact key, no PHI, no fuzzy matching, ~zero maintenance. If that surface never gets built, we lose nothing.

---

## Appendix A — Sample 1: trimmed record (Yoshua Bengio, `0000-0002-9322-3515`)

```json
{
  "orcid": "0000-0002-9322-3515",
  "history": { "claimed": true, "verified-email": true,
               "creation-method": "MEMBER_REFERRED", "last-modified-ms": 1779123148135 },
  "name": { "given": "Yoshua", "family": "Bengio", "credit": null },
  "biography": "Yoshua Bengio est professeur titulaire en informatique à l'Université de Montréal, coprésident et directeur scientifique…",
  "keywords": ["Machine learning, deep learning", "Causalité", "Modèles génératifs",
               "Modèles probabilistes", "Théorie de l'apprentissage automatique"],
  "researcher-urls": [{ "name": "Home page", "url": "http://www.iro.umontreal.ca/~bengioy" }],
  "emails": [],
  "country": ["CA"],
  "external-identifiers": [],
  "employments": [
    { "org": "Université de Montréal", "ror": "https://ror.org/0161xgx34", "source": "ROR",
      "country": "CA", "dept": "Département d'informatique et de recherche opérationnelle (DIRO)",
      "role": "Professeur titulaire", "start": "1993-09-01", "end": null, "put-code": 36453982 }
  ],
  "educations": [
    { "org": "McGill University", "role": "PhD", "start": "1988-01-01", "end": "1991-09-30" },
    { "org": "McGill University", "role": "MSc", "start": "1986-01-01", "end": "1988-01-01" }
  ],
  "qualifications": [
    { "org": "AT&T Bell Labs", "role": "Postdoc Fellow" },
    { "org": "Massachusetts Institute of Technology", "role": "Postdoc Fellow," }
  ],
  "memberships": [
    { "org": "LoiZéro", "role": "Co-président et directeur scientifique" },
    { "org": "Mila - Institut québécois d'intelligence artificielle",
      "role": "Fondateur, conseiller scientifique et membre académique principal" },
    { "org": "IVADO", "role": "Conseiller spécial et directeur scientifique fondateur d'IVADO" }
  ],
  "invited-positions": [{ "org": "CIFAR", "role": null }],
  "works_first3_of_20": [
    { "put-code": 204407618,
      "title": "OBELiX: a curated dataset of crystal structures and experimentally measured ionic conductivities for lithium solid-state electrolytes",
      "type": "journal-article", "doi": "10.1039/D5DD00441A", "source": "Crossref" }
  ],
  "counts": { "educations": 2, "employments": 1, "invited-positions": 1,
              "memberships": 3, "peer-reviews": 1, "qualifications": 2, "works": 20 }
}
```

## Appendix B — Sample 2: funding detail + expanded-search

```json
{
  "funding": {
    "put-code": 901162,
    "title": "APPLICATION OF MACHINE INTELLIGENCE TO MEDICAL IMAGE INTERPRETATION AND HIGH-RISK PATIENT IDENTIFICATION IN INFLAMMATORY BOWEL DISEASES",
    "type": "grant",
    "org": "Canadian Institutes of Health Research",
    "funder-id": "http://dx.doi.org/10.13039/501100000024",
    "funder-id-source": "FUNDREF",
    "country": "CA",
    "amount": { "value": "150000.0", "currency-code": "CAD" },
    "start": "2020-05", "end": "2023-05",
    "source": "Reed Taylor Sutton"
  },
  "expanded_search": {
    "query": "affiliation-org-name:\"Mila\" AND keyword:\"deep learning\"",
    "num-found": 12,
    "results": [
      { "orcid-id": "0009-0007-2123-5158", "given-names": "Damien",
        "family-names": "Martins Gomes",
        "credit-name": null, "other-name": [], "email": [],
        "institution-name": ["Concordia", "IPSA",
                             "Mila - Institut québécois d'intelligence artificielle"] }
    ]
  }
}
```

---

## Appendix C — Reproducing this

```bash
set -a; source <(grep -E '^ORCID_(CLIENT_ID|CLIENT_SECRET)=' .env.local); set +a
TOK=$(curl -s -X POST https://orcid.org/oauth/token -H 'Accept: application/json' \
  -d "client_id=$ORCID_CLIENT_ID" -d "client_secret=$ORCID_CLIENT_SECRET" \
  -d grant_type=client_credentials -d scope=/read-public | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')

curl -s -H "Accept: application/json" -H "Authorization: Bearer $TOK" \
  'https://pub.orcid.org/v3.0/0000-0002-9322-3515/record' | python3 -m json.tool
```

**Note for zsh users:** unquoted `$(…)` does **not** word-split in zsh. `for id in $ids` iterates once over the whole string. Use `${=ids}` or drive the loop from Python — this cost a debugging cycle during the recon.
