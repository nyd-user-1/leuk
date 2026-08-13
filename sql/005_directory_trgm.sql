-- Leuk — 005: trigram indexes for fast substring search on the directory.
--
-- searchProviders / searchPrograms match free-text `q` with
-- `name ILIKE '%q%' OR city ILIKE '%q%' OR profession ILIKE '%q%'`. A btree
-- can't serve leading-wildcard ILIKE, so at 116k rows this was a ~300 ms seq
-- scan. GIN trigram indexes on every ORed column let the planner BitmapOr the
-- branches instead — ~20 ms. Indexing all three columns matters: if any OR
-- branch lacked an index the planner would fall back to a full scan anyway.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_dir_providers_name_trgm ON directory_providers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dir_providers_city_trgm ON directory_providers USING gin (city gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dir_providers_profession_trgm ON directory_providers USING gin (profession gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_dir_programs_name_trgm ON directory_programs USING gin (program_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_dir_programs_city_trgm ON directory_programs USING gin (city gin_trgm_ops);
