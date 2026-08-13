-- Leuk — Photon e-prescribing demo (029). Three things, all re-runnable:
--   1. Dr. Shelley Padgett's users row (the one practitioner fixture no
--      migration ever created — see the note below).
--   2. Spreads every demo client across the five practitioners.
--   3. clients.photon_patient_id — the Photon patient id we sync to.
--
-- Demo data only. Password for the new login is "demo", via the same bcrypt
-- hash every other demo user carries (copied from an existing row — no new
-- auth mechanism, that IS the demo login).

-- ── 1. practitioner fixtures ─────────────────────────────────────────────────
-- Jason Hilario already lands in 011. Shelley, though, is referenced by 008
-- (slug + provider_profiles, both written as no-ops "until her user row
-- exists") but no migration ever inserted her — she was created by hand on the
-- live DB. That gap means a from-scratch rebuild has 4 practitioners and no
-- /providers/shelley-padgett. This closes it; on the live DB it's a no-op.
-- avatar_hue is CHECK-constrained to (teal, amber, pink, blue) — 5 practitioners
-- can't have 5 distinct hues, so teal repeats. Matches her live row exactly.
INSERT INTO users (id, role, name, email, password_hash, avatar_hue, phone, timezone, slug)
SELECT '00000000-0000-4000-8000-000000001006', 'practitioner', 'Dr. Shelley Padgett', 'shelley@leuk.demo',
  (SELECT password_hash FROM users WHERE email = 'brendan@leuk.demo'),
  'teal', '+1 212 555 0144', 'America/New_York', 'shelley-padgett'
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'brendan@leuk.demo')
ON CONFLICT (id) DO NOTHING;

-- ── 2. spread clients across the practitioners ───────────────────────────────
-- The five role='practitioner' users (Brendan is role='admin' — the practice
-- admin, who sees every client rather than owning a caseload). Deterministic:
-- practitioners ordered by name, clients by created_at, round-robin on the
-- modulo, so re-running lands the same assignment. Overwriting is fine here —
-- it's demo data, and today everything sits on Brendan (8) + Priya (6).
WITH pracs AS (
  SELECT id,
         row_number() OVER (ORDER BY name) - 1 AS slot,
         count(*) OVER ()                      AS n
  FROM users
  WHERE role = 'practitioner'
), ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn
  FROM clients
)
UPDATE clients c
SET primary_practitioner_id = p.id,
    updated_at = now()
FROM ranked r
JOIN pracs p ON p.slot = r.rn % p.n
WHERE c.id = r.id
  AND c.primary_practitioner_id IS DISTINCT FROM p.id;

-- ── 3. Photon patient link ───────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS photon_patient_id TEXT;
COMMENT ON COLUMN clients.photon_patient_id IS 'Photon patient id (org-scoped); set by POST /api/photon/sync-patient. NULL = not yet synced.';
CREATE INDEX IF NOT EXISTS idx_clients_photon_patient ON clients(photon_patient_id) WHERE photon_patient_id IS NOT NULL;
