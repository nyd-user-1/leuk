-- Leuk — 069: payer-leading index on org_tin_rate_summary.
--
-- Pivot-on-node reads the rollup BY PAYER (an insurer re-rooted to the top
-- orgs in its book); the existing unique key leads with tin, so payer reads
-- seq-scanned ~941k rows (~3s cold). NOTE: recreate this alongside the mv if
-- sql/066 is ever re-run (DROP MATERIALIZED VIEW drops its indexes).

CREATE INDEX IF NOT EXISTS idx_otrs_payer
  ON org_tin_rate_summary (payer, npis DESC);
