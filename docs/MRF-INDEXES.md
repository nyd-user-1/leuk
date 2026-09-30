# MRF payer indexes — the permanent answer to "give me the URLs"

_Verified live 2026-07-18 (curl HEAD / ranged GET). One section per payer we
hold or want. The **index URL** is the stable entry point you re-visit to mint
a new manifest; whether the **file URLs** it yields expire decides how long a
minted manifest stays runnable. Manifest format + pipeline prefixes:
`ops/harvest/README.md`. The scanner handles both TiC schema generations — see
the Schema 2.0 note at the bottom._

| payer | index | file URLs | plan/EIN book | manifest(s) |
|---|---|---|---|---|
| Aetna/CVS | open HealthSparq egress JSON | stable | **YES → 15,221 plans loaded** | `aetna-*.txt` |
| MVP | open HealthSparq egress JSON | stable | YES (334 EINs loaded) | `queue/mvp.txt` |
| Excellus | open HealthSparq egress JSON (ToC hop) | stable | YES (851 EINs loaded) | — (sized, unminted) |
| Univera | open HealthSparq egress JSON (ToC hop) | stable | thin at top (23 EINs) | — (sized, unminted) |
| Independent Health | open HealthSparq egress JSON | stable | YES (168 EINs) | ✅ 4 files loaded 2026-07-18 (ad-hoc) |
| Oscar (+ Optum BH carve-out) | open S3 bucket, **listing enabled** | stable S3 | no (plan-level) | staged `oscar-obh.txt` + `oscar-medical.txt` |
| UHC/Oxford | open JSON API (21 MB, all blobs) | stable API path | names-only (67,111, NO EIN) | `uhc-p3.txt` |
| Anthem/Empire + Highmark | S3 ToC gz (10.5 GB, mine it) | **signed, ~1 mo** | in ToC (bloated) | `empire*/highmark*` |
| Cigna | page link (browser) → index gz | signed, **~10 yr** | in ToC | `cigna-*.txt` |
| CDPHP | human page → 3 product zips | stable S3 | no (product-level) | `cdphp.txt` |
| MetroPlus | Azure blob date-probe (page is stale) | stable Azure blob | no | monthly QHP+GoldCare pair |
| EmblemHealth | listing site → GetFile | stable GetFile | no (product-level) | `emblem.txt` |
| Fidelis/Centene | centene.com page | stable CDN | no (product-level) | `fidelis.txt` |
| Humana | **none** (listing dead since 2025-01; bucket deleted) | — | no | — (no commercial book exists) |

---

## Aetna / CVS (Aetna Life Insurance Company)

- **Index**: `https://mrf.healthsparq.com/aetnacvs-egress.nophi.kyruushsq.com/prd/mrf/AETNACVS_I/ALICSI/latest_metadata.json`
  — open GCS egress, no auth (NYS-28). 7 MB, 12,030 entries (9,329 in-network).
  Saved: `.harvest/mrf/aetna-metadata.json`. ✅ live 2026-07-18.
  (The human portal `health1.aetna.com/app/public/#/one/insurerCode=AETNACVS_I&brandCode=ALICFI/machine-readable-transparency-in-coverage`
  is Incapsula-guarded; the egress is not — never fight the portal.)
- **File URLs**: stable — `https://mrf.healthsparq.com/aetnacvs-egress…/prd/mrf/AETNACVS_I/ALICSI/<filePath>`.
- **Mint**: fetch `latest_metadata.json` → filter `fileSchema == IN_NETWORK_RATES`
  → prepend the egress base to `filePath`. **Dedup by the content hash in the
  filename** (`…tr25-<sha256>_…`) — thousands of per-plan entries stamp the same
  bytes. Aetna duplicates rates per-NPI-per-TIN-per-plan: dense files must go
  `stream-` (pipe-to-DB) per NYS-28.
- **Plan/EIN book: YES — the reference case.** `reportingPlans[].planId` is the
  employer EIN; `scripts/mrf/ingest-plans.mjs` turned it into `employers`
  (2,315) + `plans` (15,221). This is the layer Form 5500 (sql/040) now joins.

## MVP Health Care  ✅ minted this tranche

- **Index**: `https://mrf.healthsparq.com/mvp-egress.nophi.kyruushsq.com/prd/mrf/MVP_I/MVP/latest_metadata.json`
  — open egress, same family as Aetna. 847 entries / 655 in-network / 582
  distinct files, forward-dated 2026-08-01. Saved: `.harvest/mrf/mvp-index.json`.
  ✅ live 2026-07-18. (Human page: `mvphealthcare.com/developers/machine-readable-files`
  → the `mvp.healthsparq.com` portal; the portal API POST is Imperva-403'd —
  irrelevant, use the egress.)
