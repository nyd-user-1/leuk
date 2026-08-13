-- Leuk — 022: complete the trigram coverage for provider search.
--
-- searchProviders (lib/repos/directory.ts) ORs ILIKE over five columns:
-- name, city, profession, subspecialty, primary_taxonomy. sql/005 indexed the
-- first three; the missing two forced a bitmap-OR to fall back to seq scan on
-- every keystroke. 123k rows, no concurrent write traffic on this table.

CREATE INDEX IF NOT EXISTS idx_dir_providers_subspecialty_trgm
  ON directory_providers USING gin (subspecialty gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dir_providers_taxonomy_trgm
  ON directory_providers USING gin (primary_taxonomy gin_trgm_ops);
