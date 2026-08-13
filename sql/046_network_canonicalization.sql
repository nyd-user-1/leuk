-- Leuk — 046: finish the network canonicalization (NYS-144).
--
-- sql/044 seeded the hand-proven NY book (41 canonicals) but left 1,092 of the
-- 1,133 raw FHIR networks untouched — "41" read as if NY had 41 networks. The
-- measured truth (2026-07-18): the five FHIR sources are NATIONAL feeds. The
-- Elevance API serves every Anthem licensee (CT BlueCare, CA BCC, CO/GA/NV/ME/
-- NH/VA/OH… + other-Blues BlueCard PAR rosters), Cigna serves per-state
-- product instances + client-specific networks (CSN), UHC/Humana are
-- Medicare/Medicaid-dominated. Exact-roster identity collapses only 1,133→951,
-- so wholesale merging is NOT justified (the NYS-69 shared-roster suspicion
-- holds only for tiny plan-level stamps).
--
-- The finish therefore has two parts:
--   1. ALIAS every NY-market label to a canonical network (below — this file
--      adds the second wave of canonicals + aliases, all name-evidence-proven).
--   2. DISPOSITION every raw network into a scope bucket via
--      payer_network_map, so "unmapped" is never ambiguous again:
--        ny-commercial       our market; has a canonical network row
--        national-commercial single-licensee national product/panel networks
--                            (UHC products, EBH national, EAP) — canonical
--                            where aliased, else honest NULL
--        oos-commercial      other states' commercial networks (incl. other-
--                            Blues PAR rosters served through the Elevance API)
--        medicare            Medicare Advantage / SNP / PFFS / supplement
--        ny-government       NY Medicaid / Essential / CHP / HARP / MLTC / FIDA
--        oos-government      other states' Medicaid / CHIP programs
--        employer-custom     client- or health-system-specific networks (CSN,
--                            named employers, custom tiers)
--        ancillary           dental / vision / chiro / EAP-adjacent vendors
--        unclassified        state-ambiguous bare labels (Pathway family,
--                            "PPO", "Traditional") — honestly unresolved
--      First matching rule wins; rule name is stored for audit.
--
-- Merges that ARE made, and why (founder's own decomposition, NYS-48/144):
--   * "…LOCALPLUS PATHWELL" folds into the LocalPlus network — Pathwell is a
--     utilization PROGRAM, not a network.
--   * "NY Blue Access - PCP-Required" folds into NY Blue Access — gatekeeping
--     is plan design on the same provider network (rosters differ 0.17%).
--   * The Cigna×MVP alliance labels (OAP/PPO × plain/Pathwell) fold into one
--     alliance network (insurer mvp, administered via cigna).
-- NOT merged: per-state EBH instances (distinct state panels), CHC-of-NY OAP
-- vs NJPCP (distinct products), UHC's national products (each keeps its name).

-- ── New insurers this wave ───────────────────────────────────────────────────
INSERT INTO insurers (id, name, kind, parent_id, notes) VALUES
  ('oscar',     'Oscar Health',      'carrier',       NULL, 'NY insurer (Mulberry Health group); network access via UHC alliance in our FHIR data'),
  ('multiplan', 'MultiPlan (PHCS)',  'administrator', NULL, 'Rental network; Cigna uses PHCS upstate')
ON CONFLICT (id) DO NOTHING;
INSERT INTO insurer_aliases (source, label, insurer_id) VALUES
  ('naic', '16597', 'oscar'),  -- Oscar Health Plan of New York (HMO)
  ('naic', '15281', 'oscar')   -- Oscar Insurance Corporation (AH)
ON CONFLICT (source, label) DO NOTHING;

-- ── Second-wave canonical networks (name-evidence from the live label set) ───
INSERT INTO networks (id, insurer_id, administrator_id, name, kind, notes) VALUES
  -- Empire NY commercial (the anthem source's NY-prefixed/NY-known labels)
  ('empire-ppo-deluxe',      'anthem-empire', NULL, 'Empire NY PPO Deluxe',                'network', NULL),
  ('empire-hmo',             'anthem-empire', NULL, 'Empire NY HMO',                       'network', NULL),
  ('empire-pos',             'anthem-empire', NULL, 'Empire NY POS',                       'network', NULL),
  ('empire-ipn',             'anthem-empire', NULL, 'Empire NY IPN',                       'network', NULL),
  ('empire-blue-access',     'anthem-empire', NULL, 'Empire NY Blue Access',               'network', 'PCP-Required label folds in: same network, gatekeeping is plan design'),
  ('empire-connection-epo',  'anthem-empire', NULL, 'Empire NY Connection EPO',            'network', NULL),
  ('empire-blue-hpn-ny',     'anthem-empire', NULL, 'Empire Blue High Performance (NY)',   'network', NULL),
  ('empire-ny-individual',   'anthem-empire', NULL, 'Empire NY Individual (exchange)',     'network', NULL),
  -- NY networks of OTHER insurers, attested through the Elevance BlueCard feed
  ('highmark-wny-par',       'highmark-ny',   NULL, 'Highmark BCBS WNY — PAR providers',   'network', 'Roster served via the Elevance API (BlueCard host data)'),
  ('highmark-hpn-buffalo',   'highmark-ny',   NULL, 'Highmark High Performance (Buffalo)', 'network', 'Same provenance'),
  ('excellus-rochester-par', 'excellus',      NULL, 'Excellus (Rochester) — PAR providers','network', 'Same provenance; BCBS Rochester = Excellus region'),
  ('excellus-ppo-exchange',  'excellus',      NULL, 'Excellus PPO Exchange',               'network', 'Same provenance'),
  -- Cigna NY commercial + panels
  ('cigna-chc-ny-oap',       'cigna', NULL,        'Cigna CHC of New York — OAP',          'product', 'Distinct from the NJPCP product (not merged)'),
  ('cigna-ny-ppo-ppa',       'cigna', NULL,        'Cigna New York PPO-PPA',               'network', NULL),
  ('cigna-ny-localplus',     'cigna', NULL,        'Cigna New York LocalPlus',             'network', 'Pathwell label folds in: utilization program, not a network'),
  ('cigna-upstate-phcs',     'cigna', 'multiplan', 'Cigna upstate NY via PHCS',            'network', 'WNY + CNY PPO-PPA/OAP rental rows'),
  ('evernorth-eap',          'cigna', 'evernorth', 'Evernorth EAP network',                'network', 'Distinct panel from EBH clinical'),
  ('mvp-cigna-alliance',     'mvp',   'cigna',     'MVP × Cigna alliance (OAP/PPO)',       'network', 'MVP large-group access to Cigna network; 4 labels fold in'),
  -- UHC national products + NY exchange
  ('uhc-select-plus',        'uhc', NULL,  'UnitedHealthcare Select Plus',    'network', 'National product network'),
  ('uhc-options-ppo',        'uhc', NULL,  'UnitedHealthcare Options PPO',    'network', 'National product network'),
  ('uhc-compass-ny',         'uhc', NULL,  'UHC Compass HMO (NY State of Health)', 'product', NULL),
  ('uhc-exchanges-ny',       'uhc', NULL,  'UHC Exchanges — NY',              'product', 'Not provably the same network as Compass; kept separate'),
  ('oscar-circle-plus-ny',   'oscar', 'uhc', 'Oscar Circle Plus (NY)',        'network', 'Oscar plan on UHC-administered network access'),
  -- Humana NY
  ('humana-northwell-centric','humana', NULL, 'Humana Northwell Centric Premier', 'network', 'NY commercial, Northwell-anchored'),
  -- MVP products
  ('mvp-hmo-pos',            'mvp', NULL, 'MVP HMO / POS',                    'product', NULL),
  ('mvp-healthy-ny',         'mvp', NULL, 'MVP Healthy New York',             'product', 'State small-group program (commercial)'),
  ('mvp-premier',            'mvp', NULL, 'MVP Premier / Premier Plus / Secure', 'product', NULL),
  ('mvp-harmonious',         'mvp', NULL, 'Harmonious Health Care Plan (MVPH)',  'product', NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Second-wave FHIR aliases (payer_label = payer_sources.slug) ──────────────
INSERT INTO network_aliases (source, payer_label, network_label, network_id) VALUES
  ('fhir', 'anthem', 'PPO DELUXE NETWORK',              'empire-ppo-deluxe'),
  ('fhir', 'anthem', 'HMO NETWORK',                     'empire-hmo'),
  ('fhir', 'anthem', 'POS NETWORK',                     'empire-pos'),
  ('fhir', 'anthem', 'IPN NETWORK',                     'empire-ipn'),
  ('fhir', 'anthem', 'NY Blue Access',                  'empire-blue-access'),
  ('fhir', 'anthem', 'NY Blue Access - PCP-Required',   'empire-blue-access'),
  ('fhir', 'anthem', 'NY Connection EPO - Gatekeeper',  'empire-connection-epo'),
  ('fhir', 'anthem', 'Blue High Performance - NY',      'empire-blue-hpn-ny'),
  ('fhir', 'anthem', 'NY Individual Network',           'empire-ny-individual'),
  ('fhir', 'anthem', 'Highmark BCBS Western NY PAR providers', 'highmark-wny-par'),
  ('fhir', 'anthem', 'Highmark High Performance - Buffalo',    'highmark-hpn-buffalo'),
  ('fhir', 'anthem', 'BCBS Rochester PAR providers',    'excellus-rochester-par'),
  ('fhir', 'anthem', 'Excellus PPO Exchange',           'excellus-ppo-exchange'),
  ('fhir', 'cigna', 'EBH EAP NETWORK',                  'evernorth-eap'),
  ('fhir', 'cigna', 'CHC OF NEW YORK OAP',              'cigna-chc-ny-oap'),
  ('fhir', 'cigna', 'NEW YORK PPO-PPA DIRECT',          'cigna-ny-ppo-ppa'),
  ('fhir', 'cigna', 'NEW YORK LOCAL PLUS DIRECT',       'cigna-ny-localplus'),
  ('fhir', 'cigna', 'NEW YORK LOCALPLUS PATHWELL',      'cigna-ny-localplus'),
  ('fhir', 'cigna', 'WESTERN NY PPO-PPA PHCS',          'cigna-upstate-phcs'),
  ('fhir', 'cigna', 'WESTERN NY OAP PHCS',              'cigna-upstate-phcs'),
  ('fhir', 'cigna', 'CENTRAL NY OAP PHCS',              'cigna-upstate-phcs'),
  ('fhir', 'cigna', 'CENTRAL NY PPO-PPA PHCS',          'cigna-upstate-phcs'),
  ('fhir', 'cigna', 'MVP HEALTH CARE OAP',              'mvp-cigna-alliance'),
  ('fhir', 'cigna', 'MVP HEALTH CARE PPO',              'mvp-cigna-alliance'),
  ('fhir', 'cigna', 'PATHWELL OAP MVP ALLIANCE',        'mvp-cigna-alliance'),
  ('fhir', 'cigna', 'PATHWELL PPO MVP ALLIANCE',        'mvp-cigna-alliance'),
  ('fhir', 'uhc', 'Choice Plus',                        'uhc-choice-plus'),
  ('fhir', 'uhc', 'Select Plus',                        'uhc-select-plus'),
  ('fhir', 'uhc', 'Options PPO',                        'uhc-options-ppo'),
  ('fhir', 'uhc', 'Compass HMO NY State of Health Marketplace', 'uhc-compass-ny'),
  ('fhir', 'uhc', 'UHC Exchanges - NY',                 'uhc-exchanges-ny'),
  ('fhir', 'uhc', 'Oscar Health Plan - Employee- Circle Plus NY (Circle Plus)', 'oscar-circle-plus-ny'),
  ('fhir', 'humana', 'Northwell Centric Premier',       'humana-northwell-centric'),
  ('fhir', 'mvp', 'MVP HMO / POS',                      'mvp-hmo-pos'),
  ('fhir', 'mvp', 'MVP Healthy New York',               'mvp-healthy-ny'),
  ('fhir', 'mvp', 'MVP Premier / Premier Plus / Secure','mvp-premier'),
  ('fhir', 'mvp', 'Harmonious Health Care Plan (MVPH)', 'mvp-harmonious')
ON CONFLICT (source, payer_label, network_label) DO NOTHING;

-- ── Disposition: every raw network, one scope, first rule wins ───────────────
CREATE TABLE IF NOT EXISTS payer_network_map (
  payer_network_id UUID PRIMARY KEY REFERENCES payer_networks(id) ON DELETE CASCADE,
  scope      TEXT NOT NULL CHECK (scope IN (
               'ny-commercial','national-commercial','oos-commercial','medicare',
               'ny-government','oos-government','employer-custom','ancillary','unclassified')),
  network_id TEXT REFERENCES networks(id),  -- canonical, when one exists
  rule       TEXT NOT NULL,                 -- which rule classified it (audit)
  mapped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rebuild is idempotent: wipe and re-derive (the rules ARE the state).
TRUNCATE payer_network_map;
INSERT INTO payer_network_map (payer_network_id, scope, network_id, rule)
SELECT pn.id,
  CASE
    WHEN a.network_id IS NOT NULL THEN
      CASE WHEN a.network_id IN ('evernorth-behavioral','evernorth-eap','uhc-choice-plus','uhc-select-plus','uhc-options-ppo')
           THEN 'national-commercial' ELSE 'ny-commercial' END
    WHEN pn.network_name ~* 'dental|vision|eyemed|healthplex|chiro|acupunct|dietician|hearing|\yASH\y'
      THEN 'ancillary'
    WHEN pn.network_name ~* '\yCSN\y|custom|kodak|\yNY44\y|\y1199\y|highland hospital|student health|32BJ|\yHHC\y|pepsico|twitter|disney|\yKKR\y|AT&T|wespath|mnfire|fidelity|stanford health|HCA Healthcare|IU Health|UofL|city of hope|leon mgmt|mazda|\yNYU\y|st francis|promedica|sutter|dignity|county of los angeles|motion picture|calpers|\yUC\y|ucfamily|bon secours|memorial hermann|\yduke\y|YNHHS|NGHS|piedmont|SLUH|BJC|baycare|volusia|summit health|villagemd|crossover|amdocs|adelante|\yNFL\y|jane st|tx childrens|st\. elizabeth|norton|freeman|trinity|UHHS|premier health|appalachian|northgate|univ'
      THEN 'employer-custom'
    WHEN pn.network_name ~* 'medicare|medi.?blue|\ySNP\y|advantage|\yAARP\y|caremore|gold plus|goldchoice|\yPFFS\y|honor|careplus|giveback|freedom blue|bluejourney|secure blue|\yEGWP\y|erickson|elderplan|\ydual\y|amerivantage|\yMA PPO\y'
      THEN 'medicare'
    WHEN pn.network_name ~* 'medicaid|essential plan|child health|\yCHP\y|\yHARP\y|\yMLTC\y|managed long|\yFIDA\y|wellness4me|healthplus|family health|kids|kidcare|coverkids|CHIP|peachcare|hoosier|\ySTAR\y|QUEST|turquoise|healthy michigan|healthy indiana|check-up|healthy kids|tenncare|LTSS|medi-cal|familycare|healthy horizons|community plan|FCS\y|CCC\+|clear health'
      THEN CASE WHEN pn.network_name ~* '\y(NY|New York|WNY)\y' THEN 'ny-government' ELSE 'oos-government' END
    WHEN pn.network_name ~* '\y(CT|CA|CO|GA|NV|ME|NH|VA|OH|IN|KY|MO|WI|TX|FL|NJ|MN|MA|AZ|TN|SC|MS|UT|PA|OR|WA|ID|AK|AR|LA|OK|HI|ND|SD|NE|KS|WV|DE|MT|WY|VT|NM|IL|IA|RI)\y|connecticut|california|colorado|georgia|nevada|maine|hampshire|virginia|\yohio\y|indiana|kentucky|missouri|wisconsin|texas|florida|jersey|minnesota|massachusett|arizona|tennessee|carolina|mississippi|\yutah\y|pennsylvania|oregon|washington|idaho|alaska|arkansas|louisiana|oklahoma|hawaii|dakota|nebraska|kansas|montana|wyoming|vermont|mexico|illinois|iowa|alabama|delaware|bluecare|century preferred|healthkeepers|prudent buyer|\yBCC\y|vivity|medica -|new england|horizon|capital blue|independence|triple s|regence|matthew thornton|PAR providers|PAR network|salt lake|orlando|tampa|dallas|houston|denver|chicago|\ySTL\y|st louis|louisville|midlands|allegiance|tufts|healthpartners|mdx|virgin islands|northern new england|mid-atlantic|midatlantic|southern'
      THEN 'oos-commercial'
    WHEN ps.slug IN ('uhc','humana') THEN 'national-commercial'
    ELSE 'unclassified'
  END,
  a.network_id,
  CASE
    WHEN a.network_id IS NOT NULL THEN 'alias'
    WHEN pn.network_name ~* 'dental|vision|eyemed|healthplex|chiro|acupunct|dietician|hearing|\yASH\y' THEN 'pattern:ancillary'
    WHEN pn.network_name ~* '\yCSN\y|custom|kodak|\yNY44\y|\y1199\y|highland hospital|student health|32BJ|\yHHC\y|pepsico|twitter|disney|\yKKR\y|AT&T|wespath|mnfire|fidelity|stanford health|HCA Healthcare|IU Health|UofL|city of hope|leon mgmt|mazda|\yNYU\y|st francis|promedica|sutter|dignity|county of los angeles|motion picture|calpers|\yUC\y|ucfamily|bon secours|memorial hermann|\yduke\y|YNHHS|NGHS|piedmont|SLUH|BJC|baycare|volusia|summit health|villagemd|crossover|amdocs|adelante|\yNFL\y|jane st|tx childrens|st\. elizabeth|norton|freeman|trinity|UHHS|premier health|appalachian|northgate|univ' THEN 'pattern:employer-custom'
    WHEN pn.network_name ~* 'medicare|medi.?blue|\ySNP\y|advantage|\yAARP\y|caremore|gold plus|goldchoice|\yPFFS\y|honor|careplus|giveback|freedom blue|bluejourney|secure blue|\yEGWP\y|erickson|elderplan|\ydual\y|amerivantage|\yMA PPO\y' THEN 'pattern:medicare'
    WHEN pn.network_name ~* 'medicaid|essential plan|child health|\yCHP\y|\yHARP\y|\yMLTC\y|managed long|\yFIDA\y|wellness4me|healthplus|family health|kids|kidcare|coverkids|CHIP|peachcare|hoosier|\ySTAR\y|QUEST|turquoise|healthy michigan|healthy indiana|check-up|healthy kids|tenncare|LTSS|medi-cal|familycare|healthy horizons|community plan|FCS\y|CCC\+|clear health' THEN 'pattern:government'
    WHEN pn.network_name ~* '\y(CT|CA|CO|GA|NV|ME|NH|VA|OH|IN|KY|MO|WI|TX|FL|NJ|MN|MA|AZ|TN|SC|MS|UT|PA|OR|WA|ID|AK|AR|LA|OK|HI|ND|SD|NE|KS|WV|DE|MT|WY|VT|NM|IL|IA|RI)\y|connecticut|california|colorado|georgia|nevada|maine|hampshire|virginia|\yohio\y|indiana|kentucky|missouri|wisconsin|texas|florida|jersey|minnesota|massachusett|arizona|tennessee|carolina|mississippi|\yutah\y|pennsylvania|oregon|washington|idaho|alaska|arkansas|louisiana|oklahoma|hawaii|dakota|nebraska|kansas|montana|wyoming|vermont|mexico|illinois|iowa|alabama|delaware|bluecare|century preferred|healthkeepers|prudent buyer|\yBCC\y|vivity|medica -|new england|horizon|capital blue|independence|triple s|regence|matthew thornton|PAR providers|PAR network|salt lake|orlando|tampa|dallas|houston|denver|chicago|\ySTL\y|st louis|louisville|midlands|allegiance|tufts|healthpartners|mdx|virgin islands|northern new england|mid-atlantic|midatlantic|southern' THEN 'pattern:oos-state'
    WHEN ps.slug IN ('uhc','humana') THEN 'pattern:uhc-humana-national'
    ELSE 'unresolved'
  END
FROM payer_networks pn
JOIN payer_sources ps ON ps.id = pn.payer_source_id
LEFT JOIN network_aliases a
  ON a.source = 'fhir' AND a.payer_label = ps.slug AND a.network_label = pn.network_name;

COMMENT ON TABLE payer_network_map IS 'NYS-144: every raw FHIR network dispositioned into a scope bucket; canonical network_id where one exists. Rebuilt by re-running this migration (rules are the state).';

-- ── Pre-seed 2026-07-19 (data-agent T3): Oscar OBH carve-out + Health First FL ──
-- Harvest labels for the staged Oscar-bucket manifests (oscar-obh.txt,
-- oscar-medical.txt, healthfirst-fl-obh.txt), seeded BEFORE first load per the
-- entity-layer rule. Placed here rather than in 043/044: 'oscar' is minted in
-- THIS file, so an alias in 043/044 would break FK order on a fresh replay.
-- Health First FL is HEALTH FIRST of FLORIDA (Rockledge) — never alias it to
-- Healthfirst NY.

INSERT INTO insurers (id, name, kind, parent_id, notes) VALUES
  ('health-first-fl', 'Health First Health Plans (Florida)', 'carrier', NULL,
   'Rockledge FL health-system plan; tier-3 national back-out. NOT Healthfirst NY.')
ON CONFLICT (id) DO NOTHING;

-- Oscar's NAIC group (4818), verified against loaded dfs_insurers 2026-07-19
-- (15281 AH + 16597 HMO both carry group 4818); the oscar row above predates
-- the check.
UPDATE insurers SET naic_group_code = '4818'
WHERE id = 'oscar' AND naic_group_code IS DISTINCT FROM '4818';

INSERT INTO insurer_aliases (source, label, insurer_id) VALUES
  ('mrf', 'Oscar Health',               'oscar'),
  ('mrf', 'Oscar Health (Optum BH)',    'oscar'),
  ('mrf', 'Health First FL (Optum BH)', 'health-first-fl'),
  ('naic-group', '4818',                'oscar')
ON CONFLICT (source, label) DO NOTHING;

-- The OBH manifests carry explicit market-segment labels. Whether the two
-- Oscar segments publish one identical panel is unmeasured, so each label gets
-- its own product row (the MetroPlus precedent) instead of an asserted merge.
-- oscar-medical.txt runs network=auto — its file-derived labels stay on the
-- worklist until proven, by design.
INSERT INTO networks (id, insurer_id, administrator_id, name, kind, notes) VALUES
  ('oscar-obh-ny-sg',      'oscar',           'optum', 'Oscar NY Small Group (Optum BH)',         'product', 'OBH_MRRF carve-out; 28,480 book NPIs / 692k rows measured pre-staging'),
  ('oscar-obh-individual', 'oscar',           'optum', 'Oscar Individual Multi-State (Optum BH)', 'product', 'OBH_MRRF carve-out'),
  ('hf-fl-obh',            'health-first-fl', 'optum', 'Health First FL Behavioral (Optum BH)',   'network', 'zerook line — ~0 NY-book rows expected')
ON CONFLICT (id) DO NOTHING;

INSERT INTO network_aliases (source, payer_label, network_label, network_id) VALUES
  ('mrf', 'Oscar Health (Optum BH)',    'Oscar NY small group',         'oscar-obh-ny-sg'),
  ('mrf', 'Oscar Health (Optum BH)',    'Oscar individual multi-state', 'oscar-obh-individual'),
  ('mrf', 'Health First FL (Optum BH)', 'Health First FL',              'hf-fl-obh')
ON CONFLICT (source, payer_label, network_label) DO NOTHING;
