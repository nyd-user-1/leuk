-- Leuk — 067: canvas_maps (the /maps builder's saved documents).
--
-- A map is user-drawn STRUCTURE over reference data: entity nodes (org TINs,
-- payer names, provider NPIs) with positions, serialized as one JSONB doc
-- (lib/canvas.ts CanvasDoc). Edges are never stored — the corpus re-derives
-- them on load, so a reopened map always shows current published rates.
-- Reference entities only, no PHI. Owner-scoped in the API layer
-- (lib/repos/canvas.ts filters every read/write by owner_id).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS canvas_maps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   TEXT NOT NULL,              -- SessionUser.id
  name       TEXT NOT NULL,
  doc        JSONB NOT NULL,             -- CanvasDoc
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_canvas_maps_owner
  ON canvas_maps(owner_id, updated_at DESC);

COMMENT ON TABLE canvas_maps IS
  'Saved /maps builder documents — user-drawn entity graphs over the rate corpus. Structure only (nodes + positions); edges re-derive from the rollups on every load.';