- **File URLs**: stable, same egress base + `filePath`.
- **Mint**: the 582 per-EIN files are per-employer stamps of ~9 product
  schedules (within-bucket sizes differ <0.2%). One or two files per NY product
  bucket suffice — see `queue/mvp.txt` (12 files, second pick = the bucket's
  size outlier as the custom-deal hedge). VT buckets excluded.
- **Plan/EIN book: YES** — 561 group plans with EIN planIds in the index
  itself, plus two TABLE_OF_CONTENTS files (`2026-08-01_MVP_index.json.gz`,
  `2026-08-01_ASO_index.json.gz`). An `ingest-plans` pass here is the second
  payer's employer census when wanted.

## Excellus BCBS  🔓 cracked this tranche (was "walled", NYS-29)

- **Index**: `https://mrf.healthsparq.com/exc-egress.nophi.kyruushsq.com/prd/mrf/EXC_I/EXC/latest_metadata.json`
  — open egress. **The Incapsula wall NYS-29 recorded guards only the portal;
  the egress pattern `<insurerCode-minus-_I, lowercased>-egress` opens it**, the
  same discovery that opened MVP. Saved: `.harvest/mrf/excellus-index.json`.
  ✅ live 2026-07-18. (Human page: `news.excellusbcbs.com/developer-info/transparency-coverage-mrf`.)
- **Shape differs from Aetna/MVP**: the index holds **117 TABLE_OF_CONTENTS
  entries** (per-employer ASO ToCs, mostly allowed-amounts) of which two master
  ToCs carry the in-network book: **2,632 distinct in-network URLs**
  (`G-<groupId>-innetwork-1_EXC_<IND|LG|SM|SYR|ES>_N.json.zip` — per-group ×
  market segment), all stable on the same egress.
- **Sizing (measured, not assumed)**: sampled files are TINY (124–416 KB
  zipped; one decompressed to 4.4 MB / 9,029 items) — per-group custom sets,
  heavy on institutional revenue-code rates; the sampled group's 4 NPIs were
  facility NPIs outside our 106,497-practitioner book. Consistent with the
  coverage audit's geography finding (upstate uncovered-rate is *lower* than
  NYC): **fund a full sweep for depth/corroboration, not headline coverage.**
  Whole-book cost is bounded: 2,632 small zips, single-digit GB total.
- **Mint**: fetch index → fetch the two master ToCs → collect
  `in_network_files[].location` → manifest with `|zip|` decomp. Many-small-files
  shape: shard the manifest.
