# TASK — Humana rate files into Leuk (Transparency in Coverage ingest)

_Brief written 2026-09-30 by the lead session for a worker window. Report by
appending to the **Reports** section at the bottom of this file. Stop at each
gate and wait for a `RULING:` line there. Never message another window._

## Mission

Bring Humana's published in-network negotiated rates into
`provider_rate_signals` for the New York book, the same way the other thirteen
payers were done, and report in the MRF-RESULTS format. Humana's FHIR directory
is already in (86,339 participation rows, 4,524 NY NPIs). Rates are the gap.

The honest outcome may be "Humana has no commercial rate files left." Humana
announced in February 2023 that it was leaving the employer group commercial
medical business, winding down through 2024, and TiC covers commercial
group/issuer products only (Medicare Advantage and Medicaid are out of scope,
the Healthfirst mistake in MRF-QUEUE.md). **Prove the premise before spending
anything.** A well-evidenced "nothing to ingest" is a successful result.

## Read first, in this order

1. `docs/MRF-INDEXES.md` — the permanent answer to "where are the URLs"; note
   Humana is absent, you are adding its section.
2. `docs/MRF-QUEUE.md` — the TiC scope correction and the per-payer warnings.
3. `docs/MRF-RESULTS.md` — the report format you will produce.
4. `docs/HANDOFF-MRF-PICKUP.md` — the last operator's state and traps.
5. `ops/harvest/README.md` — manifests, pipelines, the nightly runner.
6. Memory: `~/.claude/projects/-Users-brendanstanton-Code-leuk/memory/`
   (`handoff-2026-07-12-mrf-rates.md`, `leuk-rate-signals.md`, `MEMORY.md`).
7. `scripts/mrf/` — `scan-tic.mjs`, `load-rate-signals.mjs`, `stream-load.mjs`,
   `run-payer.sh`, `run-stream.sh`, `run-two-pass.sh`, `report.mjs`;
   `sql/017` (the UNIQUE key); `lib/repos/rate-signals.ts` (the only read door).

Do not rewrite the tooling. It is validated byte-identical against the
reference parser and has loaded 16.4 million rows. Fit Humana into it.

## Step 1 — premise and index (no box, no spend)

- Find Humana's TiC index. Start at `developers.humana.com` (their machine-readable
  file listing is served from there; verify the exact path with a browser view
  and with `curl -I`), then the CMS index pointers. Record the index URL, whether
  file URLs are stable or signed (and for how long), and the schema generation.
- Enumerate the in-network files. **Root files only.** Dedupe by content hash or
  canonical blob name and size before anything is downloaded; a table of contents
  that repeats one blob under many plan names balloons a sweep tenfold
  (the Payerset warning).
- Classify every file: commercial group, individual, Medicare Advantage, other.
  Only commercial and individual belong in `provider_rate_signals`. If a file's
  product cannot be told, say so; do not load it.
- Size the manifest with HEAD requests: sum the content lengths, count files,
  note compression. Never guess disk.
- Write the Humana section of `docs/MRF-INDEXES.md` now, in the same shape as
  the others, whatever the answer turns out to be.

**Gate 1.** Append a report: the index, file counts by class, total bytes,
whether a NY-relevant commercial book exists at all, and the run plan with its
cost estimate (below). Then stop and wait for `RULING:`.

## Step 2 — the box (only after Gate 1 is ruled)

- The 302 GB Anthem scan ran at about 700 MB/s; that is the class of machine:
  a compute-optimized Graviton, `c8g.4xlarge` or `c7g.4xlarge` (16 vCPU, 32 GB,
  high network), gp3 disk sized to the manifest plus 30 percent, spot if it is
  offered, on-demand otherwise. Report the instance type, disk, and dollars per
  hour before launching; the standing cap for this task is **$10 total** unless
  the ruling says more.
- Run it the way the other worker boxes run: a `run-job` style wrapper that
  stops the instance when the job exits or goes idle (the 44b worker pattern,
  `livingston/ops/box` for the govblock pattern), a checkpoint file, a
  babysit/resume line written into the report so anyone can pick it up, and the
  `KILL SWITCH` convention from `.harvest/babysit.sh`.
- Parallelism: downloads with bounded concurrency (start at 8, raise while the
  CDN stays clean), scans one per core (`xargs -P $(nproc)` or GNU parallel),
  the database load **sequential, single writer**, idempotent. Measure for five
  minutes before scaling anything. Dense per-NPI-per-TIN-per-plan files go
  through `stream-` (pipe to DB); reference-dense files go `2p-`.
- Download large archives to disk; do not stream a flaky pipe into a parser
  (the CMS zip broke at 7.7 million rows once).
