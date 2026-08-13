-- Leuk — 027: rate_table_mv (the published-rates table, /published-rates).
--
-- WHAT A ROW IS. Not a person, not a company: a row is ONE INSURER'S PRICE LIST
-- FOR ONE BILLING GROUP — the party that insurer contracts with and pays. Grain
-- is (tin, payer); the page ships the whole corpus and narrows it client-side,
-- so this MV is the entire query layer: no per-row lookups, no request-time
-- filters.
--
-- WHAT `tin` IS, AND WHY IT IS NOT A "TIN" COLUMN. In the CMS Transparency in
-- Coverage schema a provider group is `{npi: [...], tin: {type, value}}`, where
-- type is 'ein' OR 'npi'. So the field is really "the identifier this payer
-- chose to publish for this group" — an EIN, or an NPI standing in for one.
-- The choice belongs to the PAYER, not the provider (measured 2026-07-14):
--   Empire BlueCross  0% ein / 100% npi      Cigna       72% / 28%
--   Fidelis          100% ein /   0% npi      Oxford      65% / 35%
--   MetroPlus        100% ein /   0% npi      EmblemHealth 59% / 41%
-- 28,210 NPIs appear under BOTH an ein-identifier and an npi-identifier — the
-- same human, identified differently by different insurers. An NPI is not a tax
-- ID; do not label this column "TIN" in any UI.
--
-- CONSEQUENCE: one provider legitimately appears in many rows. NPI 1407961386
-- sits in six — three EINs (employers she bills through; the EIN belongs to the
-- employer, not to her) plus npi:1407961386 (billing as herself) and two org
-- NPIs (MEMORIAL GASTROENTEROLOGY GROUP, MSKCC RADIOLOGY GROUP). She does not
-- "have" three EINs. Rows are billing relationships, not people.
--
-- REFRESH ORDER — this MV reads tin_registry, so it must refresh AFTER the
-- names land or ~77% of the table renders "Unnamed practice". It appends to the
-- existing post-ingest routine (canonical copy: sql/README.md, which also has
-- the NPPES monthly-full / weekly-incremental cadence that feeds sql/030):
--
--   REFRESH MATERIALIZED VIEW CONCURRENTLY provider_rate_summary;            -- 021
--   REFRESH MATERIALIZED VIEW CONCURRENTLY provider_participation_summary;   -- 023
--   REFRESH MATERIALIZED VIEW CONCURRENTLY rate_bands_*;                     -- 024
--   node --env-file=.env.local scripts/orgs-sync.mjs                         -- 025 MVs + names
--   node --env-file=.env.local scripts/backfill-tin-names.mjs                -- roster-derived names
--   node --env-file=.env.local scripts/nppes-name-groups.mjs                 -- 030 co-located org names
--   REFRESH MATERIALIZED VIEW CONCURRENTLY rate_table_mv;                    -- 027 (this file)
--   ANALYZE;
--
-- nppes-name-groups.mjs reads THIS MV (it asks "which rows still render
-- unnamed?") and writes tin_registry, which this MV reads. That is a real cycle
-- and the order above resolves it: the matcher runs against the PREVIOUS
-- refresh, then the refresh picks up its names. On a first build, run the
-- matcher after the initial CREATE and refresh again.
--
-- orgs-sync.mjs refreshes org_tin_rosters, which this MV joins for roster size /
-- entity kind / NPI search — so 027 refreshes after orgs-sync, not before.
--
-- Build cost ~5-10s (the filtered fact scan is ~4s); well inside Neon's 5-minute
-- per-statement ceiling, so no chunked CREATE TABLE AS needed.
--
-- Query constraints below are NOT optional — each one was measured against live
-- data (2026-07-14) and each silently corrupts the table if dropped:
--  * lower(billing_class) = 'professional' — the column is case-inconsistent
--    ('Professional' vs 'professional'); naive equality drops half the data.
--  * negotiated_type NOT ILIKE '%percent%' — percentage-of-billed-charge rows
--    are not dollar rates. Every other MV in this DB applies this filter.
--  * negotiated_rate > 5 — noise floor.
--  * The payer ALLOWLIST (not a blocklist). Excluded on purpose: both Aetna
--    labels (7.9M of 9.3M rows, ~3,100 distinct 90837 rates, ~4% single-rate
--    resolution — they'd render an almost entirely empty table), UnitedHealthcare
--    of NY (5.6%), Oxford Health Plans (CT) (7.2%), CDPHP (0.0%), out-of-state
--    Blues, Excellus (5 rows). Adding a payer here means proving its single-rate
--    share first.
--  * A TIN shows a RATE for a code only if that (tin, payer, code) resolves to
--    exactly ONE distinct value — picking one arbitrarily would invent a fact
--    the payer never published. But a multi-rate cell is NOT empty: it carries
--    n_rates, the COUNT of distinct rates, and the UI renders that count.
--
--    This is the correction of 2026-07-15. The cell used to render "—" whenever
--    count(DISTINCT) > 1, which deleted the page's own headline: the thesis
--    sentence is "Cigna pays 395 DIFFERENT RATES for a 60-minute therapy session
--    in New York" — a count of distinct rates — and the table was built to show
--    nothing precisely when that count exceeded one. The same statistic reads at
--    three altitudes: 395 across the corpus, 4 across a practice, 10 for one
--    clinician. "—" now means one thing only: the payer published nothing here.
--
--    A count is honest whichever way NYS-64 resolves. If those 10 rates turn out
--    to be modifier variants (90837 vs 90837-95) rather than 10 prices for one
--    service, the count is still literally true — the payer's file does contain
--    10 distinct rates matching this identifier + code + network + setting. A
--    single picked number would be a lie under either reading.

-- ── rate_table_mv ────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS rate_table_mv AS
WITH leaves AS (
  -- How many rows the payer actually published under this billing ID — one per
  -- (NPI, network, setting). This is what decides the row's SHAPE: >1 and it is
  -- a group header (empty across every rate column, opens to sql/032's
  -- children); exactly 1 and the row IS that published row, so it shows the
  -- dollars. A rate column then holds only rates, never a count of them.
  SELECT tin, payer, count(*)::int AS n_leaves
  FROM (
    SELECT DISTINCT tin, payer, npi, plan_or_network, place_of_service
    FROM provider_rate_signals
    WHERE payer = ANY (ARRAY[
            'Cigna Health & Life',
            'Empire BlueCross BlueShield',
            'Oxford Health Insurance Inc',
            'EmblemHealth (Carelon behavioral)',
            'Fidelis Care (Centene)',
            'MetroPlus Health Plan'
          ])
      AND billing_code IN ('90791', '90834', '90837', '90853', '99214')
      AND lower(billing_class) = 'professional'
      AND negotiated_type NOT ILIKE '%percent%'
      AND negotiated_rate > 5
  ) l
  GROUP BY tin, payer
), cells AS (
  -- (tin, payer, code) -> the single published rate, or NULL when the entity
  -- carries several rates for that code under the same book — in which case
  -- n_rates says how many. Only read on a row with ONE leaf; a group header
  -- ignores both and renders empty.
  SELECT tin, payer, billing_code,
         CASE WHEN count(DISTINCT negotiated_rate) = 1 THEN min(negotiated_rate) END AS rate,
         count(DISTINCT negotiated_rate)::int AS n_rates,
         max(file_date) AS last_file_date
  FROM provider_rate_signals
  WHERE payer = ANY (ARRAY[
          'Cigna Health & Life',
          'Empire BlueCross BlueShield',
          'Oxford Health Insurance Inc',
          'EmblemHealth (Carelon behavioral)',
          'Fidelis Care (Centene)',
          'MetroPlus Health Plan'
        ])
    AND billing_code IN ('90791', '90834', '90837', '90853', '99214')
    AND lower(billing_class) = 'professional'
    AND negotiated_type NOT ILIKE '%percent%'
    AND negotiated_rate > 5
  GROUP BY tin, payer, billing_code
), pivot AS (
  -- Five codes -> five columns. cells holds exactly one row per group, so the
  -- FILTERed max() is just "that row's rate" (NULL stays NULL).
  SELECT tin, payer,
         max(rate) FILTER (WHERE billing_code = '90791')::numeric(10,2) AS c90791,
         max(rate) FILTER (WHERE billing_code = '90834')::numeric(10,2) AS c90834,
         max(rate) FILTER (WHERE billing_code = '90837')::numeric(10,2) AS c90837,
         max(rate) FILTER (WHERE billing_code = '90853')::numeric(10,2) AS c90853,
         max(rate) FILTER (WHERE billing_code = '99214')::numeric(10,2) AS c99214,
         -- How many distinct rates the payer published for this group + code.
         -- 0 (no row in cells) -> genuinely nothing; 1 -> c* holds it; >1 -> the
         -- cell renders this number and opens.
         COALESCE(max(n_rates) FILTER (WHERE billing_code = '90791'), 0) AS n90791,
         COALESCE(max(n_rates) FILTER (WHERE billing_code = '90834'), 0) AS n90834,
         COALESCE(max(n_rates) FILTER (WHERE billing_code = '90837'), 0) AS n90837,
         COALESCE(max(n_rates) FILTER (WHERE billing_code = '90853'), 0) AS n90853,
         COALESCE(max(n_rates) FILTER (WHERE billing_code = '99214'), 0) AS n99214,
         -- The payer's PUBLICATION date (file_date), not provider_rate_signals'
         -- own as_of — as_of is when we scanned the file and reads ~today for
         -- every payer, which would render MetroPlus's Feb-2024 book as fresh.
         max(last_file_date) AS as_of
  FROM cells
  GROUP BY tin, payer
), roster_base AS (
  -- org_tin_rosters is the ready-made tin->npi join (31,233 TINs / 150,499 rows).
  -- NEVER resolve rosters off provider_rate_signals directly — the correlated
  -- version blows the 5-minute statement ceiling.
  --
  -- Identity comes from sql/030's nppes_npi (the FULL federal file: nationwide,
  -- both entity types) and NOT from nppes_organizations, which is NY-scoped and
  -- therefore silently answers "not an org" for every out-of-state entity.
  SELECT t.tin,
         count(*)::int AS n_clinicians,
         -- Platform TINs (Headway et al.) carry thousands of NPIs; shipping them
         -- would balloon the page payload for a client-side search nobody runs
         -- on a 13k-provider roster. Small rosters only.
         CASE WHEN count(*) <= 25 THEN array_agg(t.npi ORDER BY t.npi) ELSE '{}'::text[] END AS npis,
         min(t.npi) AS first_npi,
         COALESCE(bool_or(n.entity_type = 2), false) AS roster_has_org,
         -- The lone member's OWN sole-proprietor attestation. Only read when
         -- n_clinicians = 1, which is the only case where "the roster" is a
         -- person rather than a crowd.
         min(n.sole_proprietor) FILTER (WHERE n.entity_type = 1) AS solo_sole_prop,
         -- What KIND of NPI did the payer use as the identifier? For an 'npi:'
         -- TIN the payer named the billing group by an NPI, and that NPI is
         -- often the GROUP's own NPI-2 (npi:1629049192 = MEMORIAL
         -- GASTROENTEROLOGY GROUP), not any member's. That is the strongest
         -- evidence we have about the entity and it outranks the roster.
         min(idn.entity_type) AS id_entity_type
  FROM org_tin_rosters t
  LEFT JOIN nppes_npi n ON n.npi = t.npi
  LEFT JOIN nppes_npi idn ON t.tin LIKE 'npi:%' AND idn.npi = substr(t.tin, 5)
  GROUP BY t.tin
), roster AS (
  SELECT tin, n_clinicians, npis, entity_kind,
         -- Non-NULL only for an individual, so the LEFT JOIN below hands
         -- individual-only attributes (credential, county) to individuals and
         -- NULL to organizations — a group's clinicians have many credentials,
         -- so one credential on an org row would be a lie.
         CASE WHEN entity_kind = 'individual' THEN solo_npi_cand END AS solo_npi
  FROM (
    SELECT rb.*,
           CASE
             -- Hard fact: the payer identified this group by an org's NPI-2.
             WHEN rb.id_entity_type = 2 THEN 'organization'
             -- The provider's OWN answer, and the reason sql/030 exists. NPPES
             -- asks every NPI-1 "are you a sole proprietor?" — i.e. are you the
             -- unincorporated owner of this business. 'Y' means the billing
             -- entity IS the person. 'N' means it is not: they are employed, or
             -- they incorporated (a PLLC is an organization even when one
             -- person works there), and either way the EIN on this row belongs
             -- to an entity that is not the human. This retires the inference
             -- below for ~92% of one-NPI rows and reclassifies thousands of
             -- employers that used to render as "Individual".
             WHEN rb.n_clinicians = 1 AND rb.solo_sole_prop = 'Y' THEN 'individual'
             WHEN rb.n_clinicians = 1 AND rb.solo_sole_prop = 'N' THEN 'organization'
             -- Fallback for sole_proprietor = 'X' (not answered) and for the
             -- handful of roster NPIs absent from NPPES. This is the OLD rule,
             -- and it is a soft inference: a roster of one only means ONE member
             -- appears in the codes we harvested, so a large employer where a
             -- single clinician bills behavioural codes looks identical from
             -- here. Kept only where the provider told us nothing.
             WHEN rb.n_clinicians = 1 AND NOT rb.roster_has_org THEN 'individual'
             ELSE 'organization'
           END AS entity_kind,
           -- For an NPI-1 identifier the person named by the payer IS the
           -- entity, so their attributes come from the identifier itself;
           -- otherwise from the lone roster member.
           CASE WHEN rb.id_entity_type = 1 THEN substr(rb.tin, 5) ELSE rb.first_npi END AS solo_npi_cand
    FROM roster_base rb
  ) z
), dir AS (
  -- ~123k rows for ~106k NPIs: an NPI can land once from the 'nppes' load and
  -- once from 'medicaid'. Only 'nppes' rows carry a credential and only
  -- 'medicaid' rows are authoritative on profession, so coalesce the best
  -- available value per field instead of picking one row and inheriting its NULLs.
  SELECT npi,
         (array_agg(credential       ORDER BY (credential IS NULL),       (source = 'nppes') DESC))[1]   AS credential,
         (array_agg(profession       ORDER BY (profession IS NULL),       (source = 'medicaid') DESC))[1] AS profession,
         (array_agg(primary_taxonomy ORDER BY (primary_taxonomy IS NULL), (source = 'nppes') DESC))[1]   AS primary_taxonomy,
         (array_agg(county           ORDER BY (county IS NULL),           (source = 'nppes') DESC))[1]   AS county
  FROM directory_providers
  WHERE npi IS NOT NULL
  GROUP BY npi
)
SELECT p.tin,
       p.payer,
       reg.business_name AS display_name,        -- NULL allowed; UI renders "Unnamed practice"
       COALESCE(r.entity_kind, 'organization') AS entity_kind,
       -- Individual-only: a group's clinicians have many credentials, so a
       -- single credential on an org row would be a lie. d.* is already NULL for
       -- orgs (solo_npi is NULL -> no join match).
       d.credential,
       -- Raw credential is unnormalized in directory_providers ('MD' 3,715 vs
       -- 'M.D.' 3,742; 'PHD'/'PH.D.'/'PH.D'; 'LCSW'/'L.C.S.W.'). Strip periods,
       -- spaces and hyphens, uppercase — this is what the filter chips group on.
       -- Keep the raw value too: it's what the provider recognizes.
       upper(regexp_replace(d.credential, '[.[:space:]-]', '', 'g')) AS credential_norm,
       d.profession,
       d.primary_taxonomy,
       d.county,
       COALESCE(r.npis, '{}'::text[]) AS npis,
       COALESCE(r.n_clinicians, 0) AS n_clinicians,
       -- >1 => this row is a group HEADER: the UI renders every rate column
       -- empty and opens to sql/032's children. =1 => the row is itself the one
       -- row the payer published, and shows its dollars.
       COALESCE(lv.n_leaves, 0) AS n_leaves,
       p.c90791, p.c90834, p.c90837, p.c90853, p.c99214,
       p.n90791, p.n90834, p.n90837, p.n90853, p.n99214,
       p.as_of
FROM pivot p
LEFT JOIN leaves lv ON lv.tin = p.tin AND lv.payer = p.payer
LEFT JOIN roster r      ON r.tin = p.tin
LEFT JOIN dir d         ON d.npi = r.solo_npi
LEFT JOIN tin_registry reg ON reg.tin_norm = p.tin;

-- REFRESH ... CONCURRENTLY requires a unique index; (payer, tin) is the grain
-- and also the page's access path (`WHERE payer = $1`).
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_table_mv_key ON rate_table_mv (payer, tin);
-- Credential filtering is the page's most-used control.
CREATE INDEX IF NOT EXISTS idx_rate_table_mv_cred ON rate_table_mv (payer, credential_norm);
-- No trigram index: name/TIN/NPI search runs client-side over the loaded rows.

COMMENT ON MATERIALIZED VIEW rate_table_mv IS
  'One row per (billing TIN, payer): the single published professional rate per behavioral-health code, for the six NY payers whose books actually resolve to single rates. as_of = payer file_date (publication), not scan date. Refresh AFTER orgs-sync.mjs + backfill-tin-names.mjs — see sql/027 header.';