- **Plan/EIN book: YES — LOADED 2026-07-18** (`scripts/mrf/ingest-plans-hsq.mjs
  --name=plan`): 851 ein employers / 2,074 plans into sql/020, tagged
  `source='excellus-mrf'`, 848 net-new. Public-sector heavy (school districts,
  towns) — an upstate-flavored census. 296 (34.8%) overlap `form5500_filings`.
  Caveat: a minority of top-level `planName`s are product labels ("Blue Choice
  25"), not sponsor names — the EIN is still the authoritative identity.

## Univera Healthcare  🔓 cracked 2026-07-18 (T2)

- **Index**: `https://mrf.healthsparq.com/unvra-egress.nophi.kyruushsq.com/prd/mrf/UNVRA_I/UNVRA/latest_metadata.json`
  — open egress, same rule. Portal codes `UNVRA_I`/`UNVRA` from
  `news.univerahealthcare.com/developer-info/transparency-coverage-mrf`. Saved:
  `.harvest/mrf/univera-index.json` (62 MB). ✅ live 2026-07-18.
- **Shape = Excellus's** (Kyruus zip family): 119,307 in-network entries but
  only **3,186 distinct files** (~37× plan-wrapper bloat — dedup by fileName
  before minting, the Anthem discipline). Files are
  `G-<groupId>-innetwork-1_UNV_<ES|IND|LG|SM>_N.json.zip`, per-group × market
  segment, stable on the egress. Product buckets: Healthy NY EPO (1,171),
  Univera Access Silver/Gold/Platinum tiers.
- **Mint**: dedup the 3,186 → shard (many small files). Univera is Excellus's
  WNY sibling (both Lifetime Healthcare); same depth-not-coverage call — the
  audit's upstate geography says it won't move the headline. Not minted.
- **Plan/EIN book: thin at the top level** — only 23 ein planIds on in-network
  entries; the 7 TABLE_OF_CONTENTS files carry the fuller employer book (unmined,
  same per-employer-ToC hop as Excellus).

## Independent Health  🔓 cracked 2026-07-18 (T2)

- **Index**: `https://mrf.healthsparq.com/ihny-egress.nophi.kyruushsq.com/prd/mrf/IHNY_I/IHNY/latest_metadata.json`
  — open egress. Portal codes `IHNY_I`/`IHNY` from
  `independenthealth.com/individuals-and-families/tools-forms-and-more/transparency-in-coverage`
  (the portal is served from `web.healthsparq.com`, but the egress host is the
  same `mrf.healthsparq.com`). Saved: `.harvest/mrf/ihny-index.json` (427 KB).
  ✅ live 2026-07-18.
- **Shape = MetroPlus/MVP-ish** (NOT the zip-per-group family): only **4 distinct
  in-network files**, plain `.json.gz`, product-level —
  `2026-05-01_Independent-Health-<Association|Benefits-Corporation|Corporation>_<HMO|EPO|POS-PPO|IHSFS>_in-network-rates.json.gz`.
  Trivially mintable (4 URLs, `|gz|`). Dated 2026-06-01.
- **Plan/EIN book: YES (168 EINs)** in the index's `reportingPlans` — a real
  Buffalo-area employer book (NYSHIP, iDirect, Passport Select, FlexFit). Load
  with `ingest-plans-hsq.mjs --name=ein` (planName is a product, resolve via
  Form 5500) when wanted. Not loaded this tranche (below the priority line).

## Oscar Health (+ the Optum BH carve-out)  🔓 cracked 2026-07-19 (T2)

- **Index**: none needed — `https://hioscar-cms-tic-us-east-1.s3.amazonaws.com/`
  is an S3 bucket with **public LISTING enabled** (`?list-type=2&prefix=…`).
  Found by grepping the SPA bundle behind
  `hioscar.com/transparency-in-coverage-files/oscar` (the page renders links
  client-side; the bundle hardcodes the bucket). ✅ live 2026-07-19.
- **Layout**: `oscar/{negotiated_rates,optum,cigna,qualcare,davis_vision}/`,
  monthly folders, current through 2026-07-01.
  - `oscar/optum/<YYYY-MM-01>/OSCAR-HEALTH_*_OBH_MRRF_PRD_*.zip` — **the Optum
    Behavioral Health carve-out rate files** (MRRF = rates; ignore the tiny
    per-plan MRAAF allowed-amount zips). THIS is the data §3 of
    PAYER-RESEARCH.md documents as withheld from UHC's own files — for Oscar
    it publishes here. Measured 2026-07-19: the NY-SG file (70 MB zip) alone
    carries **28,480 book NPIs / 692k rows** on the 20-code panel, +419
    net-new vs everything held; all-codes = 948 distinct codes / 4.06M rows.
  - `oscar/negotiated_rates/<YYYYMMDD>/oscar/*-in-network.json` — Oscar's own
    medical book, 29 files / 1.46 GB.
- ⚠️ **Refs-LAST layout** (both the UBH and Oscar generators):
  `provider_references` comes AFTER `in_network`, so plain scan-tic retains
  nothing and reports 0 rows. Use the `rl`/`ziprl` decomp in `run-payer.sh`
  (fetch to temp file, stream the refs section first). `--payer=auto` cannot
  see the header on a reordered stream — label explicitly.
- **`healthfirst/` on the same bucket is Health First of FLORIDA** (plan names
  `HEALTH-FIRST-FL-*`), NOT Healthfirst NY — recorded so nobody re-celebrates
  the wrong crack. Healthfirst NY's MRF entry point remains undiscovered.
- **Plan/EIN book: no** — plan-level names only in the UBH headers.

## UnitedHealthcare / Oxford

- **Index**: `GET https://transparency-in-coverage.uhc.com/api/v1/uhc/blobs`
  — open API, one ~21 MB JSON, all 86,722 blobs, no pagination. ✅ live
  2026-07-18. Recorded: `docs/PAYER-RESEARCH.md` §MRF, `docs/TASK-MRF-POC.md`.
- **File URLs**: stable API path
  `…/api/v1/uhc/blobs/download/{YYYY-MM-DD}/{name}` (302 → blob store).
- **Mint**: pull the blobs JSON → filter `in-network-rates` + the entity you
  want. The tractable subset is the **874 Insurer-level files** (network-wide
  tables); per-employer files are the other ~6,000. Oxford lives HERE (40
  files, ~48 GB) — its NY commercial book has no public FHIR directory at all.
  Behavioral shortcut: `…_Insurer_Behavior-Health_P3_…` is one national
  behavioral table, byte-identical across state entities (loaded 2026-07-12).
- **Plan/EIN book: NAMES ONLY, no EIN (measured 2026-07-18, T2).** The index
  is 86,722 blobs; **67,111 are per-employer `_index.json` ToCs** whose employer
  NAME is in the filename but whose **EIN is only inside the blob** (reading all
  67k is not "index-only"). So UHC's book, unlike the EIN-carrying HealthSparq
  payers, is **not directly Form 5500-joinable**. Distinct-name census extracted
  → `.harvest/mrf/uhc-employer-census.csv` (67,111 rows). A normalized-NAME join
  to `form5500_filings` matched only ~1,774 exact / 2,412 suffix-stripped (≈3%)
  — the book is overwhelmingly national small business, not NY. To make it
  EIN-joinable you must read the per-employer ToCs (bounded at 67k, but a
  separate job).

## Anthem / Empire BCBS NY + Highmark (WNY/NENY) — the signed-URL family

- **Index**: `https://antm-pt-prod-dataz-nogbd-nophi-us-east1.s3.amazonaws.com/anthem/2026-07-01_anthem_index.json.gz`
  (month-versioned name — bump the date). ✅ live 2026-07-18 (206 on ranged
  GET). Human page: `anthem.com/machine-readable-files/` (EIN-lookup UI on the
  same data). Recorded: `docs/MRF-QUEUE.md`.
- **File URLs**: **CloudFront-SIGNED, expire ~1 month** (current batch
  `Expires=1787320849` ≈ 2026-08-19 — still valid today). A minted manifest is
  runnable for days-to-weeks; re-mint from the new month's ToC when it dies.
- **Mint**: the ToC is 10.5 GB gz and repeats each physical file under
  thousands of plans (the Payerset bloat warning) — stream it:
  `curl -sL <toc> | gunzip -c | node scripts/mrf/extract-anthem-ny.mjs --match=<host>`
  (keeps FIRST signed URL per unique basename; `--match=empirebcbs` for Empire,
  `--match=highmarkbcbswny` etc. for Highmark hosts; check the host tally the
  tool prints before trusting a guess).
- ⚠️ **BCBS host-sharing trap**: every `<licensee>.mrf.bcbs.com` host serves
  ALL licensees' files (state-code prefixes: 254=Empire NY, 301=Highmark WNY,
  302=Excellus side-door, 800=Highmark NENY, 05C0=CA…). **Trust file content
  over URL — `--payer=auto --network=auto` is REQUIRED on these hosts**, and
  `--refs=scan` (id-first layout). Empire NY giant items need the two-pass
  pipeline (`2p-` prefix).
