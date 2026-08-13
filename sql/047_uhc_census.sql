-- Leuk — 047: UHC employer census + EIN recovery (NYS-137).
--
-- The UHC blobs index names 67,111 per-employer plan books but carries NO
-- EIN (the EIN is inside each blob; reading 67k blobs is a separate job).
-- This layer persists the census and the name→EIN matches recovered against
-- form5500_filings (sponsor_name + sponsor_dba, 150,635 filings).
--
-- CONFIDENCE RULE (measured 2026-07-18, not assumed): NO similarity
-- threshold is safe on this corpus — at trigram sim=1.0 the "matches" are
-- word-order permutations of generic small-business names (AIR COMFORT vs
-- COMFORT AIR: different filers), and at 0.89 they differ by one letter
-- (S S vs S T MANUFACTURING). Only EXACT keys ship, two of them, each
-- requiring the key to resolve to a single distinct EIN on the federal side:
--   exact-norm     shared normalizer (case, punctuation→space, legal-suffix
--                  strip, THE-prefix strip, space collapse; census hyphens
--                  are space stand-ins)
--   exact-nospace  the same key with ALL spaces removed (catches D-B-A
--                  apostrophe/spacing artifacts: DAYTON CHILDRENS ↔ DAYTON
--                  CHILDREN'S; H&R BLOCK ↔ HR BLOCK), min 6 chars
-- Ambiguous keys (>1 EIN) are rejected, never guessed.
--
-- Populated by scripts/match-uhc-census.mjs, which also loads the matched
-- employers/plans (source 'uhc-mrf-census', ON CONFLICT DO NOTHING — an EIN
-- already present from the Aetna/MVP/Excellus books is never clobbered).

CREATE TABLE IF NOT EXISTS uhc_employer_census (
  name_raw  TEXT PRIMARY KEY,     -- as it appears in the blob filename
  name_norm TEXT NOT NULL,        -- shared-normalizer key
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uhc_census_norm ON uhc_employer_census (name_norm);

CREATE TABLE IF NOT EXISTS uhc_census_matches (
  name_raw     TEXT PRIMARY KEY REFERENCES uhc_employer_census(name_raw),
  ein          TEXT NOT NULL,     -- recovered federal EIN
  sponsor_name TEXT,              -- the filed name it matched
  method       TEXT NOT NULL CHECK (method IN ('exact-norm','exact-nospace')),
  matched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_uhc_census_matches_ein ON uhc_census_matches (ein);

COMMENT ON TABLE uhc_employer_census IS 'UHC per-employer MRF book census (67k names, filename-derived, no EIN at source). NYS-137.';
COMMENT ON TABLE uhc_census_matches IS 'Name→EIN recovery vs form5500 sponsors. Exact-key methods only (measured: similarity matching unsafe on this corpus); ambiguous keys rejected.';
