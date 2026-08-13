-- Leuk — 068: provider_rate_signals (tin, payer, billing_code) index.
--
-- Enables the org map's rate drill: clicking a "78 rates" chip lists the
-- actual distinct published prices for ONE (tin, payer, code) cell, with
-- plan/network attribution — a live query on the base table, so it needs an
-- index (the table is ~16M rows and previously had only npi and (payer,code)
-- indexes; per-TIN reads seq-scanned, the sql/025 NYS-52 lesson).

CREATE INDEX IF NOT EXISTS idx_prs_tin_payer_code
  ON provider_rate_signals (tin, payer, billing_code);
