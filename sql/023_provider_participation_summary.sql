-- Leuk — 023: provider_participation_summary (per-NPI network aggregate).
--
-- The directory's server-side Accepting/Network sort (session-3 handoff) was
-- aggregating all of provider_network_participation per request — 2.7–5s once
-- the table passed 1M rows. This matview is that GROUP BY, computed once:
-- one row per NPI with participation anywhere.
--
-- Refresh alongside provider_rate_summary (021), the rate_bands_* matviews
-- (024), and payer_rate_totals (026) after every ingest:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY provider_participation_summary;
-- Staleness between ingest and refresh only softens a sort ranking — never a
-- membership claim (those read the base table).

CREATE MATERIALIZED VIEW IF NOT EXISTS provider_participation_summary AS
SELECT pnp.npi,
       bool_or(pnp.accepting_new_patients = 'accepting') AS any_accepting,
       count(DISTINCT COALESCE(pn.network_name, ''))     AS network_count,
       count(DISTINCT pnp.payer_source_id)               AS payer_count,
       max(pnp.source_last_updated)                      AS latest_source_update
FROM provider_network_participation pnp
LEFT JOIN payer_networks pn ON pn.id = pnp.network_id
GROUP BY pnp.npi;

-- UNIQUE index: required for REFRESH … CONCURRENTLY, and it's the join key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pps_npi ON provider_participation_summary(npi);
