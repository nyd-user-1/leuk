-- Leuk — 024: rate band summaries (Know Your Rates precompute).
--
-- provider_rate_signals grew 1.04M -> 9.0M rows and the live percentile_cont
-- aggregates in lib/repos/rate-signals.ts (bandNumbers + getCheckedBooks) went
-- from "built at 125k rows" to 15-32s per /rates tab. Same house pattern as
-- 021/023: precompute, REFRESH post-ingest, read the tiny rollup instead of
-- the fact table. SQL below is copied VERBATIM from the live query bodies
-- (same dedup subquery, same license CASE, same NY_ENTITY_RE) — only the
-- `billing_code = ANY(codes)` and `HAVING count(DISTINCT npi) >= minClinicians`
-- filters move to query time (bandNumbers selects `WHERE billing_code = ANY($1)
-- AND npis >= $2` from the matview instead), since neither is fixed per call.
--
-- After every rate load: refresh 021 + 023 + 026 + these three, in any order —
--   REFRESH MATERIALIZED VIEW CONCURRENTLY provider_rate_summary;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY provider_participation_summary;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY rate_bands_license_summary;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY rate_bands_payer_summary;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY rate_bands_checked_payers;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY payer_rate_totals;

-- ── rate_bands_license_summary ───────────────────────────────────────────────
-- Grain A: (payer, billing_code, license, network) -> npis/p25/median/p75/as_of.
-- Feeds getRateBands (the Services/negotiation-card tab) — mirrors bandNumbers'
-- byLicense=true branch exactly.
CREATE MATERIALIZED VIEW IF NOT EXISTS rate_bands_license_summary AS
WITH prof AS (
  SELECT DISTINCT ON (npi) npi, profession FROM directory_providers
  WHERE npi IS NOT NULL AND profession IS NOT NULL
  ORDER BY npi, (source = 'medicaid') DESC
), dd AS (
  SELECT r.npi, r.payer, r.plan_or_network AS network, r.billing_code, r.negotiated_rate,
         CASE
           WHEN p.profession ILIKE '%psychiatr%' THEN 'Prescriber (MD/NP)'
           WHEN p.profession ILIKE '%psycholog%' THEN 'Psychologist'
           WHEN p.profession ILIKE '%social worker%' OR p.profession ILIKE '%counselor%'
             OR p.profession ILIKE '%marriage%' THEN 'Masters-level'
           ELSE 'Other'
         END AS license,
         max(r.as_of) AS as_of
  FROM provider_rate_signals r
  LEFT JOIN prof p ON p.npi = r.npi
  WHERE r.payer ~* 'new york|of ny|cdphp|oxford|metroplus|carelon|emblem|centene|fidelis|cigna|western new york|empire|excellus'
    AND r.negotiated_type NOT ILIKE '%percent%'
  GROUP BY 1, 2, 3, 4, 5, 6
)
SELECT payer, billing_code, license, network, count(DISTINCT npi)::int AS npis,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS p25,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS median,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS p75,
       max(as_of) AS as_of
FROM dd
WHERE license <> 'Other'
GROUP BY payer, billing_code, license, network;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rbls_key ON rate_bands_license_summary(payer, billing_code, license, network);
CREATE INDEX IF NOT EXISTS idx_rbls_code ON rate_bands_license_summary(billing_code);

-- ── rate_bands_payer_summary ─────────────────────────────────────────────────
-- Grain B: (payer, billing_code) -> npis/p25/median/p75/as_of, no license split.
-- Feeds computeSpread's payer-median path (Spread check) and getApplyNext
-- (Apply next) — mirrors bandNumbers' byLicense=false branch exactly.
CREATE MATERIALIZED VIEW IF NOT EXISTS rate_bands_payer_summary AS
WITH dd AS (
  SELECT npi, payer, billing_code, negotiated_rate, max(as_of) AS as_of
  FROM provider_rate_signals
  WHERE payer ~* 'new york|of ny|cdphp|oxford|metroplus|carelon|emblem|centene|fidelis|cigna|western new york|empire|excellus'
    AND negotiated_type NOT ILIKE '%percent%'
  GROUP BY 1, 2, 3, 4
)
SELECT payer, billing_code, count(DISTINCT npi)::int AS npis,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS p25,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS median,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS p75,
       max(as_of) AS as_of
FROM dd
GROUP BY payer, billing_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rbps_key ON rate_bands_payer_summary(payer, billing_code);
CREATE INDEX IF NOT EXISTS idx_rbps_code ON rate_bands_payer_summary(billing_code);

-- ── rate_bands_checked_payers ────────────────────────────────────────────────
-- getCheckedBooks' `SELECT DISTINCT payer ... WHERE payer ~* NY_ENTITY_RE` scanned
-- the whole fact table (~12s) for a ~29-row answer, once per cold process (it's
-- cached after that in checkedBooksCache) — but every cold start on Vercel pays
-- it, and it gates the Apply Next / Roster Check "absent from" reveal. No
-- negotiated_type filter here (the live query has none) — this grain is
-- deliberately narrower in scope than the two above; don't reuse them for it.
CREATE MATERIALIZED VIEW IF NOT EXISTS rate_bands_checked_payers AS
SELECT DISTINCT payer
FROM provider_rate_signals
WHERE payer ~* 'new york|of ny|cdphp|oxford|metroplus|carelon|emblem|centene|fidelis|cigna|western new york|empire|excellus';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rbcp_payer ON rate_bands_checked_payers(payer);
