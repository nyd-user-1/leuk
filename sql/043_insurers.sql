-- Leuk — 043: the canonical INSURER entity (NYS-48, fed by NYS-104's DFS
-- reference in sql/042).
--
-- One row per carrier brand, with parent ownership as a self-reference
-- (Elevance → Anthem/Empire + Carelon; UHG → UHC + Oxford + Optum;
-- CVS → Aetna). Three kinds:
--   group          holding company (Elevance, UnitedHealth Group, CVS Health)
--   carrier        risk-bearing brand providers contract with (Aetna, Oxford…)
--   administrator  non-risk network administrators that appear in network
--                  labels (Carelon, Optum, Evernorth, MagnaCare) — they are
--                  never the payer of record, but sql/044 networks name them.
--
-- insurer_aliases is the single crosswalk for every label vocabulary we hold:
--   mrf         provider_rate_signals.payer          (33 live labels, all mapped)
--   source      payer_sources.slug                   (12 slugs, all mapped)
--   billing     payers.name                          (3 demo billing payers)
--   naic        NAIC company code — joins dfs_insurers.naic AND
--               form5500_schedule_a.carrier_naic (same code space)
--   naic-group  NAIC group code — resolves ANY dfs_insurers row to its owner
--               even when the company code itself is unmapped
--
-- Rule of the layer: a label maps only when proven; unmapped labels resolve to
-- nothing and stay visibly separate downstream (the NYS-49 honest default).
-- The insurer_unmapped_labels view is the tripwire — new payer labels appear
-- there until someone maps them.
--
-- NAIC seeds are the codes verified in the loaded dfs_insurers rows
-- (2026-07-18) plus 79413 (UnitedHealthcare Insurance Company, the national
-- entity that dominates form5500_schedule_a). DFS pseudo-codes (X4289, X0172)
-- are carried as-is — they are what DFS publishes for those licenses.

CREATE TABLE IF NOT EXISTS insurers (
  id              TEXT PRIMARY KEY,          -- stable slug, e.g. 'aetna', 'anthem-empire'
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('group','carrier','administrator')),
  parent_id       TEXT REFERENCES insurers(id),
  naic_group_code TEXT,                      -- NAIC group number where one exists
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS insurer_aliases (
  source     TEXT NOT NULL CHECK (source IN ('mrf','source','billing','naic','naic-group')),
  label      TEXT NOT NULL,                  -- the exact string/code as it appears in that vocabulary
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  PRIMARY KEY (source, label)
);
CREATE INDEX IF NOT EXISTS idx_insurer_aliases_insurer ON insurer_aliases (insurer_id);

