-- Leuk — 053: directory names re-key (NYS-26 §re-key + the NYS-45 names
-- piggyback; sql number granted in TASK-DATA-T3).
--
-- Three-step procedure; this file is step (ii). Steps (i)/(iii) are shell:
--
--   (i)  +571 NY-licensed, out-of-state-practice clinicians (the 2026-07 NPPES
--        monthly measurement, .harvest/nppes/ny-licensed-out-of-book-2026-07.txt)
--        into directory_providers via the telehealth-ingest allowlist path:
--          bsdtar -xOf .harvest/nppes/NPPES_Data_Dissemination_July_2026_V2.zip \
--            'npidata_pfile_*[0-9].csv' \
--          | node --env-file=.env.local scripts/ingest-directory.mjs \
--              --source=nppes \
--              --npi-allowlist=.harvest/nppes/ny-licensed-out-of-book-2026-07.txt
--   (ii) THIS FILE — structured name columns on directory_providers, filled by
--        one UPDATE-join from nppes_npi (the federal identity spine, sql/030).
--        directory_providers.name is 'LAST FIRST' (NPPES field order); display
--        surfaces re-order and re-case it by guesswork — structured first/last
--        retire that wherever the columns are consumed.
--   (iii) regenerate the scanner book list so the new NPIs ride every scan:
--          psql "$DATABASE_URL" -c "\copy (SELECT DISTINCT npi FROM
--            directory_providers WHERE npi IS NOT NULL ORDER BY 1)
--            TO '.harvest/mrf/npis.txt'"
--
-- Idempotent: IF NOT EXISTS columns; the UPDATE's IS DISTINCT FROM guard makes
-- a re-run match zero rows. The matview chain is deliberately NOT here — the
-- nightly runner rebuild picks the new rows up (ops/harvest/README.md).

ALTER TABLE directory_providers ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE directory_providers ADD COLUMN IF NOT EXISTS last_name  TEXT;

COMMENT ON COLUMN directory_providers.first_name IS
  'NPPES structured first name (nppes_npi.first_name, NPI-1 only). Filled by the 053 UPDATE-join; NULL for organizations and rows with no nppes_npi match.';
COMMENT ON COLUMN directory_providers.last_name IS
  'NPPES structured last name (nppes_npi.last_name, NPI-1 only). See first_name.';

UPDATE directory_providers d
SET first_name = n.first_name,
    last_name  = n.last_name
FROM nppes_npi n
WHERE n.npi = d.npi
  AND n.entity_type = 1
  AND (d.first_name IS DISTINCT FROM n.first_name
    OR d.last_name  IS DISTINCT FROM n.last_name);
