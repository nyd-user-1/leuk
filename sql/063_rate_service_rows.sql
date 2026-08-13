-- Leuk — 063: rate_service_rows_mv — the Services tab's read, all 20 codes.
--
-- WHY A NEW MATVIEW AND NOT A WIDER sql/032. rate_table_child_mv is PIVOTED
-- (c90791…c99214 + n90791…n99214) and pivots exactly five codes, so the Services
-- tab physically cannot show the other fifteen — that is the whole of NYS-50's
-- surfacing gap, and it lives here, not in sql/024. Widening the pivot to twenty
-- codes would mean 40 rate columns and a DROP+CREATE of a 70 MB matview that
-- FOUR other consumers read (lib/repos/rate-table.ts → /published-rates,
-- lib/repos/analytics.ts, lib/analytics/metrics.ts, lib/repos/admin.ts). This
-- file is additive instead: 032 keeps serving them unchanged, and the Services
-- read (lib/repos/rate-rows.ts) points here.
--
-- LONG, NOT PIVOTED. listRateRows already unpivoted 032 back to one-row-per-
-- service via a CROSS JOIN LATERAL (VALUES …) so that LIMIT/OFFSET counted
-- SERVICES rather than cells. This matview IS that grain, so the unpivot goes
-- away: the page becomes a plain top-N over an index instead of an unpivot of
-- 144,865 rows into ~725k tuples followed by a sort.
--
-- ── THE CAP: 400 LEAVES, AND WHY IT MOVED FROM 100 ─────────────────────────
-- sql/032 excludes a (billing ID, insurer) group holding >100 leaves, so the
-- platform-scale TINs (/orgs owns those rosters) stay out of an inline table.
-- Adding fifteen codes ADDS leaves — a clinician priced only for 90832 is a new
-- (npi, network, setting) leaf — so re-applying `<=100` to the twenty-code leaf
-- set would have EVICTED groups that /rates lists today. Measured 2026-07-20:
--
--   cap   groups   service rows   groups lost vs today   rows lost vs today
--   100   38,688      156,812              157                 9,616
--   150   38,872      179,430               62                 3,977
--   200   38,959      194,315               25                 1,960
--   400   39,067      223,218                0                     0
--
-- 400 is the smallest round threshold that loses NOTHING currently published —
-- deleting 9,616 rows a user can see today, in a change whose whole purpose is
-- to show MORE, would be a regression wearing a feature's clothes. It still
-- excludes the 81 platform groups the cap exists for; the largest is
-- npi:1235600834 (Empire) at 47,182 leaves, then npi:1427671437 at 12,088.
-- The original "nobody reads a 400-row roster inline" concern is now handled by
-- pagination, not by the cap: the Services tab has been server-paginated since
-- NYS-114, so the cap's remaining job is only to keep the platform TINs out.
--
-- COVERAGE, unchanged in kind: same six payers, same rate filters as 032/027 —
-- copied verbatim on purpose. A row here must mean exactly what a row there
-- means, minus the pivot. Callers still must not claim completeness.
--
-- ── REFRESH ────────────────────────────────────────────────────────────────
--   REFRESH MATERIALIZED VIEW CONCURRENTLY rate_service_rows_mv;
-- The unique index below is on PLAIN COLUMNS (the NYS-88 trap: an expression
-- column silently disqualifies CONCURRENTLY and the refresh then takes an
-- ACCESS EXCLUSIVE lock that hangs /rates for its duration).

CREATE MATERIALIZED VIEW IF NOT EXISTS rate_service_rows_mv AS
WITH cells AS (
  SELECT s.tin, s.payer, s.npi, s.plan_or_network AS network, s.place_of_service AS setting,
         s.billing_code,
         CASE WHEN count(DISTINCT s.negotiated_rate) = 1 THEN min(s.negotiated_rate) END AS rate,
         count(DISTINCT s.negotiated_rate)::int AS n_rates,
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
    -- No billing_code filter: the twenty codes ARE cpt_codes. Gating on a
    -- hardcoded list is what made fifteen of them unreachable.
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
  -- Verbatim from sql/032: an NPI can land once from 'nppes' and once from
  -- 'medicaid'; only nppes rows carry a credential and only medicaid rows are
  -- authoritative on profession, so coalesce the best value per field rather
  -- than picking one row and inheriting its NULLs.
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
       d.name AS display_name,
       d.credential,
       d.profession,
       d.city,
       d.county,
       c.last_file_date AS as_of,
       -- ONE trigram-indexable haystack for the keystroke search.
       -- WHY (measured 2026-07-20): the Services search is an OR across five
       -- columns (display_name, payer, network, tin, npi). A gin_trgm index on
       -- display_name ALONE cannot serve that OR — Postgres fell back to a
       -- Parallel Seq Scan and the count leg took 503 ms over 1.09M rows.
       -- Folding the five into one pre-lowered column makes it a single
       -- indexable predicate. Pre-lowered so the repo can use LIKE on an
       -- already-folded needle instead of ILIKE.
       lower(concat_ws(' ', d.name, c.payer, c.network, c.tin, c.npi)) AS search_text
FROM cells c
JOIN eligible e ON e.tin = c.tin AND e.payer = c.payer
LEFT JOIN dir d ON d.npi = c.npi;

-- PLAIN-COLUMN unique key on the full grain — required for REFRESH CONCURRENTLY
-- (sql/README trap, NYS-88). `setting` is a pipe-joined service-code list up to
-- ~90 chars; indexed whole, never hashed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsr_key
  ON rate_service_rows_mv (payer, tin, npi, network, setting, billing_code);

-- The read path: listRateRows' ORDER BY, so an unfiltered first page is a
-- top-N over this index rather than a sort of a million rows.
CREATE INDEX IF NOT EXISTS idx_rsr_order
  ON rate_service_rows_mv (payer, network, billing_code, rate DESC NULLS LAST, npi);

-- The Code facet, and the per-code counts /codes reports.
CREATE INDEX IF NOT EXISTS idx_rsr_code ON rate_service_rows_mv (billing_code);

-- Keystroke search. One index over the folded haystack, NOT one per column:
-- sql/060's display_name-only index is the shape that lost to the OR (see
-- search_text above). Supersedes it for this matview.
CREATE INDEX IF NOT EXISTS idx_rsr_search_trgm
  ON rate_service_rows_mv USING gin (search_text gin_trgm_ops);

ANALYZE rate_service_rows_mv;

COMMENT ON MATERIALIZED VIEW rate_service_rows_mv IS
  'One row per published service: (insurer, billing ID, NPI, network, setting, billing code) over all twenty cpt_codes, for billing IDs holding <=400 such leaves for that insurer. The long-grain twin of sql/032 rate_table_child_mv, which pivots only five codes — this is what the /rates Services tab reads (NYS-50).';
