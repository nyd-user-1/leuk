-- Leuk — 032: rate_table_child_mv — the rows a payer actually published.
--
-- WHAT A CHILD IS. One row per (billing ID, insurer, NPI, network, setting).
-- That is the grain Cigna publishes at, and every one is a LITERAL row in their
-- file — not a cross-product we constructed. Georgianna Dart (NPI 1750644324)
-- under ein:226019101 has four, all dated 2026-07-01:
--   localplus / CSTM-00     90791 $155.00   90837 $130.00   99214 —
--   national-oap / CSTM-00  90791 $155.00   90837 $130.00   99214 —
--   national-oap / facility 90791 $133.02   90837 $132.21   99214 $83.83
--   national-oap / office   90791 $137.47   90837 $133.02   99214 $116.98
-- Four rows, three distinct prices (the CSTM-00 pair agrees), and 99214 is the
-- proof they are not one row smeared four ways: blank on CSTM-00, $83.83 in a
-- facility, $116.98 in an office.
--
-- WHY NETWORK AND SETTING ARE COLUMNS, NOT A GROUP BY. Collapsing them is the
-- mistake this file corrects. sql/027 grouped to (tin, payer, code) and called
-- the collisions "multi-rate"; the FIRST cut of this file grouped to
-- (tin, payer, npi, code) and did the same thing one level down — Dart's cell
-- read "3 rates" when those three are an office rate, a facility rate and a
-- custom-network rate, each one a fact. Both columns are present on 826,572 of
-- 826,572 rows (0 missing), as is file_date. Nothing is inferred; they are
-- carried.
--
-- Resolution at this grain: 91.0% of (npi, network, setting, code) cells hold
-- exactly ONE rate — vs 82.0% at (npi, code) and 45.5% at sql/027's (tin, code).
-- The 9% that remain have every column we store identical and differ anyway.
-- That is NYS-64 (scan-tic drops billing_code_modifier), not a grain choice, and
-- no regrouping reaches it; n_rates carries the count for exactly those.
--
-- ── THE CAP ────────────────────────────────────────────────────────────────
-- Gated on the row's OWN leaf count for THIS payer — not the TIN's roster across
-- every payer. That was the earlier bug: ein:223376459 has a 59-NPI roster, so
-- all three of its rows lost their children, including an EmblemHealth row with
-- exactly ONE clinician in that book.
--   <=100 leaves   38,474 rows  <- this MV
--   >100 leaves       242 rows -> 108,135 children, 48% of the total, excluded.
-- The largest is Headway. Nobody reads a 10,873-row roster inline; /orgs owns
-- those rosters.
--
-- ── REFRESH ────────────────────────────────────────────────────────────────
-- Reads only provider_rate_signals + directory_providers, so it has no ordering
-- dependency on the naming scripts — but refresh it WITH 027, or the two halves
-- of one row disagree about what the payer published:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY rate_table_mv;         -- 027
--   REFRESH MATERIALIZED VIEW CONCURRENTLY rate_table_child_mv;   -- 032 (this)
-- Every filter below is copied from sql/027 ON PURPOSE and must stay identical —
-- a child whose filters differ from its parent's is a child that does not add up
-- to it.

CREATE MATERIALIZED VIEW IF NOT EXISTS rate_table_child_mv AS
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
    AND s.billing_code IN ('90791', '90834', '90837', '90853', '99214')
    AND lower(s.billing_class) = 'professional'
    AND s.negotiated_type NOT ILIKE '%percent%'
    AND s.negotiated_rate > 5
  GROUP BY s.tin, s.payer, s.npi, s.plan_or_network, s.place_of_service, s.billing_code
), eligible AS (
  SELECT tin, payer
  FROM (SELECT DISTINCT tin, payer, npi, network, setting FROM cells) l
  GROUP BY tin, payer
  HAVING count(*) <= 100
), pivot AS (
  SELECT c.tin, c.payer, c.npi, c.network, c.setting,
         max(c.rate) FILTER (WHERE c.billing_code = '90791')::numeric(10,2) AS c90791,
         max(c.rate) FILTER (WHERE c.billing_code = '90834')::numeric(10,2) AS c90834,
         max(c.rate) FILTER (WHERE c.billing_code = '90837')::numeric(10,2) AS c90837,
         max(c.rate) FILTER (WHERE c.billing_code = '90853')::numeric(10,2) AS c90853,
         max(c.rate) FILTER (WHERE c.billing_code = '99214')::numeric(10,2) AS c99214,
         COALESCE(max(c.n_rates) FILTER (WHERE c.billing_code = '90791'), 0) AS n90791,
         COALESCE(max(c.n_rates) FILTER (WHERE c.billing_code = '90834'), 0) AS n90834,
         COALESCE(max(c.n_rates) FILTER (WHERE c.billing_code = '90837'), 0) AS n90837,
         COALESCE(max(c.n_rates) FILTER (WHERE c.billing_code = '90853'), 0) AS n90853,
         COALESCE(max(c.n_rates) FILTER (WHERE c.billing_code = '99214'), 0) AS n99214,
         max(c.last_file_date) AS as_of
  FROM cells c
  JOIN eligible e ON e.tin = c.tin AND e.payer = c.payer
  GROUP BY c.tin, c.payer, c.npi, c.network, c.setting
), dir AS (
  -- Identical to sql/027's dir CTE: an NPI can land once from the 'nppes' load
  -- and once from 'medicaid'; only 'nppes' rows carry a credential and only
  -- 'medicaid' rows are authoritative on profession, so coalesce the best value
  -- per field rather than picking one row and inheriting its NULLs.
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
SELECT p.tin,
       p.payer,
       p.npi,
       p.network,
       p.setting,
       d.name AS display_name,
       d.credential,
       upper(regexp_replace(d.credential, '[.[:space:]-]', '', 'g')) AS credential_norm,
       d.profession,
       d.city,
       d.county,
       p.c90791, p.c90834, p.c90837, p.c90853, p.c99214,
       p.n90791, p.n90834, p.n90837, p.n90853, p.n99214,
       p.as_of
FROM pivot p
LEFT JOIN dir d ON d.npi = p.npi;

-- (payer, tin, npi, network, setting) is the grain. `setting` is a pipe-joined
-- service_code list up to ~90 chars, so it is hashed into the unique index
-- rather than indexed whole.
-- CORRECTION (NYS-88): the original intent — "so REFRESH CONCURRENTLY works" —
-- was wrong, and this md5 index never enabled it. REFRESH MATERIALIZED VIEW
-- CONCURRENTLY needs a unique index on PLAIN COLUMNS; an expression column like
-- md5(setting) disqualifies it (Postgres matview.c requires a real attribute
-- number for every indexed column). sql/036 is the fix: a plain-column unique
-- index on the verified-unique grain, dropping this md5 one — refresh went from
-- impossible-concurrently (ACCESS EXCLUSIVE, hangs /rates) to non-blocking ~11.6s.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_table_child_key
  ON rate_table_child_mv (payer, tin, npi, network, md5(setting));

COMMENT ON MATERIALIZED VIEW rate_table_child_mv IS
  'The rows a payer actually published: one per (billing ID, insurer, NPI, network, setting), for billing IDs holding <=100 such rows for that payer. Children of sql/027 rate_table_mv. network + setting are COLUMNS, not a GROUP BY — collapsing them is what made a real office-vs-facility price difference render as "3 rates".';
