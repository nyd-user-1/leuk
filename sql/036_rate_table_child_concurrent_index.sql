-- Leuk — 036: let rate_table_child_mv refresh without locking the app (NYS-84).
--
-- THE BUG. sql/032 gives rate_table_child_mv a unique index and says, in a
-- comment, that "the index exists so REFRESH CONCURRENTLY works". It does not,
-- and never has:
--
--   CREATE UNIQUE INDEX idx_rate_table_child_key
--     ON rate_table_child_mv (payer, tin, npi, network, md5(setting));
--                                                       ^^^^^^^^^^^^
--
-- REFRESH MATERIALIZED VIEW CONCURRENTLY needs a unique index that is valid,
-- non-partial, AND built on plain columns — an EXPRESSION column disqualifies
-- it (see PostgreSQL's matview.c, which requires every indexed attribute to be
-- a real attribute number). So `md5(setting)` makes the index useless for the
-- one job its comment says it exists to do. Postgres reports this only when you
-- try, and its HINT ("create a unique index with no WHERE clause") points at
-- partial indexes, not expressions — which is why the belief survived.
--
-- Every other derived view here has a plain-column unique index and refreshes
-- concurrently; this was the only one that could not, and it was found by
-- measuring the nightly chain (NYS-84) rather than by reading, because reading
-- it says the opposite.
--
-- WHY THIS MATTERS RATHER THAN BEING A CURIOSITY. Without a qualifying index
-- the only way to rebuild this view is a plain REFRESH, which holds ACCESS
-- EXCLUSIVE on it for the whole rebuild — i.e. /published-rates hangs until it
-- finishes. Nightly, unattended. With the index below the same refresh takes
-- 11.6s and never blocks a reader.
--
-- WHY THE PLAIN COLUMNS ARE SAFE HERE. 032 hashed `setting` to keep the index
-- small, not because it had to: measured on the live book, (payer, tin, npi,
-- network, setting) is exactly unique (129,490 rows / 129,490 distinct), and the
-- widest key is 229 bytes against btree's ~2704-byte limit. The index builds in
-- under half a second.

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_table_child_grain
  ON rate_table_child_mv (payer, tin, npi, network, setting);

-- The md5 index is now dead weight: it was only ever there to enable
-- CONCURRENTLY (032's own comment), it never did, and the new index leads with
-- the same four columns, so anything the old one could serve the new one serves.
DROP INDEX IF EXISTS idx_rate_table_child_key;