- Never fight a portal. If the human page sits behind Incapsula, Imperva or
  Akamai, the egress or index endpoint is the way in, and HEAD or a ranged GET
  proves it. **Never rotate addresses, never rotate user agents, never work
  around a block.** Back off exponentially on 429 or 5xx. If a gate comes down
  and does not yield to backoff: checkpoint, stop, report. Tabling is a
  successful outcome of this lane. Published TiC CDNs have had no rate limit at
  this volume; parallel downloads on one box are fine.
- Keep the box away from the Mac's nightly window (01:04 ET) and do not run a
  matview rebuild while `harvestd` might; rebuild once, at the end, through
  `ops/harvest/sync-plan.mjs` via psql.

## Step 3 — load and report

- Load through the manifest pipelines so `sync_runs` ledgers it and a partial or
  empty harvest can never show green (NYS-132).
- The NY book: the 99,105 directory NPIs plus `.harvest/mrf/ny-licensed-notin99k.txt`.
- Sanity before any coverage claim: rows per NPI (Aetna duplicated per plan and
  TIN), per-CPT medians for 90791, 90834, 90837, 90853 and 99214 against the
  deduped NY medians in MRF-RESULTS.md, and a chargemaster check (a $377 median
  for 90837 was a stale chargemaster, not a rate).
- Final report in the MRF-RESULTS table shape: NY-book NPIs with a Humana rate,
  net-new NPIs with no directory listing under any source, rows loaded, per-CPT
  medians, and what was excluded and why. Add the Humana row to any per-payer
  table in `docs/` that lists the others.
- Commit on branch `humana-mrf`. **No push to main and no matview rebuild on
  the shared database without a `RULING:`.**

## Step 1b — the MRF state folder in the Trash (while waiting at Gate 1)

The `.harvest/mrf` state folder, NPI lists included, is in the Mac's Trash.
Step 1 does not need it. While Gate 1 waits for its ruling, do this, which
costs nothing: inventory what is there and assess whether it should be kept
in S3 instead of thrown away. Some of it was discarded before S3 was part of
the picture and after the database had taken what it needed; knowing about S3
and Glacier now, it deserves a second look.

- List each item: what it is (raw payer files, scan CSVs, manifests, NPI
  lists, logs, checkpoints), its size, its date, and whether it can be
  regenerated (from an index that still serves the same files) or is the only
  copy (a signed URL that has expired, a scan of a file the payer has since
  replaced, an NPI list built from a July NPPES that CMS no longer serves).
- Recommend per item, with monthly cost at current us-east-1 prices: restore
  to the repo's `.harvest/` (small, needed), S3 Standard (needed sometimes),
  S3 Glacier Deep Archive (keep, will not be read for months, hours to
  restore), or delete. Note which items the Humana run itself would want.
- Report the table under Reports. **Move nothing and empty nothing** until a
  `RULING:` says so. The Trash is the founder's to touch.

## Later, not this lane

- Rename the practice agents Bev to Ada and Sal to Penny (`lib/agents/registry.ts`,
  `docs/TASK-PRACTICE-AGENTS.md`, every surface that shows their names). The
  current Ada in that doc, the Monday-morning agent, needs a new name first.
  Noted 2026-09-30; a separate brief will cover it.

## Reporting protocol

Append to **Reports** below, newest last, each entry headed `### <time ET> —
<one line>`. Include: what was done, numbers, dollars spent so far, what is
next. A blocker is a line starting `BLOCKED:` followed by stopping. A question
is a line starting `QUESTION:` followed by stopping. The lead answers with
`RULING:` lines in the same section. Progress entries at least every thirty
minutes while a box is running. Do not print secrets, connection strings or the
database URL anywhere in this file.

## Reports

### 14:44 ET — Gate 1: Humana has no TiC rate files to ingest; premise proven, $0 spent

**Answer.** No NY-relevant commercial book exists, and no Humana in-network
file exists anywhere to download. Recommend closing the lane at Gate 1 with no
box.

**The index.**

- The old listing was `developers.humana.com/syntheticdata/healthplan-price-transparency`,
  reached from `/Cost-Transparency`. It fed a table from `/syntheticdata/Resource/GetData`.
- Downloads went through `Resource/DownloadPCTFile`, a 302 to stable Google
  Cloud Storage objects under `cms-humana-price-transparency-prd`. They were
  not signed.
- The files were per-employer table-of-contents files in schema v1, named
  like `2024-05-15_<employer>-<state>-humana-npos-…_index.json.gz`.
- The Internet Archive shows the page serving through 2024-12-30. It
  redirected to a 404 on 2025-01-30 and returned 502 from 2025-02 to 2026-07.
