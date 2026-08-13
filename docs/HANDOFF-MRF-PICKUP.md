# HANDOFF — MRF pickup (session c128e1bb, 2026-07-13 ~00:00 ET)

_Lead session resuming the MRF marathon (693184af / NYS-25..32). Read
`docs/MRF-RESULTS.md` + `docs/MRF-QUEUE.md` first, plus the memory files
`handoff-2026-07-12-mrf-rates.md` / `leuk-rate-signals.md` under
`~/.claude/projects/-Users-brendanstanton-Code-leuk/memory/`. This doc is
the delta since those._

## State at handoff

**Everything below is COMMITTED and pushed through `891225e`.** The only
uncommitted tree state is the KYR-phase-2 peer session's lane (session
5fb2d071 — recruiting/, api/rates/{footprint,attestations,…}, sql/018, their
hunks in rate-signals.ts/mock — leave it alone, they commit their own).

### UI work (done, pushed — `948b5bb`, `1976efc`, `f654470`)
Table standard everywhere + rates polish + shell changes. One product-level
finding worth knowing: **bands are now per-network** (`getRateBands` groups by
`plan_or_network`, merges networks with identical figures into one row
labeled "All networks", the negotiation card shows the network as an
InsurerCell subline only when schedules differ). Verified live: MetroPlus
$377.62 FFS vs $293.70 QHP; Oxford OHBS $121.33 masters vs Core $156.20 —
and the flat/negotiated inference is now computed within-network (MetroPlus
correctly reads Flat per network; pooled it masqueraded as Group).
`computeSpread`'s un-split band path is untouched (still pools networks) —
same blur exists there in principle; decide separately.

### Step 1 — telehealth-class ingest (NYS-26): READY, dry-run validating
- `scripts/ingest-directory.mjs` grew `--npi-allowlist=<file>` (committed):
  ONLY listed NPIs, skips the NY-practice filter, prefers the NY-licensed MH
  taxonomy slot, writes provenance to `raw` ({note, practice_state}),
  COALESCE-guards raw+county on upsert.
- List: `.harvest/mrf/ny-licensed-notin99k.txt` (7,391; `npi|state|taxonomy`).
- ⚠️ **July NPPES zip 404s at CMS now** (it worked earlier on 07-12 — pulled).
  Using **June**: `https://download.cms.gov/nppes/NPPES_Data_Dissemination_June_2026_V2.zip`.
  Expect a small match shortfall (July-enumerated NPIs absent from June) —
  report matched vs 7,391.
- **Dry-run RESULT (2026-07-13 ~00:15):** parsing/matching validated — 6,809
  matched cleanly, samples correct — but the CMS download stream BROKE at
  7.71M of ~9.6M rows (`ZIP decompression failed (-5)`, log
  `.harvest/mrf/telehealth-ingest-dry.log`). So 6,809 is a floor from ~80% of
  the file, not the true June match count. **For the real run, download the
  zip to disk first (~1.2GB compressed; disk has ~18GB) instead of streaming
  the flaky pipe:**
  ```
  curl -sSL -o /tmp/nppes-june.zip https://download.cms.gov/nppes/NPPES_Data_Dissemination_June_2026_V2.zip
  bsdtar -xOf /tmp/nppes-june.zip '*npidata_pfile*[0-9].csv' \
    | node --env-file=.env.local scripts/ingest-directory.mjs \
        --source=nppes --npi-allowlist=.harvest/mrf/ny-licensed-notin99k.txt
  rm /tmp/nppes-june.zip
  ```
  (Run `nohup sh -c '…' > log & disown` — harness bg tasks got reaped twice
  in the prior session. Ingest is idempotent — the interrupted-dry-run wrote
  nothing; even a re-run after partial writes just re-upserts.)
- After ingest: regenerate the scanner NPI list —
  `SELECT DISTINCT npi FROM directory_providers WHERE npi IS NOT NULL` →
  `.harvest/mrf/npis.txt` (was 99,105 lines; expect ~106.4k). Then re-run the
  payer manifests (`.harvest/mrf/manifests/*`, signed URLs still valid,
  `bash scripts/mrf/run-payer.sh <manifest> <outdir>`) and reload via
  `scripts/mrf/load-rate-signals.mjs` (idempotent, UNIQUE-key dedupe), then
  `rollup.mjs`. Output dirs from the first run enumerate the book list
  (cigna-aa/ab/ac, oxford, fidelis, emblem, metroplus, highmark-*, cdphp,
  bcbs-05c0, ny-blues, uhc was separate).

### Step 2 — Empire two-pass (NYS-25): BUILT + VALIDATED, not yet run
- `scan-tic.mjs` (committed): `--collect-gids=<file>` = pass A (streams the
  file, SKIPS provider_references entirely — zero refs heap — records the
  gids that CPT-matched items reference); `--gids=<file>` = pass B (normal
  run retaining only those groups). Retained memory: GBs → MBs.
- **Validation done:** all 4 fixtures (`.harvest/mrf/fixtures/`) byte-identical
  in normal mode (tic-mini / empire / bcbs / cdphp — cdphp slice needs
  `cat … | funzip`, unzip can't read the truncated slice); two-pass output
  byte-identical to single-pass on empire (refs=stream) AND bcbs (refs=scan).
- Empire NY = the 39-series: **5 chunks** `2026-07_254_39B0_in-network-rates_{1..5}_of_5`
  (URLs+signatures in `.harvest/mrf/anthem-empire-files.txt`; ~10GB
  uncompressed each). Each chunk: pass A then pass B (two downloads per
  chunk — stream, never store). Suggested:
  ```
  for i in 1 2 3 4 5:
    url=$(grep "39B0_in-network-rates_${i}_of_5" .harvest/mrf/anthem-empire-files.txt | cut -d'|' -f2)
    curl -sSL "$url" | gunzip -c | node scripts/mrf/scan-tic.mjs \
      --npis=.harvest/mrf/npis.txt --collect-gids=.harvest/mrf/empire-39/gids-$i.txt \
      --payer=auto --network=auto --source-file=… --file-date=2026-07-01
    curl -sSL "$url" | gunzip -c | node scripts/mrf/scan-tic.mjs \
      --npis=.harvest/mrf/npis.txt --gids=.harvest/mrf/empire-39/gids-$i.txt \
      --out=.harvest/mrf/empire-39/39b0-$i.csv --payer=auto --network=auto \
      --source-file=… --file-date=2026-07-01
  ```
  (Do this AFTER the npis.txt regen so Empire lands with the expanded list.)
  Watch the pass-B heap ticker; the diag chunk previously hit 4.7GB at 440k
  retained — pass B should stay tiny. Diag history: `.harvest/mrf/diag-39f0.log`.

### Steps 3–5 (untouched)
tin_registry (NYS-27 — names in the memo), Aetna browser session (NYS-28),
ERD index brief `docs/TASK-DATA-MODEL-INDEX.md` (NYS-31).

## Gotchas rediscovered this session
- CMS rotates the NPPES monthly zip with no notice — probe with `curl -sIL`
  before streaming; June/July naming `NPPES_Data_Dissemination_<Month>_2026_V2.zip`.
- Peer sessions edit `lib/repos/rate-signals.ts` live — to commit only your
  hunks: `git diff <file> > p; filter hunks by @@ old-start; git apply
  --cached --recount p.mine` (worked cleanly twice this session).
- `unzip -p` cannot read `.harvest/mrf/fixtures/cdphp-slice.zip` (truncated
  slice, no central directory) — use `cat … | funzip`.
