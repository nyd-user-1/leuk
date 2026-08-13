-- Leuk — 066: rate-count rollups for the org relationship map (2026-07-23).
--
-- Ruling: the map's chips no longer summarize spreads. A payer×code cell
-- shows the ONE published rate when there is one, else the COUNT of distinct
-- published rates ("78 rates") — the multiplicity IS the story (one insurer,
-- one org, one code, 78 different prices: it begs "why?"). No medians, no
-- bands on the canvas. That count (count(DISTINCT negotiated_rate)) wasn't
-- carried by org_tin_rate_summary, and ranking an org's providers by a code's
-- rate needs a (tin, npi, billing_code) grain nothing rolls up.
-- provider_rate_signals has no tin index, so both must be matviews, not live
-- queries (the sql/025 NYS-52 lesson: platform TINs seq-scan).
--
-- 1) org_tin_rate_summary — recreated with distinct_rates added (all prior
--    columns unchanged; other readers unaffected).
-- 2) org_tin_npi_rates — NEW rollup at (tin, npi, billing_code): feeds the
--    map's member-edge chips and the "Top paid" provider ranking.
--
-- After every rate load, refresh alongside the sql/025 pair:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY org_tin_rate_summary;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY org_tin_rosters;
--   REFRESH MATERIALIZED VIEW CONCURRENTLY org_tin_npi_rates;

DROP MATERIALIZED VIEW IF EXISTS org_tin_rate_summary;
CREATE MATERIALIZED VIEW org_tin_rate_summary AS
WITH dd AS (
  SELECT npi, tin, payer, billing_code, negotiated_rate, max(as_of) AS as_of
  FROM provider_rate_signals
  WHERE negotiated_type NOT ILIKE '%percent%'
  GROUP BY 1, 2, 3, 4, 5
)
SELECT tin, payer, billing_code,
       count(DISTINCT npi)::int AS npis,
       count(*)::int AS rate_points,
       count(DISTINCT negotiated_rate)::int AS distinct_rates,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS p25,
       percentile_cont(0.5)  WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS median,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY negotiated_rate)::numeric(10,2)::float8 AS p75,
       min(negotiated_rate)::float8 AS min_rate,
       max(negotiated_rate)::float8 AS max_rate,
       max(as_of) AS as_of
FROM dd
GROUP BY tin, payer, billing_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_otrs_key
  ON org_tin_rate_summary(tin, payer, billing_code);
CREATE INDEX IF NOT EXISTS idx_otrs_code ON org_tin_rate_summary(billing_code);

COMMENT ON MATERIALIZED VIEW org_tin_rate_summary IS
  'Org rate rollup, grain (tin, payer, billing_code). distinct_rates = count of distinct published dollar values — the map chip shows the single rate when 1, else the count. Refresh after every rate load.';

-- Grain: (tin, npi, billing_code) → how many distinct published rates this
-- clinician has under this TIN for this code, and their bounds. min = max
-- means ONE published rate (a fact); the map's member chips and the Top-paid
-- ranking both read here.
CREATE MATERIALIZED VIEW IF NOT EXISTS org_tin_npi_rates AS
WITH dd AS (
  SELECT DISTINCT tin, npi, billing_code, negotiated_rate
  FROM provider_rate_signals
  WHERE negotiated_type NOT ILIKE '%percent%'
)
SELECT tin, npi, billing_code,
       count(*)::int AS distinct_rates,
       min(negotiated_rate)::float8 AS min_rate,
       max(negotiated_rate)::float8 AS max_rate
FROM dd
GROUP BY tin, npi, billing_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_otnr_key
  ON org_tin_npi_rates(tin, npi, billing_code);
CREATE INDEX IF NOT EXISTS idx_otnr_top
  ON org_tin_npi_rates(tin, billing_code, max_rate DESC);

COMMENT ON MATERIALIZED VIEW org_tin_npi_rates IS
  'Per-clinician rate counts under a billing TIN, grain (tin, npi, billing_code). Feeds the org map member-edge chips and Top-paid ranking. Refresh after every rate load.';
