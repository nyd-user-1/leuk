-- Leuk — 026: payer_rate_totals (Insurers board, docs/TASK-ERD-PAGE.md V2).
--
-- /admin/data's Insurers tab needs one row per RAW payer label (all 29, no
-- NY-book/dollar-type filter — this is a total, not a rate-quality signal)
-- with npis/rows/latest, joined in JS against lib/repos/admin.ts's INSURERS
-- config. The live `GROUP BY payer` over provider_rate_signals scans the
-- whole 9M-row table and runs ~18s — too slow for the tab's <3s cold target.
-- Same house pattern as 021/023/024: precompute, REFRESH post-ingest.
--
-- Deliberately NOT applied to the membership side (payer_sources JOIN
-- provider_network_participation, ~2.4s live): that harvest runs live while
-- this page is open and the Insurers tab's whole point is showing its NPI
-- count climb between page loads — matviewing it would freeze the number
-- until the next manual refresh. Leave that query live.
--
-- After every rate load, refresh alongside 021 + 023 + 024:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY payer_rate_totals;

CREATE MATERIALIZED VIEW IF NOT EXISTS payer_rate_totals AS
SELECT payer, count(DISTINCT npi)::int AS npis, count(*)::int AS rows, max(as_of) AS latest
FROM provider_rate_signals
GROUP BY payer;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prt_payer ON payer_rate_totals(payer);
