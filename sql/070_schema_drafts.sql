-- Leuk — 070: schema_drafts (editable schema-redesign canvases).
--
-- A draft is a hypothetical schema — tables/columns/edges the user is free to
-- invent, rename, or delete, unlike every other canvas doc in this app (org
-- map, /maps) where an edge is a claim the corpus must attest. Nothing here
-- is ever applied to the live database; a draft is read back later (by a
-- person or by Claude) to hand-write an actual migration. Owner-scoped, same
-- shape as 067 canvas_maps.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_drafts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   TEXT NOT NULL,              -- SessionUser.id
  name       TEXT NOT NULL,
  doc        JSONB NOT NULL,             -- SchemaDraftDoc (lib/schema-draft.ts)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_drafts_owner
  ON schema_drafts(owner_id, updated_at DESC);

COMMENT ON TABLE schema_drafts IS
  'Saved schema-redesign drafts from the Data dictionary canvas — user-invented tables/columns/edges, never applied to the live schema.';
