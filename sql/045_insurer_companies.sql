-- Leuk — 045: the NAIC company backbone (NYS-143).
--
-- NYS-48's `insurers` is the BRAND grain (aetna, oxford…) — correct for
-- display, but a brand holds several licensed companies. This is the COMPANY
-- grain: one row per NAIC company code, the Rosetta-Stone join the DFS list
-- provides (NAIC# ↔ FEIN ↔ NAIC group ↔ org type ↔ legal name ↔ domicile),
-- anchored to its canonical brand. NAIC + EIN + group in one index:
--
--   naic          joins form5500_schedule_a.carrier_naic (federal plan side)
--   ein           joins form5500_schedule_a.carrier_ein and tin_registry
--   license_type  the DFS org code — a LICENSE, not a separate business:
--                   AH  = commercial accident & health (Insurance Law art. 42)
--                   HMO = Article 44 license — usually a SIBLING of an AH
--                         entity under the same group (707/UnitedHealth owns
--                         UHC Ins Co NY [AH] + UHC of NY [HMO] + Oxford
--                         Health Ins [AH] + Oxford Health Plans NY [HMO])
--                   MHL = Article 43 not-for-profit health service corp
--                   LF  = life insurer writing A&H (Aetna Life, Cigna H&L)
--                   PHS/MLT/MCH/MDE/MME… = the rest of the DFS taxonomy
--
-- ROLE lives on `insurer_aliases`, not here: capacity varies per book, not
-- per company — Aetna Life is the risk-bearing insurer under 'Aetna Life
-- Insurance Company' and the ASO administrator under 'Aetna (Healthfirst
-- TPA)'. Same entity, two capacities; the label is the capacity's scope.
--
-- Populated from dfs_insurers (NY-licensed universe) + the national
-- form5500 carriers we canonically map (79413). Re-runnable: refresh after
-- any dfs_insurers reload.

CREATE TABLE IF NOT EXISTS insurer_companies (
  naic         TEXT PRIMARY KEY,            -- NAIC company code (DFS pseudo-codes X…/N… carried as-is)
  insurer_id   TEXT NOT NULL REFERENCES insurers(id),
  name         TEXT NOT NULL,               -- legal entity name
  ein          TEXT,                        -- the company's own FEIN (DFS "FId")
  license_type TEXT,                        -- DFS org code (AH/HMO/MHL/LF/PHS/MLT/…); NULL = not NY-licensed (federal-only row)
  group_code   TEXT,                        -- NAIC group number
  group_name   TEXT,
  domicile     TEXT,
  source       TEXT NOT NULL DEFAULT 'dfs', -- dfs | f5500
  loaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurer_companies_insurer ON insurer_companies (insurer_id);
CREATE INDEX IF NOT EXISTS idx_insurer_companies_ein     ON insurer_companies (ein);
CREATE INDEX IF NOT EXISTS idx_insurer_companies_group   ON insurer_companies (group_code);

-- ── Populate from DFS via the naic alias map (idempotent refresh) ────────────
INSERT INTO insurer_companies (naic, insurer_id, name, ein, license_type, group_code, group_name, domicile, source)
SELECT d.naic, a.insurer_id, d.name, d.fein, d.org_type, d.group_code, d.group_name, d.domicile, 'dfs'
FROM dfs_insurers d
JOIN insurer_aliases a ON a.source = 'naic' AND a.label = d.naic
ON CONFLICT (naic) DO UPDATE SET
  insurer_id = EXCLUDED.insurer_id, name = EXCLUDED.name, ein = EXCLUDED.ein,
  license_type = EXCLUDED.license_type, group_code = EXCLUDED.group_code,
  group_name = EXCLUDED.group_name, domicile = EXCLUDED.domicile,
  source = 'dfs', loaded_at = now();

-- Companies we map canonically but DFS doesn't list (national entities seen in
-- Form 5500). UnitedHealthcare Insurance Company: CT-domiciled, the dominant
-- Schedule A health carrier; NY business runs through its NY siblings.
INSERT INTO insurer_companies (naic, insurer_id, name, ein, license_type, group_code, group_name, domicile, source) VALUES
  ('79413', 'uhc', 'UnitedHealthcare Insurance Company', NULL, NULL, '707', 'UnitedHealth Group', 'Connecticut', 'f5500')
ON CONFLICT (naic) DO NOTHING;

-- ── Role: capacity per label (risk-bearing insurer vs TPA/ASO administrator) ─
ALTER TABLE insurer_aliases ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'insurer'
  CHECK (role IN ('insurer','administrator'));

-- The known ASO/TPA books in the current MRF vocabulary: Aetna administering
-- HF Management Services' self-funded plan; CDPHP's UBI line and Independent
-- Health's IHSFS are the payers' own self-funded/TPA lines — the label is the
-- administrator capacity, membership signal unchanged.
UPDATE insurer_aliases SET role = 'administrator'
WHERE source = 'mrf' AND label = 'Aetna (Healthfirst TPA)';

COMMENT ON TABLE insurer_companies IS 'NAIC company backbone (NYS-143): one row per licensed company, anchored to its canonical brand. naic ↔ ein ↔ group ↔ license_type from the DFS Rosetta Stone + form5500-only carriers.';
COMMENT ON COLUMN insurer_companies.license_type IS 'DFS org code. HMO is an Article 44 LICENSE, typically a sibling of an AH company in the same group — not a separate business.';
COMMENT ON COLUMN insurer_aliases.role IS 'Capacity of the entity under THIS label: risk-bearing insurer (default) vs TPA/ASO administrator (e.g. Aetna (Healthfirst TPA)). Varies per book, not per company (NYS-143).';
