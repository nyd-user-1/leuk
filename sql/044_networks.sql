-- Leuk — 044: the canonical NETWORK entity (NYS-49).
--
-- Both federal disclosures assert the same fact — a provider's membership in
-- an insurance network — in different vocabularies: the payer FHIR directory
-- says (payer "cigna", network "EVERNORTH BEHAVIORAL HEALTH"); the TiC MRF
-- says (payer "Cigna Health & Life", network "Cigna localplus-with-ebh-plus-
-- pathwell"). Nothing joined. This is the join key.
--
--   networks         one row per canonical network/product, keyed to the
--                    sql/043 insurer (payer of record) with an optional
--                    administrator (Carelon/Optum/Evernorth/MagnaCare — the
--                    behavioral or rental administrator the label names).
--                    kind: 'network' = a provider panel proper;
--                          'product' = a plan product whose MRF label stands
--                          in for the panel its members ride.
--   network_aliases  (vocabulary, payer label, network label) → network.
--                    fhir rows key payer by payer_sources.slug and network by
--                    payer_networks.network_name; mrf rows key payer by
--                    provider_rate_signals.payer and network by
--                    plan_or_network. Labels are EXACT strings — we never
--                    fuzzy-match a contract claim.
--
-- THE RULE (Brendan, 2026-07-13): a mapping enters only when proven; unmapped
-- labels stay separate downstream — that is correct behavior, not a gap. The
-- network_unmapped_labels view is the worklist, weighted so the labels that
-- matter float to the top.
--
-- Seeds below are the hand-proven NY-behavioral book as measured 2026-07-18:
-- every live NY MRF (payer, plan_or_network) pair that names a knowable
-- network/product, plus the five FHIR labels whose identity is provable
-- today. Deliberately UNMAPPED: Anthem's 539 remaining FHIR networks,
-- UHC/Humana's national directory noise, Empire's internal network codes
-- ("Empire 051_06E0"), Highmark's "WNY 2026-06_361_50J0" codes, out-of-state
-- BCBS spillover, and per-employer plan stamps — none has a proven canonical
-- identity yet.

CREATE TABLE IF NOT EXISTS networks (
  id               TEXT PRIMARY KEY,        -- stable slug, e.g. 'evernorth-behavioral'
  insurer_id       TEXT NOT NULL REFERENCES insurers(id),  -- payer of record
  administrator_id TEXT REFERENCES insurers(id),           -- behavioral/rental admin, if the label names one
  name             TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('network','product')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_networks_insurer ON networks (insurer_id);

CREATE TABLE IF NOT EXISTS network_aliases (
  source        TEXT NOT NULL CHECK (source IN ('fhir','mrf')),
  payer_label   TEXT NOT NULL,   -- fhir: payer_sources.slug · mrf: provider_rate_signals.payer
  network_label TEXT NOT NULL,   -- fhir: payer_networks.network_name · mrf: plan_or_network
  network_id    TEXT NOT NULL REFERENCES networks(id),
  PRIMARY KEY (source, payer_label, network_label)
);
CREATE INDEX IF NOT EXISTS idx_network_aliases_network ON network_aliases (network_id);

-- ── Canonical networks ───────────────────────────────────────────────────────
INSERT INTO networks (id, insurer_id, administrator_id, name, kind, notes) VALUES
  -- Behavioral panels (the carve-ins/carve-outs the NY book actually rides)
  ('evernorth-behavioral', 'cigna',        'evernorth', 'Evernorth Behavioral Health (EBH)',      'network', 'Cigna''s behavioral panel; MRF exposes it inside the LocalPlus-with-EBH product'),
  ('optum-behavioral',     'uhc',          'optum',     'Optum Behavioral Health (OHBS)',         'network', 'UHG-wide behavioral panel: Oxford''s OHBS file + UHC''s Behavior Health P3 table are both Optum'),
  ('emblem-behavioral',    'emblemhealth', 'carelon',   'EmblemHealth Behavioral (Carelon)',      'network', 'ex-Beacon; the EmblemHealth Commercial (Beacon) MRF'),
  ('empire-mental-health', 'anthem-empire', NULL,       'Empire NY Mental Health Network',        'network', 'Anthem FHIR directory network; MRF-side identity unproven'),
  ('mvp-magnacare',        'mvp',          'magnacare', 'MVP behavioral via MagnaCare',           'network', 'Rental network'),
  ('cdphp-commercial',     'cdphp',        NULL,        'CDPHP commercial panel',                 'network', 'Three MRF product labels (HMO / CDPHN / UBI self-funded) publish identical row sets — one panel'),
  ('excellus-commercial',  'excellus',     NULL,        'Excellus commercial',                    'network', 'Thin side-door book (11 NPIs); full egress book sized, unminted'),
  ('empire-ppo-epo',       'anthem-empire', NULL,       'Empire PPO/EPO provider network',        'network', NULL),
  ('uhc-choice-plus',      'uhc',          NULL,        'UnitedHealthcare Choice Plus',           'network', 'National UHC network; our rows ride the Oxford CT entity file'),
  -- Oxford products/networks
  ('oxford-core',          'oxford', NULL, 'Oxford Core',            'network', NULL),
  ('oxford-freedom',       'oxford', NULL, 'Oxford Freedom',         'network', NULL),
  ('oxford-liberty',       'oxford', NULL, 'Oxford Liberty',         'network', NULL),
  ('oxford-metro',         'oxford', NULL, 'Oxford Metro',           'network', NULL),
  -- Cigna products
  ('cigna-oap',            'cigna', NULL, 'Cigna Open Access Plus (OAP)',   'product', 'National OAP product file'),
  ('cigna-metro-ny-gppo',  'cigna', NULL, 'Cigna Metro New York GPPO',      'product', NULL),
  ('cigna-chc-ny-njpcp',   'cigna', NULL, 'Cigna CHC of New York (NJ PCP)', 'product', NULL),
  -- Aetna products (medical products whose files carry the behavioral book)
  ('aetna-choice-pos-ii',          'aetna', NULL, 'Aetna Choice POS II',        'product', 'Also the network under the HF Management Services ASO stamps (Aetna- and AHF-Choice-POS-II)'),
  ('aetna-select',                 'aetna', NULL, 'Aetna Select',               'product', NULL),
  ('aetna-open-access-select',     'aetna', NULL, 'Open Access Aetna Select',   'product', NULL),
  ('aetna-open-access-elect-choice','aetna', NULL, 'Open Access Elect Choice',  'product', NULL),
  ('aetna-managed-choice-pos',     'aetna', NULL, 'Managed Choice POS',         'product', NULL),
  ('aetna-qpos',                   'aetna', NULL, 'QPOS',                       'product', NULL),
  ('aetna-open-pos-ii',            'aetna', NULL, 'Open POS II',                'product', NULL),
  ('aetna-open-access-epo-plus',   'aetna', NULL, 'Open Access EPO Plus',       'product', NULL),
  ('aetna-open-choice',            'aetna', NULL, 'Open Choice',                'product', NULL),
  ('aetna-open-epo-plus',          'aetna', NULL, 'Open EPO Plus',              'product', NULL),
  -- MVP
  ('mvp-epo-ppo',          'mvp', NULL, 'MVP EPO / PPO',          'product', 'FHIR directory product label'),
  -- MetroPlus products (rates arrive via Carelon behavioral files)
  ('metroplus-qhp',        'metroplus', 'carelon', 'MetroPlus QHP (Exchange)', 'product', NULL),
  ('metroplus-goldcare',   'metroplus', 'carelon', 'MetroPlus GoldCare',       'product', NULL),
  ('metroplus-ffs',        'metroplus', 'carelon', 'MetroPlus FFS',            'product', 'Chargemaster-shaped; the known rollup caveat'),
  -- Fidelis products
  ('fidelis-exchange',     'fidelis', NULL, 'Fidelis Exchange',  'product', 'The TiC-covered commercial line'),
  ('fidelis-essential',    'fidelis', NULL, 'Fidelis Essential', 'product', NULL),
  -- Highmark NY brand products
  ('highmark-wny-ppo',         'highmark-ny', NULL, 'Highmark BCBS WNY — PPO',          'product', NULL),
  ('highmark-wny-hmo',         'highmark-ny', NULL, 'Highmark BCBS WNY — HMO',          'product', NULL),
  ('highmark-wny-traditional', 'highmark-ny', NULL, 'Highmark BCBS WNY — Traditional',  'product', NULL),
  ('highmark-neny-ppo',        'highmark-ny', NULL, 'Highmark BS NENY — PPO',           'product', NULL),
  ('highmark-neny-traditional','highmark-ny', NULL, 'Highmark BS NENY — Traditional',   'product', NULL),
  -- Independent Health (loaded 2026-07-18 from the cracked IHNY egress)
  ('ih-hmo',        'independent-health', NULL, 'Independent Health Association — HMO',          'product', NULL),
  ('ih-epo',        'independent-health', NULL, 'Independent Health Benefits Corp — EPO',        'product', NULL),
  ('ih-pos-ppo',    'independent-health', NULL, 'Independent Health Benefits Corp — POS/PPO',    'product', NULL),
  ('ih-self-funded','independent-health', NULL, 'Independent Health — Self-Funded (IHSFS)',      'product', NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Aliases: MRF vocabulary (payer_label = provider_rate_signals.payer) ──────
INSERT INTO network_aliases (source, payer_label, network_label, network_id) VALUES
  ('mrf', 'Cigna Health & Life', 'Cigna localplus-with-ebh-plus-pathwell', 'evernorth-behavioral'),
  ('mrf', 'Cigna Health & Life', 'Cigna national-oap',                     'cigna-oap'),
  ('mrf', 'Cigna Health & Life', 'Cigna metro-new-york-gppo',              'cigna-metro-ny-gppo'),
  ('mrf', 'Cigna Health & Life', 'Cigna chc-of-new-york-njpcp',            'cigna-chc-ny-njpcp'),
  ('mrf', 'Oxford Health Insurance Inc', 'Optum Behavioral (OHBS)', 'optum-behavioral'),
  ('mrf', 'UnitedHealthcare Insurance Company of New York', 'Behavior Health P3', 'optum-behavioral'),
  ('mrf', 'Oxford Health Insurance Inc', 'Core',            'oxford-core'),
  ('mrf', 'Oxford Health Insurance Inc', 'Freedom Network', 'oxford-freedom'),
  ('mrf', 'Oxford Health Insurance Inc', 'Liberty Network', 'oxford-liberty'),
  ('mrf', 'Oxford Health Insurance Inc', 'Metro Network',   'oxford-metro'),
  ('mrf', 'Oxford Health Plans (CT) Inc', 'Choice Plus',    'uhc-choice-plus'),
  ('mrf', 'EmblemHealth (Carelon behavioral)', 'EmblemHealth Commercial (Beacon)', 'emblem-behavioral'),
  ('mrf', 'MVP Health Care', 'MVP via MagnaCare network', 'mvp-magnacare'),
  ('mrf', 'CDPHP', 'CDPHP (HMO)',            'cdphp-commercial'),
  ('mrf', 'CDPHP', 'CDPHN (network)',        'cdphp-commercial'),
  ('mrf', 'CDPHP', 'CDPHP UBI (self-funded)','cdphp-commercial'),
  ('mrf', 'Excellus BlueCross BlueShield', 'Excellus Commercial', 'excellus-commercial'),
  ('mrf', 'Empire BlueCross BlueShield', 'PPO EPO PROVIDER', 'empire-ppo-epo'),
  ('mrf', 'MetroPlus Health Plan', 'QHP Exchange',  'metroplus-qhp'),
  ('mrf', 'MetroPlus Health Plan', 'Gold GoldCare', 'metroplus-goldcare'),
  ('mrf', 'MetroPlus Health Plan', 'MetroPlus FFS', 'metroplus-ffs'),
  ('mrf', 'Fidelis Care (Centene)', 'Fidelis Exchange',  'fidelis-exchange'),
  ('mrf', 'Fidelis Care (Centene)', 'Fidelis Essential', 'fidelis-essential'),
  ('mrf', 'Aetna Life Insurance Company', 'Aetna Choice POS II',      'aetna-choice-pos-ii'),
  ('mrf', 'Aetna Life Insurance Company', 'Aetna Select',             'aetna-select'),
  ('mrf', 'Aetna Life Insurance Company', 'Open Access Aetna Select', 'aetna-open-access-select'),
  ('mrf', 'Aetna Life Insurance Company', 'Open Access Elect Choice', 'aetna-open-access-elect-choice'),
  ('mrf', 'Aetna Life Insurance Company', 'Managed Choice POS',       'aetna-managed-choice-pos'),
  ('mrf', 'Aetna Life Insurance Company', 'QPOS',                     'aetna-qpos'),
  ('mrf', 'Aetna Life Insurance Company', 'Open POS II',              'aetna-open-pos-ii'),
  ('mrf', 'Aetna Life Insurance Company', 'Open Access EPO Plus',     'aetna-open-access-epo-plus'),
  ('mrf', 'Aetna Life Insurance Company', 'Open Choice',              'aetna-open-choice'),
  ('mrf', 'Aetna Life Insurance Company', 'Open EPO Plus',            'aetna-open-epo-plus'),
  ('mrf', 'Aetna (Healthfirst TPA)', 'HF HF-MANAGEMENT-SERVICES-LLC-Aetna-Choice-POS-II', 'aetna-choice-pos-ii'),
  ('mrf', 'Aetna (Healthfirst TPA)', 'HF HF-MANAGEMENT-SERVICES-LLC-AHF-Choice-POS-II',   'aetna-choice-pos-ii'),
  ('mrf', 'Highmark Blue Cross Blue Shield of Western New York', 'HighMark BlueCross BlueShield of Western New York-PPO',              'highmark-wny-ppo'),
  ('mrf', 'Highmark Blue Cross Blue Shield of Western New York', 'Highmark Blue Cross Blue Shield of Western New York – HMO',          'highmark-wny-hmo'),
  ('mrf', 'Highmark Blue Cross Blue Shield of Western New York', 'Highmark Blue Cross Blue Shield of Western New York-Traditional',    'highmark-wny-traditional'),
  ('mrf', 'Highmark Blue Shield of Northeastern New York', 'Highmark Blue Shield of Northeastern New York - PPO',       'highmark-neny-ppo'),
  ('mrf', 'Highmark Blue Shield of Northeastern New York', 'Highmark Blue Shield of Northeastern New York Traditional', 'highmark-neny-traditional'),
  -- Pre-seeded for the 2026-07-18 loads (labels minted by data-agent):
  ('mrf', 'Independent Health', 'IHA HMO',                'ih-hmo'),
  ('mrf', 'Independent Health', 'IHBC EPO',               'ih-epo'),
  ('mrf', 'Independent Health', 'IHBC POS-PPO',           'ih-pos-ppo'),
  ('mrf', 'Independent Health', 'IH Self-Funded (IHSFS)', 'ih-self-funded'),
  ('mrf', 'EmblemHealth (Carelon behavioral)', 'EmblemHealth Commercial (Beacon EHPI)', 'emblem-behavioral')
ON CONFLICT (source, payer_label, network_label) DO NOTHING;

-- ── Aliases: FHIR vocabulary (payer_label = payer_sources.slug) ──────────────
INSERT INTO network_aliases (source, payer_label, network_label, network_id) VALUES
  ('fhir', 'cigna',  'EVERNORTH BEHAVIORAL HEALTH',             'evernorth-behavioral'),
  ('fhir', 'cigna',  'EBH NATIONAL STANDALONE NETFLEX NETWORK', 'evernorth-behavioral'),
  ('fhir', 'anthem', 'NY Mental Health Network',                'empire-mental-health'),
  ('fhir', 'mvp',    'MVP EPO / PPO',                           'mvp-epo-ppo')
ON CONFLICT (source, payer_label, network_label) DO NOTHING;

-- ── Worklist: live labels with no canonical identity, weighted ───────────────
-- The mrf leg groups the 13M-row signals table — run it when curating, not in
-- request paths (payer_rate_totals has no per-network split, so there is no
-- cheap precomputed source for this leg yet).
CREATE OR REPLACE VIEW network_unmapped_labels AS
SELECT 'fhir'::text AS source, ps.slug AS payer_label, pn.network_name AS network_label,
       count(pnp.id) AS weight
FROM payer_networks pn
JOIN payer_sources ps ON ps.id = pn.payer_source_id
LEFT JOIN provider_network_participation pnp ON pnp.network_id = pn.id
WHERE NOT EXISTS (
  SELECT 1 FROM network_aliases a
  WHERE a.source = 'fhir' AND a.payer_label = ps.slug AND a.network_label = pn.network_name)
GROUP BY ps.slug, pn.network_name
UNION ALL
SELECT 'mrf', s.payer, s.plan_or_network, count(*)
FROM provider_rate_signals s
WHERE NOT EXISTS (
  SELECT 1 FROM network_aliases a
  WHERE a.source = 'mrf' AND a.payer_label = s.payer AND a.network_label = s.plan_or_network)
GROUP BY s.payer, s.plan_or_network;

COMMENT ON TABLE networks IS 'Canonical network entity (NYS-49): one row per provider network or rate-bearing product, keyed to the sql/043 insurer; administrator_id names the behavioral/rental admin when the label carries one.';
COMMENT ON TABLE network_aliases IS 'The per-source label crosswalk: (fhir|mrf, exact payer label, exact network label) → canonical network. A mapping enters only when proven; unmapped labels stay separate downstream by design.';
COMMENT ON VIEW network_unmapped_labels IS 'Curation worklist: live (payer, network) labels with no canonical mapping, weighted by row count. The mrf leg scans provider_rate_signals — curation-time only.';
