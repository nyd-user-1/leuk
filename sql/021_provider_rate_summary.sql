-- Leuk — 021: provider_rate_summary (one row per NPI, pre-aggregated).
-- Backbone for the ranked provider rate-directory AND the recruiting footprint:
-- reading this ~34k-row matview is instant vs scanning the 8.8M-row fact table.
-- After each rate load: REFRESH MATERIALIZED VIEW CONCURRENTLY provider_rate_summary;
-- (also refresh provider_participation_summary (023), the rate_bands_* matviews (024), and payer_rate_totals (026))
-- NY-book payers only, dollar types only, deduped (distinct npi×payer×code×rate).
CREATE MATERIALIZED VIEW IF NOT EXISTS provider_rate_summary AS
WITH dd AS (
  SELECT DISTINCT npi, payer, billing_code, negotiated_rate, as_of
  FROM provider_rate_signals
  WHERE negotiated_type NOT ILIKE '%percent%'
    AND payer ~* 'new york|of ny|cdphp|oxford|metroplus|carelon|emblem|centene|fidelis|cigna|western new york|empire|excellus|highmark|unitedhealth'
)
SELECT npi,
  count(DISTINCT payer)::int AS payer_count,
  max(negotiated_rate) FILTER (WHERE billing_code='90791') AS best_90791,
  max(negotiated_rate) FILTER (WHERE billing_code='90834') AS best_90834,
  max(negotiated_rate) FILTER (WHERE billing_code='90837') AS best_90837,
  max(negotiated_rate) FILTER (WHERE billing_code='90853') AS best_90853,
  max(negotiated_rate) FILTER (WHERE billing_code='99214') AS best_99214,
  max(as_of) AS as_of
FROM dd GROUP BY npi;
CREATE UNIQUE INDEX IF NOT EXISTS idx_prs_summary_npi ON provider_rate_summary(npi);
CREATE INDEX IF NOT EXISTS idx_prs_summary_paycount ON provider_rate_summary(payer_count DESC);
CREATE INDEX IF NOT EXISTS idx_prs_summary_90837 ON provider_rate_summary(best_90837 DESC NULLS LAST);