- The portal was replaced by an API catalog on 2026-09-09. Every old path now
  falls to the app's catch-all and redirects home.
- The storage bucket is deleted. Both a HEAD on a known object and a listing
  call return `NoSuchBucket`.
- The humana.com legal pages serve a JavaScript bot challenge, and the portal
  carries Akamai Shape. Neither was fought, and neither is needed.

**File counts by class.**

| class | files | bytes |
|---|---|---|
| commercial group | 0 | 0 |
| individual | 0 | 0 |
| Medicare Advantage | 0 (out of scope, never published under TiC) | 0 |
| other | 0 | 0 |

For history, the June 2024 capture listed 15,668 per-employer files of about
1 to 3 MB each. The first page of names was Georgia, Florida, Texas and
Colorado small groups. That book ended with the exit.

**Why nothing is left.**

- Humana announced its Employer Group Commercial Medical exit on 2023-02-23.
- Its Q1 2025 earnings supplement shows commercial fully insured at 0, down
  from 109.7k, and commercial ASO at 0, down from 77.7k.
- The FY2025 10-K lists only Medicare, Medicaid, military and specialty lines.
  Standalone dental and vision are excepted benefits, so TiC does not cover them.
- Humana left the ACA individual market after 2017.
- Sources: the Q1 2025 8-K exhibit
  `sec.gov/Archives/edgar/data/49071/000004907125000021/hum-2025q18kxex99x2detailed.htm`
  and the FY2025 10-K `…/000004907126000009/hum-20251231.htm`.

**Our Humana directory is not commercial either.** This was a read-only query.

| network class | rows | NPIs | networks |
|---|---|---|---|
| Medicare, Medicaid, military by name | 73,574 | 4,475 | 93 |
| "Employer HMO" family (group Medicare Advantage, 2027 plan-year suffixes) | 11,946 | 4,211 | 6 |
| other (CarePlus, Healthy Horizons Medicaid, Honor/USAA MA, Northwell Centric) | 819 | 431 | 36 |

No Humana network in the directory is TiC-scope. A future Humana rate signal
would therefore never have a same-payer directory row to corroborate.

**Run plan and cost.** There is no manifest, box, or load. Estimate $0.
Spent $0.

**Written.** The Humana section and summary-table row are now in
`docs/MRF-INDEXES.md`. It is uncommitted because Step 3's `humana-mrf` branch
was never reached. This tree is on another session's branch with its own
uncommitted work, so I did not switch branches.

**Found along the way.** The two memory files the brief lists,
`handoff-2026-07-12-mrf-rates.md` and `leuk-rate-signals.md`, do not exist in
the memory folder. Only three unrelated memories are there.

**Next.** Step 1b, the inventory of the trashed `.harvest/mrf` folder, is
below. Then this session waits for `RULING:`.

RULING: (lead, 14:52 ET) Gate 1 accepted. The lane closes here with no box and no load; the evidence is sufficient and the outcome is a success of the kind the brief named. Do these, in order, then stop: (1) finish Step 1b and report the inventory table; (2) commit only `docs/MRF-INDEXES.md` and `docs/TASK-HUMANA-MRF.md` on the current branch with a scoped commit (`git commit -- docs/MRF-INDEXES.md docs/TASK-HUMANA-MRF.md`), touching nothing else in that tree; (3) no push. The two missing memory files are noted; write one short memory of your own under the leuk memory folder recording the Humana finding and its sources, so the question is never re-researched.

### 14:45 ET — Step 1b: inventory of the trashed harvest folder; nothing moved

The Trash holds `leuk-harvest/`, moved there 2026-09-02 23:41. It has four
folders, not only `mrf`. Everything is dated 2026-07-11 to 07-20. There are
no raw payer MRF files in it except the test fixtures. The `mrf` folder is
scan output, indexes, manifests, lists and logs.