- **Plan/EIN book**: in the ToC (reporting_plans on every entry) but bloated
  ~10×; mine with the same root-files-only discipline if ever wanted.

## Cigna

- **Index**: month-versioned gz behind
  `https://d25kgz5rikkq4n.cloudfront.net/cost_transparency/mrf/table-of-contents/reporting_month=YYYY-MM/…index.json.gz`
  — **signed; the bare URL 403s.** The link is served dynamically on
  `cigna.com/legal/compliance/machine-readable-files` (static fetch shows
  "Error fetching MRF link" — it's a JS fetch). **Browser errand: open the
  page, click the ToC download, copy the signed URL from devtools/downloads.**
- **File URLs**: CloudFront-signed **but ~10-year Expires** (current batch
  `Expires=2103508799` ≈ 2036) — effectively permanent once minted. ✅ current
  `cigna-all.txt` URLs live 2026-07-18.
- **Mint**: from the signed ToC gz → national + NY-relevant in-network files
  (`cigna-all.txt` is 9 files). Re-mint only for a fresher month, not expiry.
- **Plan/EIN book**: present in the ToC (standard TiC reporting_plans). Unmined.

## CDPHP

- **Index**: human page `cdphp.com/members/getting-care/transparency-in-coverage`
  listing 3 product zips on S3. Recorded: `docs/MRF-QUEUE.md`, `manifests/cdphp.txt`.
- **File URLs**: **stable S3**, month-versioned names
  (`https://cdphp-s3-us-e-p-pricing.s3.amazonaws.com/data/YYYY-MM-01_CDPHP_in-network-rate.zip`
  + `_CDPHN_` + `_CDPHP-UBI_`). ✅ live 2026-07-18.
- **Mint**: copy the 3 URLs, bump the date; `|zip|` decomp. Wide-code rescan
  already queued (`queue/wide-cdphp.txt`).
- **Plan/EIN book: no** — product-level only (HMO / network / self-funded UBI).

## MetroPlus

- **Index**: NOT the human page. `metroplus.org/machine-readable-files` froze
  2024-03-05, but the Carelon Azure store behind it **publishes monthly
  anyway** — proven 2026-07-18 (NYS-110) by date-probing the container
  (listing is disabled; blob-name guessing works). Naming:
  `https://saeastmrfb2b.blob.core.windows.net/mrf-files/<YYYY-MM-DD>_Metroplus_<QHPExchange|MHPGOLDGOLDCARE>_ffs_in-network.json`
  — monthly since 2024-03, **on the 5th of the month** since 2025-01
  (2024 dates wobble: 03-05, 04-04, 05-16, 06-16, 07-08, 08-20, 09-18,
  10-15, 11-18, 12-09). To find the current pair, probe day 4–20 of the
  latest month with HEAD until 200. ⚠️ **FFS stopped**: the
  `_Metroplus_MetroPlus_ffs_` series has nothing after 2023-10-06 — the
  2023 FFS book is the newest that exists, keep it.
- **File URLs**: stable Azure blob, plain `.json` (`|none|`), big
  (2026-07-05: QHP 7.6 GB, GoldCare 9.9 GB uncompressed).
- **Mint**: the current month's QHP + GoldCare pair. Refreshed 2026-07-18
  (2026-07-05 vintage loaded ad-hoc; superseded 2024-02-07 QHP/GoldCare rows
  retired).
- **Plan/EIN book: no.**

## EmblemHealth (incl. Carelon behavioral)

- **Index**: `https://transparency.emblemhealth.com/` — a listing site whose
  rows resolve to stable GetFile links:
  `…/Home/GetFile?FileName=<name>.json&NetworkType=INN&FileType=Current`.
  ✅ live 2026-07-18 (the 2026-06-05 Beacon/EHIC-Comm file streams).
- **File URLs**: stable (GetFile is a permanent endpoint; `FileType=Current`
  tracks the newest posting of that name). Plain json (`|none|`).
- **Mint**: browse the listing site, take the INN files for the commercial
  networks (Beacon = the Carelon behavioral carve-out — our Emblem book came
  from it). ⚠️ **Beacon/EHIC flipped to schema v2.0** and Carelon's serializer
  ships unescaped quotes inside `business_name`
  (`"TAMELA "TAMMY" ROBY LMFT"`) — the default stream-json refs path dies on
  it ("REFS PARSE ERROR … expected ','"; this killed both 2026-07-18
  wide-emblem runs). **Scan Beacon with `EXTRA_ARGS='--refs=scan'`** — its
  refs are id-first, and the scan path quote-repairs the bad objects
  (2026-07-18: 64,160 refs, 1 repaired, 0 skipped). The HCP file is
  provider-less junk (bare `negotiated_price`, no NPI anywhere in 6.7 MB) —
  0 rows from it is correct, drop it from manifests.
- **Plan/EIN book: no** — network/product-level listing (the v2.0 Beacon file
  header does carry one plan_id/sponsor: EmblemHealth EHIC itself — not a book).

## Fidelis Care (Centene)

- **Index**: `centene.com/price-transparency-files.html` (all Centene
  subsidiaries incl. Fidelis; state-filterable). Recorded: `manifests/fidelis.txt`.
- **File URLs**: stable Centene CDN
  (`centene.com/content/dam/centene/Centene%20Corporate/json/DOCUMENT/…_fidelis-ex_in-network.json`),
  month-versioned names, plain json. ✅ live 2026-07-18.
- **Mint**: pick the `fidelis-ex` (Exchange = the TiC-covered commercial line)
  files off the page, bump dates. Fidelis-ES pretty-prints items (CRLF) — the
  scanner's opener needle handles it.
- **Plan/EIN book: no** — product-level. (Medicaid book is out of TiC scope.)

## Humana — no TiC book exists (verified 2026-09-30)

- **Index**: none. The old listing
  `developers.humana.com/syntheticdata/healthplan-price-transparency`
  (reached from `/Cost-Transparency`) served a DataTables feed
  (`/syntheticdata/Resource/GetData`, 15,668 per-employer `_index.json.gz`
  ToCs as of 2024-06) through **2024-12-30**; it 302'd to a 404 on
  2025-01-30 and 502'd from 2025-02 to 2026-07 (Wayback captures). The
  portal was replaced by an Angular API catalog on 2026-09-09; every old
  path now falls to the SPA catch-all, and `/api/v1/*` is a blanket 401.
  `www.humana.com/legal/*` sits behind a JS bot challenge and the portal
  carries Akamai Shape — not fought, not needed.
- **File URLs**: were stable GCS objects,
  `storage.googleapis.com/cms-humana-price-transparency-prd/prod/<month>/inn/<name>`
  (via a `Resource/DownloadPCTFile` 302). **The bucket is deleted**
  (`NoSuchBucket`, 2026-09-30).
- **Why**: Humana exited Employer Group Commercial Medical (announced
  2023-02-23). Its own Q1 2025 earnings supplement shows commercial
  fully-insured 0 (from 109.7k) and commercial ASO 0 (from 77.7k); the
  FY2025 10-K lists only Medicare, Medicaid, military and specialty
  (dental/vision, TiC-exempt excepted benefits). Humana left the ACA
  individual market after 2017. Nothing Humana sells is TiC-covered.
- **Our Humana FHIR directory is not commercial either**: of 86,339
  participation rows, 73,574 sit on Medicare/Medicaid/military networks;
  the "Employer HMO"/"National Employer HMO-Home27" names are group
  Medicare Advantage (plan-year 2027 suffixes), and the rest are CarePlus,
  Healthy Horizons (Medicaid), Honor/USAA MA and similar.
- **Mint**: nothing to mint. Re-check only if Humana re-enters commercial
  group or individual medical.
- **Plan/EIN book: no** (the 2024 ToCs carried employer names in filenames,
  mostly GA/FL/TX/CO small groups; gone with the bucket).

---

## Schema 2.0 note (verified against fresh files, both directions)

TiC schema **v2.0 became enforceable 2026-02-02** (`business_name` required
beside every EIN tin; provider groups inline). What payers actually ship, as
of 2026-07-18:

- **MVP ships v1.3.1** on a file *dated 2026-08-01* — classic
  `provider_references`, no `business_name`. The enforcement date has NOT
  moved the HealthSparq fleet.
- **Excellus ships v2.0** (`"version":"2.0"`): `business_name` on tin objects
  ("No business name found" when absent), `network_name` arrays on provider
  groups, ToC `"version":"2.0.0"`.
- **scan-tic handles both, proven by running it**: MVP file → 204 rows, all
  20 behavioral CPTs; Excellus v2.0 file → parsed cleanly end-to-end (9,029
  items, opener-delimited items + id-first refs unchanged in v2.0; the zero
  rows were facility NPIs outside the practitioner book, not a parse gap).
  v2.0's `business_name` is upside: it feeds `--tin-names` (sql/019) directly.
- **Watch item**: a payer that adopts v2.0's *inline-only* provider groups
  (dropping `provider_references` entirely) changes the refs phase from
  "small front-loaded section" to "per-item inline" — scan-tic already parses
  inline groups, but re-validate against `.harvest/mrf/fixtures/` before a
  big sweep on any newly-v2.0 payer.

## The egress rule (how two "walled" payers opened)

HealthSparq-portal payers (Aetna, MVP, Excellus, CDPHP, Univera, Independent
Health…) guard the *portal SPA* with Imperva/Incapsula, but serve files from
an open egress with a guessable, stable layout:

```
https://mrf.healthsparq.com/<sub>-egress.nophi.kyruushsq.com/prd/mrf/<INSURER>/<BRAND>/latest_metadata.json
      <sub>     = insurerCode lowercased minus "_I"   (aetnacvs, mvp, exc)
      <INSURER> = insurerCode from the portal URL      (AETNACVS_I, MVP_I, EXC_I)
      <BRAND>   = brandCode from the portal URL        (ALICSI, MVP, EXC)
```

The portal URL (with its insurerCode/brandCode query params) is on each
payer's public MRF page — no browser session needed beyond reading it. Wrong
`<sub>`/`<BRAND>` guesses 301 to a login page; the right one 200s JSON.
Untried candidates: Univera, Independent Health (NYS-29's remaining list).
