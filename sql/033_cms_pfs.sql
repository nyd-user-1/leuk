-- Leuk — 033: the free CMS benchmark layer. Our own CPT vocabulary
-- (`cpt_codes`), the PFS Relative Value File (`cms_rvu` + `cms_gpci` +
-- `cms_pfs_config`), the public HCPCS Level II code set (`hcpcs_codes`), and
-- the view that turns all of it into "% of Medicare" (`medicare_benchmark_ny`).
--
-- WHY THIS EXISTS. provider_rate_signals holds 9.3M negotiated rates keyed by a
-- bare `billing_code`. A dollar amount alone answers nothing — $142 for 90837
-- is generous in Buffalo and thin in Manhattan. Medicare's allowed amount is
-- the only free, universal, per-locality yardstick, and CMS gives away every
-- input needed to compute it. That converts every rate we hold into a ratio.
--
-- ── THE LICENSING BOUNDARY (the reason this file looks the way it does) ─────
-- CPT codes and their DESCRIPTORS are AMA copyright. The five-digit codes
-- themselves are facts and are not copyrightable — we key on them freely. The
-- descriptor TEXT is not ours: CMS ships it in the PPRRVU file under CMS's own
-- AMA license, which does not extend to us. The file says so on line 2 of
-- itself ("CPT codes and descriptions only are copyright 2026 American Medical
-- Association"). So:
--   * `cms_rvu` deliberately has NO description column. The ingest drops the
--     source's DESCRIPTION column on the floor. This is not an oversight —
--     see scripts/cms/ingest-rvu.mjs and scripts/cms/LICENSE_NOTE.md.
--   * `cpt_codes.display_name` is OUR OWN plain-language wording, written by
--     us, reconciled with the labels already shipping in lib/rate-table.ts.
--   * HCPCS LEVEL II IS THE OPPOSITE CASE and the asymmetry is the point:
--     Level II is CMS-maintained public data, so `hcpcs_codes` stores the
--     official descriptors verbatim and may display them. Level II is also
--     where behavioral health actually lives for Medicaid managed care
--     (H0004, H0015, H2019…).
--
-- ── THE ARITHMETIC ─────────────────────────────────────────────────────────
--   allowed = (work_rvu×GPCIw + pe_rvu×GPCIpe + mp_rvu×GPCImp) × CF
-- Every term is in this file. `pe_rvu` has a non-facility and a facility
-- flavor; which applies depends on WHERE the service was rendered, not on the
-- code. We compute non-facility only (an office visit — the behavioral-health
-- default). Facility columns are ingested so the other half is a WHERE clause
-- later, not a re-ingest.
--
-- ── SOURCE, VERIFIED 2026-07-16 ────────────────────────────────────────────
-- RVU26C (released 06/30/2026) — the July release, NEWER than the RVU26B this
-- work was scoped against. https://www.cms.gov/medicare/payment/fee-schedules/
-- physician/pfs-relative-value-files. No key, no signup, no license click.
-- HCPCS: July 2026 quarterly alpha-numeric file (HCPCS-2026-Q3).
--
-- Idempotent — safe to re-run.

-- ── 1. cpt_codes — OUR vocabulary, not the AMA's ───────────────────────────
-- One row per billing code we care to name. `code` is a bare CPT number (a
-- fact, freely usable as a key); every text column is wording we authored.
-- This table is CONTENT, not reference data: it is editable copy that happens
-- to live in Postgres, and it is the join target that gives 9.3M anonymous
-- billing_code strings a human name.
create table if not exists cpt_codes (
  code                   text primary key,
  -- Our own plain-language wording. MUST stay in sync with RATE_CODES in
  -- lib/rate-table.ts for the five codes that ship in the UI today — two
  -- sources of copy for one code is how a product forks its own vocabulary.
  display_name           text not null,
  -- Even plainer, for patient-facing surfaces. Nullable: not every code needs
  -- a second register, and an empty string would lie about that.
  patient_friendly_name  text,
  category               text,
  active                 boolean not null default true,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table cpt_codes is
  'Leuk-authored names for billing codes. Contains NO AMA descriptor text by design — bare codes are facts, descriptors are licensed. See scripts/cms/LICENSE_NOTE.md.';
comment on column cpt_codes.display_name is
  'Our own wording. Never paste CMS/AMA descriptor text here.';

-- ── 2. cms_rvu — the PFS Relative Value File ───────────────────────────────
-- One row per (code, modifier) per release year. The modifier splits a code
-- into its professional (26) and technical (TC) components, which carry
-- DIFFERENT RVUs — so the code alone is not the grain. Modifier is '' (empty,
-- not NULL) for the base row: it is part of the primary key, and NULL would
-- silently drop every base row from the uniqueness guarantee.
--
-- NO DESCRIPTION COLUMN. See the licensing boundary above.
create table if not exists cms_rvu (
  hcpcs_code             text not null,
  modifier               text not null default '',
  -- 'A' active/payable, 'R' restricted (contractor-priced), 'T' injections,
  -- 'I' invalid, 'X' statutory exclusion, 'B'/'P' bundled … Attachment A of
  -- the release PDF. Only A/R/T are used for Medicare payment; only A and T
  -- are computable from RVUs (R is contractor-priced). See the view below.
  status_code            text,
  work_rvu               numeric(9,2),
  pe_rvu_nonfacility     numeric(9,2),
  pe_rvu_facility        numeric(9,2),
  mp_rvu                 numeric(9,2),
  total_rvu_nonfacility  numeric(9,2),
  total_rvu_facility     numeric(9,2),
  -- 'XXX' (global concept does not apply), '000', '010', '090', 'YYY', 'ZZZ'.
  global_period          text,
  -- Which CMS release this row came from — 'RVU26C', not a date. A quarterly
  -- release can restate RVUs mid-year, so provenance is per-row, not per-table.
  source_release         text not null,
  effective_year         int  not null,
  updated_at             timestamptz not null default now(),
  primary key (hcpcs_code, modifier, effective_year)
);

create index if not exists cms_rvu_code_idx   on cms_rvu (hcpcs_code);
create index if not exists cms_rvu_status_idx on cms_rvu (status_code);

comment on table cms_rvu is
  'CMS PFS Relative Value File (RVU26C). Deliberately carries no descriptor column — that text is AMA-licensed to CMS, not to us.';

-- ── 3. cms_gpci — geographic adjustment ────────────────────────────────────
-- One row per (state, locality, year). THE KEY IS NOT locality_code ALONE:
-- locality numbers are only unique WITHIN a state — '00' is both ALABAMA and
-- ARIZONA, '01' is used by 19 states, '99' ("rest of state") by 15. Keying on
-- locality_code alone silently collapses 115 localities into ~30.
create table if not exists cms_gpci (
  state          text not null,
  locality_code  text not null,
  locality_name  text not null,
  -- Medicare Administrative Contractor. Kept because it is the only join key
  -- back to a MAC-scoped CMS file, and it is free to carry.
  mac            text,
  -- The work GPCI as published WITH the statutory 1.0 floor already applied.
  gpci_work      numeric(7,3) not null,
  gpci_pe        numeric(7,3) not null,
  gpci_mp        numeric(7,3) not null,
  source_release text not null,
  effective_year int  not null,
  updated_at     timestamptz not null default now(),
  primary key (state, locality_code, effective_year)
);

create index if not exists cms_gpci_state_idx on cms_gpci (state);

comment on table cms_gpci is
  'CY2026 GPCIs by state × Medicare locality. PK includes state — locality numbers repeat across states.';

-- ── 4. cms_pfs_config — the scalars ────────────────────────────────────────
-- The conversion factor is one number that moves every price in the country,
-- so it gets a row with its provenance attached rather than a constant buried
-- in a query. CY2026 has TWO of them: the Quality Payment Program splits the
-- fee schedule in half. Clinicians who qualify as APM participants are paid on
-- a HIGHER conversion factor than everyone else — a real two-tier fee schedule,
-- not a rounding difference. Both are stored; the benchmark uses the
-- non-qualifying one (see the view).
create table if not exists cms_pfs_config (
  key            text primary key,
  value          numeric not null,
  source         text not null,
  effective_year int  not null,
  updated_at     timestamptz not null default now()
);

comment on table cms_pfs_config is
  'PFS scalars (conversion factors). CY2026 ships two CFs — qualifying-APM and non-qualifying. Values verified against the RVU26C files themselves, not a secondary source.';

-- ── 5. hcpcs_codes — Level II, public AND displayable ──────────────────────
-- The mirror image of cpt_codes: CMS maintains Level II and its descriptors
-- are public, so the official text lives here verbatim and may be shown.
--
-- WHAT THE SOURCE FILE ACTUALLY IS. Fixed-width, 320-char records, and a code
-- is NOT one record: a long descriptor longer than 80 characters continues
-- onto additional records with the same code and an incrementing sequence
-- number (H0015 spans four). The ingest reassembles them; one row here = one
-- code. The file also carries 579 MODIFIER records (blank code positions, a
-- 2-char modifier instead) — a different entity, deliberately not loaded.
--
-- NO LEVEL I / CPT ROWS: verified 2026-07-16, the alpha-numeric file contains
-- zero numeric codes and zero D-codes (CMS omits the ADA-copyrighted dental
-- series). So nothing copyrighted rides in on this table.
create table if not exists hcpcs_codes (
  code                  text primary key,
  long_description      text,
  short_description     text,
  pricing_indicator     text,
  -- Whether/how Medicare covers it: 'C' carrier judgment, 'D' special coverage
  -- instructions, 'I' not payable by Medicare, 'M' non-covered, 'S' non-covered
  -- by Medicare statute. 'I' is where most H-codes sit — Medicaid pays them.
  coverage_code         text,
  -- Berenson-Eggers Type of Service; CMS's clinical-category rollup.
  bets_code             text,
  type_of_service       text,
  added_date            date,
  action_effective_date date,
  -- Non-null = CMS retired the code. 1,307 of 8,725 carry one; they are kept
  -- (historical claims still reference them) and exposed via `active`.
  termination_date      date,
  action_code           text,
  source_release        text not null,
  effective_date        date,
  updated_at            timestamptz not null default now()
);

create index if not exists hcpcs_codes_active_idx on hcpcs_codes (termination_date);

comment on table hcpcs_codes is
  'CMS HCPCS Level II (HCPCS-2026-Q3). Official descriptors, freely storable and displayable — the constraint that governs cpt_codes is CPT-only.';

-- ── 6. medicare_benchmark_ny — the payoff ──────────────────────────────────
-- Every NY locality × every code we name, priced the way Medicare prices it.
-- This is the denominator that turns a negotiated rate into "% of Medicare".
--
-- STATUS FILTER — chosen, not assumed. The release PDF says RVUs for status
-- 'A', 'R', and 'T' "are used for Medicare payment". We take A and T and drop
-- R: R is "restricted coverage… if covered, the service is contractor priced",
-- meaning the fee-schedule formula does NOT produce what Medicare pays, so a
-- computed number there would be a confident lie. (91% of R rows carry no RVUs
-- at all.) A = 9,408 rows, T = 8, R = 1,082/104-with-RVUs.
--
-- THIS BITES EXACTLY ONE SEEDED CODE, and it is the right bite: 90846 (family
-- therapy WITHOUT the client present) is status 'R' — it carries RVUs (2.74
-- work / 3.17 total non-facility) but Medicare restricts coverage and lets the
-- contractor price it. So 90846 has NO row in this view, deliberately. That is
-- not a gap to backfill: multiplying its RVUs by the CF would invent a number
-- Medicare does not pay. If a benchmark for it is ever needed, the honest
-- source is the local MAC's fee schedule, not this arithmetic. The other 13
-- seeded codes are 'A' (90847 — family therapy WITH the client — is 'A' and is
-- present, which is the comparison that matters clinically anyway).
--
-- CF: the non-qualifying (non-APM) factor. The APM factor applies only to
-- clinicians who cleared QPP thresholds — a property of the BILLING PARTY, not
-- of the code, and nothing in provider_rate_signals tells us who qualifies. So
-- the honest default is the one that applies to most clinicians.
--
-- Base rows only (modifier = ''): a 26/TC split is a radiology concern, and
-- carrying it here would multiply rows for no behavioral-health gain.
create or replace view medicare_benchmark_ny as
select
  g.state,
  g.locality_code,
  g.locality_name,
  r.hcpcs_code                       as code,
  c.display_name,
  r.status_code,
  r.work_rvu,
  r.pe_rvu_nonfacility,
  r.mp_rvu,
  g.gpci_work,
  g.gpci_pe,
  g.gpci_mp,
  cf.value                           as conversion_factor,
  round(
    ( r.work_rvu           * g.gpci_work
    + r.pe_rvu_nonfacility * g.gpci_pe
    + r.mp_rvu             * g.gpci_mp
    ) * cf.value
  , 2)                               as medicare_allowed_nonfacility,
  r.source_release,
  r.effective_year
from cms_rvu r
join cpt_codes c
  on c.code = r.hcpcs_code
join cms_gpci g
  on g.state = 'NY'
 and g.effective_year = r.effective_year
join cms_pfs_config cf
  on cf.key = 'conversion_factor_nonqpp'
 and cf.effective_year = r.effective_year
where r.modifier = ''
  and r.status_code in ('A', 'T')
  and c.active;

comment on view medicare_benchmark_ny is
  'Non-facility Medicare allowed amount per NY locality × named code. Denominator for %-of-Medicare. Non-APM conversion factor; status A/T only.';

-- ── 7. service_code_names — one lookup, two vocabularies ───────────────────
-- CPT and HCPCS Level II are one namespace to a biller and two legal regimes to
-- us. This view is the seam: `source` says which regime a name came from, so a
-- future typeahead can render both while a licensing question can still be
-- answered per row. 'leuk' = our wording. 'cms' = official public text.
create or replace view service_code_names as
select
  code,
  display_name,
  'leuk'::text as source
from cpt_codes
where active
union all
select
  code,
  coalesce(nullif(long_description, ''), short_description, code) as display_name,
  'cms'::text as source
from hcpcs_codes
where termination_date is null;

comment on view service_code_names is
  'Unified code→name lookup. source=leuk (our CPT wording) | cms (official Level II descriptors).';

-- ── 8. Seed cpt_codes — the working behavioral-health set ──────────────────
-- DRAFT COPY. Every string below is ours and is editable content, not final
-- product copy. The five codes that already ship (90791/90834/90837/90853/
-- 99214) use the EXACT labels from RATE_CODES in lib/rate-table.ts — those are
-- live in the /published-rates UI and must not fork. The rest follow the same
-- register: what the clinician did, in plain words, no CPT phrasing.
insert into cpt_codes (code, display_name, patient_friendly_name, category, notes) values
  ('90791', 'Diagnostic evaluation',        'First visit to understand what''s going on',      'Evaluation',   'Intake/diagnostic interview, no medical services. Label matches RATE_CODES.'),
  ('90792', 'Diagnostic evaluation with medication review', 'First visit with a prescriber',   'Evaluation',   'Intake including medical assessment; prescriber-only.'),
  ('90832', 'Psychotherapy 30 min',         'A shorter therapy session',                       'Psychotherapy', 'Time band 16-37 min.'),
  ('90834', 'Psychotherapy 45 min',         'A standard therapy session',                      'Psychotherapy', 'Time band 38-52 min. The most common outpatient session. Label matches RATE_CODES.'),
  ('90837', 'Psychotherapy 60 min',         'A longer therapy session',                        'Psychotherapy', 'Time band 53+ min. Label matches RATE_CODES.'),
  ('90833', 'Psychotherapy 30 min with medication management', null,                           'Psychotherapy', 'Add-on; billed alongside a medical E/M visit, never alone.'),
  ('90836', 'Psychotherapy 45 min with medication management', null,                           'Psychotherapy', 'Add-on; billed alongside a medical E/M visit, never alone.'),
  ('90838', 'Psychotherapy 60 min with medication management', null,                           'Psychotherapy', 'Add-on; billed alongside a medical E/M visit, never alone.'),
  ('90846', 'Family therapy without the client present', 'A session with your family',         'Family',        'Family/couples session, identified client not in the room.'),
  ('90847', 'Family therapy with the client present',    'A session with you and your family', 'Family',        'Family/couples session, identified client in the room.'),
  ('90853', 'Group psychotherapy',          'A group session',                                 'Group',         'Group session, non-family. Label matches RATE_CODES.'),
  ('99213', 'Established patient visit (low complexity)',      null,                           'Office visit',  'E/M for a returning patient.'),
  ('99214', 'Established patient visit',    'A follow-up medical visit',                       'Office visit',  'E/M for a returning patient, moderate complexity. Label matches RATE_CODES — kept unqualified there, so kept unqualified here.'),
  ('99215', 'Established patient visit (high complexity)',     null,                           'Office visit',  'E/M for a returning patient.')
on conflict (code) do update set
  display_name          = excluded.display_name,
  patient_friendly_name = excluded.patient_friendly_name,
  category              = excluded.category,
  notes                 = excluded.notes,
  updated_at            = now();