| item | what it is | size | regenerable? | recommend |
|---|---|---|---|---|
| `mrf/npis.txt` | scanner NPI list, July book | 1.1 MB | yes from `directory_providers`, but only as today's book, not July's | restore |
| `mrf/ny-licensed-notin99k.txt` | 7,391 NY-licensed NPIs outside the 99k book | 0.2 MB | **only copy**; built from a July NPPES CMS no longer serves | restore |
| `mrf/fixtures/` | parser validation slices (tic-mini, empire, bcbs, cdphp) | 53 MB | **only copy**; slices of July files since replaced | restore |
| `mrf/manifests/` incl. `done/` | 50 manifests plus 8 completed | 7 MB | Anthem/Highmark URLs were signed and are expired; the rest point at stable indexes | restore; the runner's `queue/` lives here |
| `mrf/staging/` incl. `remint-2026-08/` | Excellus, Univera, Anthem-finish and Oscar staged manifests plus README | 1.6 MB | partly; the Excellus and Univera lists are egress-stable | restore |
| `anthem-*-files.txt`, `tins-wanted.txt`, `uhc-employer-census.csv` | expired signed file lists, TIN wishlist, UHC name census | 2.5 MB | census yes, from the live API; the Anthem lists no | restore |
| index JSONs: Univera, Aetna, MVP, IHNY, Excellus | July index snapshots | 70 MB | current month only | Glacier Deep Archive |
| scan CSVs across ~60 run folders | scan-tic output, 1,371 files | 2.2 GB | no, for the July vintage; the loaded rows are in `provider_rate_signals` | Deep Archive, zstd-compressed |
| Cigna twin CSVs: national-ppo, ppo-sar-1, ppo-sar-ii | deliberately **not loaded** byte-equivalent republications | 0.15 GB | no | Deep Archive with the rest |
| `mrf/aetna-hf/*.zst` | Aetna-hosted Healthfirst scans | 0.2 GB | no | Deep Archive |
| `mrf/unmatched/` | telehealth-gap unmatched-NPI lists | 47 MB | no | Deep Archive |
| logs and scripts, 79 logs plus 5 `.sh` | run evidence cited in MRF-RESULTS and the handoff | 3 MB | no | Deep Archive |
| `nppes/NPPES_Data_Dissemination_July_2026_V2.zip` | full July NPPES | 1.1 GB | **only copy**; CMS rotates monthly files | Deep Archive |
| other `nppes/` files: weekly and deactivation zips, NUCC 26.0, lists | July weekly delta inputs | 20 MB | weeklies rotate out | Deep Archive; the zip and zst pairs are the same data twice, keep one |
| `form5500/` | DOL 2023–2025 Form 5500, SF and Schedule A zips | 423 MB | DOL overwrites the "Latest" files, so this vintage is only copy; the loads are in the DB | Deep Archive |
| `cms/` | HCPCS 2026 Q3 and RVU26C zips plus pages | 31 MB | yes, CMS keeps quarterly archives | delete, or Deep Archive for rounding-error cost |

**Cost at us-east-1 list prices.** S3 Standard is $0.023 per GB-month. Glacier
Deep Archive is $0.00099 per GB-month, with a 180-day minimum and 12-hour
standard retrieval at about $0.02 per GB.

| option | size | monthly |
|---|---|---|
| restore set, into the repo's `.harvest/` | about 65 MB | $0 |
| everything else in Deep Archive, as a few tar.zst objects | about 4 GB before compression | under $0.01 |
| the same in S3 Standard | about 4 GB | about $0.09 |

Deleting saves nothing measurable. The recommendation is therefore to restore
the small set and put the rest in Deep Archive as a handful of tarballs.
Tarballs avoid the per-object overhead that 1,500 small files would carry.
Nothing needs S3 Standard. Nothing is read monthly, and the database already
holds every loaded row.

**What the Humana run would want.** With no Humana files, nothing. A real run
would have needed `npis.txt`, `ny-licensed-notin99k.txt`, `fixtures/` and
the `manifests/queue` directory. Without them `run-payer.sh` and the
runner's manifest lane have no NPI list and no queue.

**Adjacent finding, not this lane.** `.harvest/runner/runner.log` shows the
nightly harvestd run last on 2026-08-10. Its Linear report step has returned
404 every night since at least 08-08. Whether the Mac runner was retired in the
AWS move is for the lead to confirm.

Moved nothing and emptied nothing. $0 spent. This session is waiting for
`RULING:`.

RULING: (lead, 15:02 ET) Step 1b received; the Trash stays as it is until the founder rules on the restore and the archive. Meanwhile a new step, before you stop:

## Step 1c — the new Humana API catalog (read-only, no spend)

The portal that replaced the price transparency page on 2026-09-09 is new to us. Map it: every API it lists, with purpose, base URL, auth (open, registration, OAuth, JWT), documentation link, and status. Say for each whether it carries anything Leuk wants: plan data, rates or fee schedules, provider directory or Plan-Net, payer-to-payer, prior authorization, formulary. Then answer two questions plainly. First, is the FHIR Plan-Net directory we harvested in July (`payer_sources` row "Humana", status live) still at the same base URL and still open, or did it move with the portal; probe it with one GET. Second, is there any price transparency or rate endpoint at all, under any name. Read-only GETs against the catalog and one probe of the directory; no registration, no fighting the bot challenge. Report under Reports, then stop and wait.
