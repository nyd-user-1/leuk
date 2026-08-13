-- Leuk — 065: rate_service_rows_mv grows min_rate / max_rate.
--
-- WHY. The Services tab rendered "2 rates" as a chip wherever a cell carries
-- several distinct published rates (NYS-64: billing_code_modifier is dropped at
-- ingest, so nothing separates them). Founder ruling 2026-07-23: never hide the
-- number behind a chip — show the rates. Picking ONE is still forbidden (it
-- invents a fact the payer never published), but showing ALL of them invents
-- nothing: for n_rates = 2, min and max ARE the two rates; for n > 2 the
-- honest render is the range plus the count.
--
-- Note the measured reality (2026-07-23, Cigna 90837): these multi-rate cells
-- are NOT the office/facility split — office and facility are already separate
-- rows (setting is part of the grain). A single office-setting cell really does
-- carry e.g. $88.17 AND $193.54 with nothing left to split on.
--
-- SWAP, NOT DROP+CREATE IN PLACE. Production reads this matview; building the
-- replacement under a temp name and renaming keeps the gap to two DDL
-- statements instead of the full multi-minute build.
--
-- Definition is sql/063 verbatim plus the two columns — every filter and the
-- cap are unchanged so a row keeps meaning exactly what it meant.

CREATE MATERIALIZED VIEW rate_service_rows_mv_next AS
WITH cells AS (
  SELECT s.tin, s.payer, s.npi, s.plan_or_network AS network, s.place_of_service AS setting,
         s.billing_code,
         CASE WHEN count(DISTINCT s.negotiated_rate) = 1 THEN min(s.negotiated_rate) END AS rate,
         count(DISTINCT s.negotiated_rate)::int AS n_rates,
         min(s.negotiated_rate) AS min_rate,
         max(s.negotiated_rate) AS max_rate,
         max(s.file_date) AS last_file_date
  FROM provider_rate_signals s
  WHERE s.payer = ANY (ARRAY[
          'Cigna Health & Life',
          'Empire BlueCross BlueShield',
          'Oxford Health Insurance Inc',
          'EmblemHealth (Carelon behavioral)',
          'Fidelis Care (Centene)',
          'MetroPlus Health Plan'
        ])
    AND s.billing_code IN (SELECT code FROM cpt_codes)
    AND lower(s.billing_class) = 'professional'
    AND s.negotiated_type NOT ILIKE '%percent%'
    AND s.negotiated_rate > 5
  GROUP BY s.tin, s.payer, s.npi, s.plan_or_network, s.place_of_service, s.billing_code
), eligible AS (
  SELECT tin, payer
  FROM (SELECT DISTINCT tin, payer, npi, network, setting FROM cells) l
  GROUP BY tin, payer
  HAVING count(*) <= 400
), dir AS (
  SELECT npi,
         (array_agg(name       ORDER BY (name IS NULL)))[1]                                   AS name,
         (array_agg(credential ORDER BY (credential IS NULL), (source = 'nppes') DESC))[1]    AS credential,
         (array_agg(profession ORDER BY (profession IS NULL), (source = 'medicaid') DESC))[1] AS profession,
         (array_agg(city       ORDER BY (city IS NULL),       (source = 'nppes') DESC))[1]    AS city,
         (array_agg(county     ORDER BY (county IS NULL),     (source = 'nppes') DESC))[1]    AS county
  FROM directory_providers
  WHERE npi IS NOT NULL
  GROUP BY npi
)
SELECT c.payer,
       c.tin,
       c.npi,
       c.network,
       c.setting,
       c.billing_code,
       c.rate,
       c.n_rates,
       c.min_rate,
       c.max_rate,
       d.name AS display_name,
       d.credential,
       d.profession,
       d.city,
       d.county,
       c.last_file_date AS as_of,
       lower(concat_ws(' ', d.name, c.payer, c.network, c.tin, c.npi)) AS search_text
FROM cells c
JOIN eligible e ON e.tin = c.tin AND e.payer = c.payer
LEFT JOIN dir d ON d.npi = c.npi;

CREATE UNIQUE INDEX idx_rsr_key_next
  ON rate_service_rows_mv_next (payer, tin, npi, network, setting, billing_code);
CREATE INDEX idx_rsr_order_next
  ON rate_service_rows_mv_next (payer, network, billing_code, rate DESC NULLS LAST, npi);
CREATE INDEX idx_rsr_code_next ON rate_service_rows_mv_next (billing_code);
CREATE INDEX idx_rsr_search_trgm_next
  ON rate_service_rows_mv_next USING gin (search_text gin_trgm_ops);

-- The swap. Two statements of DDL — the only window where a reader can miss.
BEGIN;
DROP MATERIALIZED VIEW rate_service_rows_mv;
ALTER MATERIALIZED VIEW rate_service_rows_mv_next RENAME TO rate_service_rows_mv;
ALTER INDEX idx_rsr_key_next RENAME TO idx_rsr_key;
ALTER INDEX idx_rsr_order_next RENAME TO idx_rsr_order;
ALTER INDEX idx_rsr_code_next RENAME TO idx_rsr_code;
ALTER INDEX idx_rsr_search_trgm_next RENAME TO idx_rsr_search_trgm;
COMMIT;

ANALYZE rate_service_rows_mv;

COMMENT ON MATERIALIZED VIEW rate_service_rows_mv IS
  'One row per published service: (insurer, billing ID, NPI, network, setting, billing code) over all twenty cpt_codes, for billing IDs holding <=400 such leaves for that insurer. min_rate/max_rate carry the spread when n_rates > 1 (sql/065) — for n=2 they ARE the two published rates. The long-grain twin of sql/032 rate_table_child_mv (NYS-50).';
