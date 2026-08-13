# Database (NeonDB / Postgres)

1. Create a Neon project (`neon.tech`) and copy its connection string.
2. Apply schema + demo seed:

   ```sh
   psql "$DATABASE_URL" -f sql/001_schema.sql -f sql/002_seed.sql
   ```

3. Set `DATABASE_URL=<neon connection string>` in `.env.local` (without it the app runs on in-memory mocks).

Both files are idempotent — safe to re-run.

Demo logins (password `demo`):
- `brendan@leuk.demo` — admin/practitioner
- `casey@leuk.demo` — client portal

> `.env.local` contains an unquoted `&`, so `source .env.local` fails under zsh. For psql:
> `export DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env.local | cut -d= -f2- | tr -d '\"')"`

## File numbering

The numbers are **apply order for humans, nothing more** — no runner reads them, and no
`schema_migrations` table tracks them. Files are applied by hand with `psql -f`.

Take the next free number (`ls sql/`). If two concurrent sessions grab the same one, **that is
cosmetic, not an emergency**: replay is lexical, so `029_anthem_resources` runs before
`029_photon_demo` deterministically, and files are idempotent. Renaming an already-applied file
buys nothing and breaks the reports that cite it — leave it. `029` is currently doubled for
exactly this reason (Anthem's `fhir_*` tables; Photon's `clients.photon_patient_id` + demo rows).
They share no tables.

---

## Post-ingest chain — run in this order, every time

After any rate load or FHIR harvest. Order is not stylistic: each step reads what the
previous one writes, and running 027 early is the difference between a table that names
its rows and one that renders ~9% "Unnamed practice".

```sh
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY provider_rate_summary"          # 021
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY provider_participation_summary" # 023
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY rate_bands_summary"             # 024
psql "$DATABASE_URL" -f sql/maint/org-affiliations-sync.sql                                      # 025 step 1 — see below
node --env-file=.env.local scripts/orgs-sync.mjs --skip-affiliations   # 025 MVs + npi-TIN names
node --env-file=.env.local scripts/backfill-tin-names.mjs   # roster-derived names
node --env-file=.env.local scripts/nppes-name-groups.mjs    # 030/031 co-located-org names
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY rate_table_mv"                   # 027
psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY rate_table_child_mv"             # 032
psql "$DATABASE_URL" -c "ANALYZE"
```

**Step 1 of the org sync runs under psql, not node** (2026-07-15, NYS-65). The `neon()` HTTP
driver rides on Node's `fetch`, whose undici `headersTimeout` is **300s — a client limit, not
Neon's**. That scan now needs ~11 min (2.44M rows whose `raw_resource` averages 2.6KB and lives
in TOAST), so plain `node scripts/orgs-sync.mjs` dies with `UND_ERR_HEADERS_TIMEOUT`. psql has no
such timeout. **Worse, it fails silently downstream**: a timeout here leaves the org layer stale,
and `backfill-tin-names` then reports a `+0` gain while `rate_table_mv` rebuilds on it — which is
indistinguishable from "nothing to do". Always confirm the sync actually succeeded.

`nppes-name-groups.mjs` READS `rate_table_mv` (it asks "which rows still render unnamed?")
and WRITES `tin_registry`, which `rate_table_mv` reads. That cycle is resolved by the order
above: the matcher runs against the previous refresh, then the refresh picks up its names.
On a first build, run the matcher after the initial CREATE and refresh once more.

**The dev server caches repo reads in-process for 1h** — after a REFRESH it serves stale rows
until restarted (`npm run dev`, port 3010).

**`REFRESH … CONCURRENTLY` needs a unique index on PLAIN COLUMNS** (2026-07-17, NYS-88). An
expression column disqualifies it — `md5(wide_col)` in the unique index (a tempting way to keep
the index small when a key column is long) silently loses CONCURRENTLY, and Postgres only says so
when you try to refresh. The failure mode is nasty: the refresh falls back to `ACCESS EXCLUSIVE`
and hangs `/rates` for the duration. If a key column is too wide to index whole, add a plain hash
**column** to the matview and index that column — do not hash inside the index. `rate_table_child_mv`
hit this (sql/032 shipped an `md5(setting)` index that never worked; sql/036 replaced it with a
plain-column key — impossible-concurrently → non-blocking ~11.6s).

---

## NPPES — monthly full + weekly incremental

`nppes_npi` (sql/030) is the nationwide federal identity spine: ~9.7M NPIs, both entity
types. It is what lets us name an out-of-state billing group; the older NY-scoped
`nppes_organizations` (sql/025) cannot. CMS publishes a **full replacement monthly** and an
**incremental every week**, both at
[download.cms.gov/nppes/NPI_Files.html](https://download.cms.gov/nppes/NPI_Files.html).
Always take the **V.2** files — V.1 was retired 2026-03-03 and truncates long names.

### Monthly (full replacement — ~1.1GB zip, 11.5GB CSV, ~16 min to load)

```sh
Z=.harvest/nppes/NPPES_Data_Dissemination_July_2026_V2.zip     # filename changes monthly
curl -sL -o "$Z" "https://download.cms.gov/nppes/$(basename "$Z")"

bsdtar -xOf "$Z" 'npidata_pfile_*[0-9].csv' \
  | node --env-file=.env.local scripts/ingest-nppes-full.mjs --mode=npi         # -> nppes_npi
bsdtar -xOf "$Z" 'othername_pfile_*[0-9].csv' \
  | node --env-file=.env.local scripts/ingest-nppes-full.mjs --mode=othername   # -> nppes_other_names
bsdtar -xOf "$Z" 'endpoint_pfile_*[0-9].csv' \
  | node --env-file=.env.local scripts/ingest-nppes-full.mjs --mode=endpoint    # -> nppes_endpoints
```

`--mode=npi` TRUNCATEs first: this file IS the truth, not a delta. The three loads are
independent. Then re-run the naming step of the post-ingest chain, since new NPPES data can
name previously-unnamed groups. Delete or `zstd` the zip afterwards — `.harvest/` is
gitignored but the disk is not infinite.

### Weekly (incremental — ~6MB, seconds)

```sh
node --env-file=.env.local scripts/nppes-sync.mjs \
  --weekly=.harvest/nppes/NPPES_Data_Dissemination_070626_071226_Weekly_V2.zip \
  --deactivations=.harvest/nppes/NPPES_Deactivated_NPI_Report_071326_V2.zip
```

Apply **every** weekly published since the last monthly, in order. Applying one twice is
harmless (it upserts); skipping one is the hazard — the table just goes quietly stale.
`nppes_sync_log` records each file that fully applied and the script refuses to redo one
without `--force`, so that log is the answer to "is this table current?".

Only the spine (`nppes_npi`) is synced weekly. The weekly zip also carries othername /
endpoint / practice-location deltas; those tables are rebuilt wholesale by the monthly and
change slowly, so between monthlies they can be up to a month behind.

### The NUCC taxonomy code set (`nucc_taxonomy`, sql/031)

Not a CMS file — NUCC publishes it separately and CMS ships only a PDF. Refresh when NUCC
does (roughly twice a year; the number is `<yy><release>`):

```sh
curl -sL "https://www.nucc.org/images/stories/CSV/nucc_taxonomy_260.csv" \
  | node --env-file=.env.local scripts/ingest-nppes-full.mjs --mode=taxonomy
```