-- ── Groups ───────────────────────────────────────────────────────────────────
INSERT INTO insurers (id, name, kind, parent_id, naic_group_code, notes) VALUES
  ('cvs-health',          'CVS Health',                 'group', NULL, '1',    'NAIC group still filed as AETNA Group'),
  ('elevance',            'Elevance Health',            'group', NULL, '671',  NULL),
  ('uhg',                 'UnitedHealth Group',         'group', NULL, '707',  NULL),
  ('cigna-group',         'The Cigna Group',            'group', NULL, '901',  'NAIC group filed as Cigna Health Group'),
  ('centene',             'Centene',                    'group', NULL, '1295', NULL),
  ('lifetime-healthcare', 'Lifetime Healthcare',        'group', NULL, '1186', 'Parent of Excellus + Univera'),
  ('highmark-health',     'Highmark Health',            'group', NULL, NULL,   NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Carriers: the NY book ────────────────────────────────────────────────────
INSERT INTO insurers (id, name, kind, parent_id, naic_group_code, notes) VALUES
  ('aetna',              'Aetna',                                'carrier', 'cvs-health',          '1',    'Aetna Life 60054 + Aetna Health Inc 95234 + AHIC-NY 84450'),
  ('anthem-empire',      'Anthem Blue Cross Blue Shield (Empire)','carrier','elevance',            '671',  'Empire BCBS NY; DFS entities renamed Anthem HealthChoice'),
  ('uhc',                'UnitedHealthcare',                     'carrier', 'uhg',                 '707',  NULL),
  ('oxford',             'Oxford Health',                        'carrier', 'uhg',                 '707',  'UHG''s NY commercial brand; no public FHIR directory'),
  ('cigna',              'Cigna',                                'carrier', 'cigna-group',         '901',  'CIGNA Health and Life 67369, NY-licensed as a life insurer'),
  ('emblemhealth',       'EmblemHealth',                         'carrier', NULL,                  '1127', 'HIP Insurance Group: EmblemHealth Plan + Insurance Co + HIP HMO'),
  ('metroplus',          'MetroPlus Health Plan',                'carrier', NULL,                  NULL,   'NYC Health + Hospitals subsidiary'),
  ('healthfirst',        'Healthfirst',                          'carrier', NULL,                  '4778', NULL),
  ('fidelis',            'Fidelis Care',                         'carrier', 'centene',             '1295', 'DFS legal name: New York Quality Healthcare Corporation'),
  ('mvp',                'MVP Health Care',                      'carrier', NULL,                  '1198', NULL),
  ('cdphp',              'CDPHP',                                'carrier', NULL,                  '4708', 'Capital District Physicians Health Plan'),
  ('excellus',           'Excellus BlueCross BlueShield',        'carrier', 'lifetime-healthcare', '1186', NULL),
  ('univera',            'Univera Healthcare',                   'carrier', 'lifetime-healthcare', '1186', 'd/b/a of Excellus Health Plan, Inc. for Western NY'),
  ('independent-health', 'Independent Health',                   'carrier', NULL,                  NULL,   'Association 95308 + Benefits Corporation 47034'),
  ('highmark-ny',        'Highmark Blue Cross Blue Shield (NY)', 'carrier', 'highmark-health',     NULL,   'One DFS entity 55204 carries both the WNY and NENY brands'),
  ('humana',             'Humana',                               'carrier', NULL,                  '119',  NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Carriers: out-of-state labels the BCBS host-sharing spillover loaded ─────
INSERT INTO insurers (id, name, kind, parent_id, notes) VALUES
  ('anthem-ca',      'Anthem Blue Cross (California)',           'carrier', 'elevance', NULL),
  ('anthem-co',      'Anthem BCBS (Colorado)',                   'carrier', 'elevance', NULL),
  ('anthem-mo',      'Anthem BCBS (Missouri)',                   'carrier', 'elevance', NULL),
  ('bcbs-ma',        'Blue Cross Blue Shield of Massachusetts',  'carrier', NULL, NULL),
  ('bcbs-mn',        'Blue Cross and Blue Shield of Minnesota',  'carrier', NULL, NULL),
  ('bcbs-mi',        'Blue Cross Blue Shield of Michigan',       'carrier', NULL, NULL),
  ('bcbs-az',        'Blue Cross Blue Shield of Arizona',        'carrier', NULL, NULL),
  ('bcbs-tn',        'BlueCross BlueShield of Tennessee',        'carrier', NULL, NULL),
  ('bcbs-al',        'Blue Cross and Blue Shield of Alabama',    'carrier', NULL, NULL),
  ('bcbs-pr',        'BlueCross BlueShield of Puerto Rico',      'carrier', NULL, NULL),
  ('blue-shield-ca', 'Blue Shield of California',                'carrier', NULL, NULL),
  ('florida-blue',   'Florida Blue',                             'carrier', NULL, 'GuideWell'),
  ('carefirst',      'CareFirst BlueCross BlueShield',           'carrier', NULL, NULL),
  ('regence-wa',     'Regence BlueShield (Washington)',          'carrier', NULL, 'Cambia Health Solutions'),
  ('regence-or',     'Regence BCBS of Oregon',                   'carrier', NULL, 'Cambia Health Solutions'),
  ('regence-id',     'Regence BlueShield of Idaho',              'carrier', NULL, 'Cambia Health Solutions'),
  ('lacare',         'L.A. Care Health Plan',                    'carrier', NULL, 'CA Medicaid plan (harvest source only)'),
  ('molina',         'Molina Healthcare',                        'carrier', NULL, 'Harvest source only')
ON CONFLICT (id) DO NOTHING;

-- ── Administrators (never the payer of record; named by sql/044 networks) ────
INSERT INTO insurers (id, name, kind, parent_id, notes) VALUES
  ('carelon',   'Carelon Behavioral Health',  'administrator', 'elevance',    'ex-Beacon; runs Emblem + MetroPlus behavioral files'),
  ('optum',     'Optum Behavioral Health',    'administrator', 'uhg',         'OHBS; runs UHC/Oxford behavioral networks'),
  ('evernorth', 'Evernorth Behavioral Health','administrator', 'cigna-group', 'ex-Cigna Behavioral; EBH networks'),
  ('magnacare', 'MagnaCare',                  'administrator', NULL,          'Rental network administrator (MVP behavioral rides it)')
ON CONFLICT (id) DO NOTHING;

-- ── Aliases: provider_rate_signals.payer (all 33 live labels, 2026-07-18) ────
INSERT INTO insurer_aliases (source, label, insurer_id) VALUES
  ('mrf', 'Aetna (Healthfirst TPA)',                             'aetna'),
  ('mrf', 'Aetna Life Insurance Company',                        'aetna'),
  ('mrf', 'Anthem (Empire BCBS NY)',                             'anthem-empire'),
  ('mrf', 'Empire BlueCross BlueShield',                         'anthem-empire'),
  ('mrf', 'UnitedHealthcare Insurance Company of New York',      'uhc'),
  ('mrf', 'Oxford Health Insurance Inc',                         'oxford'),
  ('mrf', 'Oxford Health Plans (CT) Inc',                        'oxford'),
  ('mrf', 'Cigna Health & Life',                                 'cigna'),
  ('mrf', 'EmblemHealth (Carelon behavioral)',                   'emblemhealth'),
  ('mrf', 'MetroPlus Health Plan',                               'metroplus'),
  ('mrf', 'Fidelis Care (Centene)',                              'fidelis'),
  ('mrf', 'MVP Health Care',                                     'mvp'),
  ('mrf', 'CDPHP',                                               'cdphp'),
  ('mrf', 'Excellus BlueCross BlueShield',                       'excellus'),
  ('mrf', 'Highmark Blue Cross Blue Shield of Western New York', 'highmark-ny'),
  ('mrf', 'Highmark BCBS of Western New York',                   'highmark-ny'),
  ('mrf', 'Highmark Blue Shield of Northeastern New York',       'highmark-ny'),
  ('mrf', 'Anthem Blue Cross California',                        'anthem-ca'),
  ('mrf', 'Anthem Blue Cross and Blue Shield Colorado',          'anthem-co'),
  ('mrf', 'Anthem Blue Cross and Blue Shield Missouri',          'anthem-mo'),
  ('mrf', 'Blue Cross Blue Shield of Massachusetts',             'bcbs-ma'),
  ('mrf', 'Blue Cross and Blue Shield of Minnesota',             'bcbs-mn'),
  ('mrf', 'Blue Cross Blue Shield of Michigan',                  'bcbs-mi'),
  ('mrf', 'Blue Cross Blue Shield Of Arizona',                   'bcbs-az'),
  ('mrf', 'BlueCross BlueShield of Tennessee',                   'bcbs-tn'),
  ('mrf', 'Blue Cross and Blue Shield of Alabama',               'bcbs-al'),
  ('mrf', 'BlueCross BlueShield of Puerto Rico',                 'bcbs-pr'),
  ('mrf', 'Blue Shield of California',                           'blue-shield-ca'),
  ('mrf', 'Florida Blue',                                        'florida-blue'),
  ('mrf', 'CareFirst BlueCross BlueShield',                      'carefirst'),
  ('mrf', 'Regence BlueShield of Washington',                    'regence-wa'),
  ('mrf', 'Regence BlueCross BlueShield of Oregon',              'regence-or'),
  ('mrf', 'Regence BlueShield of Idaho',                         'regence-id'),
  -- Pre-seeded for the 2026-07-18 IHNY load (label minted by data-agent):
  ('mrf', 'Independent Health',                                  'independent-health')
ON CONFLICT (source, label) DO NOTHING;

-- ── Aliases: payer_sources.slug (all 12) ─────────────────────────────────────
INSERT INTO insurer_aliases (source, label, insurer_id) VALUES
  ('source', 'aetna_commercial', 'aetna'),
  ('source', 'aetna_medicaid',   'aetna'),
  ('source', 'anthem',           'anthem-empire'),
  ('source', 'elevance',         'anthem-empire'),
  ('source', 'carefirst',        'carefirst'),
  ('source', 'cigna',            'cigna'),
  ('source', 'healthfirst',      'healthfirst'),
  ('source', 'humana',           'humana'),
  ('source', 'lacare',           'lacare'),
  ('source', 'molina',           'molina'),
  ('source', 'mvp',              'mvp'),
  ('source', 'uhc',              'uhc')
ON CONFLICT (source, label) DO NOTHING;

-- ── Aliases: billing payers.name ─────────────────────────────────────────────
INSERT INTO insurer_aliases (source, label, insurer_id) VALUES
  ('billing', 'Aetna',            'aetna'),
  ('billing', 'Cigna',            'cigna'),
  ('billing', 'UnitedHealthcare', 'uhc')
ON CONFLICT (source, label) DO NOTHING;

-- ── Aliases: NAIC company codes (verified against loaded dfs_insurers) ───────
INSERT INTO insurer_aliases (source, label, insurer_id) VALUES
  ('naic', '60054', 'aetna'),        -- Aetna Life Insurance Company
  ('naic', '95234', 'aetna'),        -- Aetna Health Inc
  ('naic', '84450', 'aetna'),        -- Aetna Health Insurance Company of New York
  ('naic', '14408', 'aetna'),        -- Aetna Better Health (MLT)
  ('naic', '55093', 'anthem-empire'),-- Anthem HealthChoice Assurance
  ('naic', '95433', 'anthem-empire'),-- Anthem HealthChoice HMO
  ('naic', '16574', 'anthem-empire'),-- Anthem HP, LLC
  ('naic', '28207', 'anthem-empire'),-- Anthem Insurance Companies
  ('naic', '60093', 'uhc'),          -- UnitedHealthcare Insurance Company of New York
  ('naic', '95085', 'uhc'),          -- UnitedHealthcare of New York
  ('naic', '79413', 'uhc'),          -- UnitedHealthcare Insurance Company (national; top form5500 carrier)
  ('naic', '78026', 'oxford'),       -- Oxford Health Insurance, Inc.
  ('naic', '95479', 'oxford'),       -- Oxford Health Plans (NY), Inc.
  ('naic', '67369', 'cigna'),        -- CIGNA Health and Life Insurance Company
  ('naic', '60094', 'emblemhealth'), -- EmblemHealth Insurance Company
  ('naic', '55239', 'emblemhealth'), -- EmblemHealth Plan, Inc.
  ('naic', 'X0172', 'emblemhealth'), -- HIP Health Maintenance Organization (DFS pseudo-code)
  ('naic', '95546', 'metroplus'),    -- MetroPlus Health Plan, Inc.
  ('naic', '95284', 'healthfirst'),  -- Healthfirst Health Plan, Inc.
  ('naic', '16031', 'healthfirst'),  -- Healthfirst Insurance Company, Inc.
  ('naic', '15071', 'healthfirst'),  -- HealthFirst PHSP, Inc.
  ('naic', '16352', 'fidelis'),      -- New York Quality Healthcare Corporation
  ('naic', '11125', 'mvp'),          -- MVP Health Insurance Company
  ('naic', '95521', 'mvp'),          -- MVP Health Plan, Inc.
  ('naic', '47062', 'mvp'),          -- MVP Health Services Corp.
  ('naic', '95491', 'cdphp'),        -- Capital District Physicians Health Plan
  ('naic', '55107', 'excellus'),     -- Excellus Health Plan, Inc. (MHL license)
  ('naic', 'X4289', 'excellus'),     -- Excellus Health Plan, Inc. (HMO license, DFS pseudo-code)
  ('naic', '17312', 'excellus'),     -- Excellus Health Plan Community Care LLC
  ('naic', '95308', 'independent-health'), -- Independent Health Association
  ('naic', '47034', 'independent-health'), -- Independent Health Benefits Corporation
  ('naic', '55204', 'highmark-ny'),  -- Highmark Western and Northeastern New York Inc.
  ('naic', '13558', 'humana'),       -- Humana Health Company of New York
  ('naic', '12634', 'humana'),       -- Humana Insurance Company of New York
  ('naic', '15799', 'molina')        -- Molina Healthcare of New York (PHS; harvest source slug)
ON CONFLICT (source, label) DO NOTHING;

-- ── Aliases: NAIC group codes (ownership fallback for unmapped companies) ────
INSERT INTO insurer_aliases (source, label, insurer_id) VALUES
  ('naic-group', '1',    'cvs-health'),
  ('naic-group', '671',  'elevance'),
  ('naic-group', '707',  'uhg'),
  ('naic-group', '901',  'cigna-group'),
  ('naic-group', '1295', 'centene'),
  ('naic-group', '1186', 'lifetime-healthcare'),
  ('naic-group', '1127', 'emblemhealth'),
  ('naic-group', '4778', 'healthfirst'),
  ('naic-group', '119',  'humana'),
  ('naic-group', '1198', 'mvp'),
  ('naic-group', '4708', 'cdphp')
ON CONFLICT (source, label) DO NOTHING;

-- ── Tripwire: labels in live vocabularies with no canonical mapping ──────────
-- Cheap on purpose: the mrf leg reads payer_rate_totals (the sql/026 matview),
-- never the 13M-row signals table.
CREATE OR REPLACE VIEW insurer_unmapped_labels AS
SELECT 'mrf'::text AS source, prt.payer AS label, prt.rows AS weight
FROM payer_rate_totals prt
WHERE NOT EXISTS (SELECT 1 FROM insurer_aliases a WHERE a.source = 'mrf' AND a.label = prt.payer)
UNION ALL
SELECT 'source', ps.slug, NULL
FROM payer_sources ps
WHERE NOT EXISTS (SELECT 1 FROM insurer_aliases a WHERE a.source = 'source' AND a.label = ps.slug)
UNION ALL
SELECT 'billing', p.name, NULL
FROM payers p
WHERE NOT EXISTS (SELECT 1 FROM insurer_aliases a WHERE a.source = 'billing' AND a.label = p.name)
UNION ALL
SELECT 'naic', d.naic, NULL
FROM dfs_insurers d
WHERE d.naic IS NOT NULL
  AND d.org_type <> 'LF'  -- life insurers resolve via group or stay unmapped by design
  AND NOT EXISTS (SELECT 1 FROM insurer_aliases a WHERE a.source = 'naic' AND a.label = d.naic)
  AND NOT EXISTS (SELECT 1 FROM insurer_aliases a WHERE a.source = 'naic-group' AND a.label = d.group_code);

COMMENT ON TABLE insurers IS 'Canonical insurer entity (NYS-48): one row per carrier brand, parent ownership as self-reference. kind = group | carrier | administrator.';
COMMENT ON TABLE insurer_aliases IS 'The label crosswalk: (vocabulary, exact label) → canonical insurer. Vocabularies: mrf (provider_rate_signals.payer), source (payer_sources.slug), billing (payers.name), naic (company code, also joins form5500_schedule_a.carrier_naic), naic-group (ownership fallback).';
COMMENT ON VIEW insurer_unmapped_labels IS 'Tripwire: live labels with no canonical mapping. New payer labels appear here until mapped; empty = full resolution.';
