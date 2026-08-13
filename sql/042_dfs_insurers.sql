-- Leuk — 042: NYS DFS supervised-insurer reference (NYS-104).
--
-- The Department of Financial Services company directory
-- (myportal.dfs.ny.gov → /companydirectory/) is the authoritative list of
-- every insurer licensed to write business in New York. We keep the HEALTH
-- family of org types plus Life (life insurers write most large-group A&H —
-- Aetna Life 60054, Cigna Health and Life 67369, and MetLife all live there):
--
--   AH  Accident & Health          HMO Health Maintenance Organizations
--   MHL Health Service Corps       MME Medical Expense Indemnities
--   MDE Dental Expense Indemnities PHS Prepaid Health Service Plans
--   MCH Municipal Co-op Health     MLT Managed Long Term Care
--   LF  Life Insurers
--
-- Each DFS row already carries the two join keys the canonical-insurer layer
-- (sql/043) needs: the NAIC company code (= form5500_schedule_a.carrier_naic)
-- and the NAIC group ("671/Elevance Health Inc." — parent ownership straight
-- from the regulator). FEIN is the carrier's own EIN, a bonus join to
-- form5500_schedule_a.carrier_ein.
--
-- Populated by scripts/ingest-dfs-insurers.mjs (9 list POSTs, ~350 rows,
-- idempotent upsert on DFS's stable internal file number).

CREATE TABLE IF NOT EXISTS dfs_insurers (
  cpat_num    INT PRIMARY KEY,     -- DFS internal file number (dir_det.jsp search_value; stable)
  naic        TEXT,                -- NAIC company code; joins form5500_schedule_a.carrier_naic
  name        TEXT NOT NULL,       -- legal entity name as licensed
  org_type    TEXT NOT NULL,       -- DFS org-type code (table above)
  domicile    TEXT,                -- state/country of domicile
  group_code  TEXT,                -- NAIC group number (parent), e.g. 671
  group_name  TEXT,                -- NAIC group name, e.g. 'Elevance Health Inc.'
  fein        TEXT,                -- carrier's federal EIN, bare 9 digits
  website     TEXT,
  loaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dfs_insurers_naic  ON dfs_insurers (naic);
CREATE INDEX IF NOT EXISTS idx_dfs_insurers_group ON dfs_insurers (group_code);
CREATE INDEX IF NOT EXISTS idx_dfs_insurers_name  ON dfs_insurers (lower(name) text_pattern_ops);

COMMENT ON TABLE dfs_insurers IS 'NYS DFS company directory, health org types + Life. One row per licensed legal entity; NAIC code + NAIC group + FEIN as filed with the regulator. Loaded by scripts/ingest-dfs-insurers.mjs.';
