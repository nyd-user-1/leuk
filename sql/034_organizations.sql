-- Leuk — 034: organizations, the NPI-2 org book (NYS-41).
--
-- WHAT A ROW IS. One healthcare ORGANIZATION (NPPES entity_type 2 — a company,
-- not a person), keyed on its NPI. This is the first table that names the
-- billing-group world in its own right rather than as an anonymous TIN string.
--
-- WHY IT IS A TABLE + REFRESH FUNCTION, NOT A SCRIPT OR A MATVIEW. The whole
-- scope is derivable in pure SQL from tables we already hold (nppes_npi + the
-- reference/rate/FHIR layers), so a streaming .mjs would be ceremony around a
-- SELECT. It is a real table (not a materialized view) because the brief wants
-- first-class columns a matview can't carry across refreshes: stable
-- created_at/updated_at, and the cross-link flags into the billing-TIN world.
-- refresh_organizations() below is the "refresh function" — pure SQL, callable
-- from the post-ingest chain after each NPPES load, and a TRUE no-op on re-run
-- (the upsert is change-guarded: unchanged rows are not rewritten, so
-- updated_at does not move and GET DIAGNOSTICS reports 0 rows touched).
--
-- ── THE SCOPE PREDICATE (union, deduped on npi) ────────────────────────────
-- Leg 1 — every entity_type-2 NPI whose PRACTICE-LOCATION state is NY (103,772).
-- Leg 2 — every entity_type-2 NPI any of OUR datasets references nationwide,
--   the "national platforms" leg: an npi-type TIN in provider_rate_signals /
--   tin_registry / org_tin_rosters, or an npi in provider_network_participation
--   or fhir_organizations. Measured 2026-07-16: 5,079 referenced orgs, of which
--   3,294 overlap leg 1 and 1,785 are net-new out-of-state platforms.
-- Union = 105,557. (Headway's billing orgs — HEADWAY COLORADO/CALIFORNIA/
-- MICHIGAN BEHAVIORAL HEALTH SERVICES — resolve here: type-2, NEW YORK NY.)
--
-- CRITICAL: leg 2 joins nppes_npi ON entity_type=2. Most npi-type TINs are NOT
-- orgs — 10,028 of 13,158 are individuals billing as themselves (a solo
-- clinician's own NPI standing in for a tax id). Pulling them in unfiltered
-- would make an "org book" that is 76% people. The entity_type join is the gate.
--
-- ── WHAT THE SOURCE TABLES DO NOT HAVE (the brief named these; the tables win)─
--   * NO EIN. NPPES carries none for orgs (nppes_organizations.ein is 0/104,060
--     populated). Settled 2026-07-14; there is deliberately no ein column here.
--   * NO mailing address/state. sql/030 loaded selected columns only (the
--     dissemination file is 330 cols / ~10GB); mailing address was not among
--     them. Only mail_phone exists, and it is not an address. Omitted, not faked.
--   * authorized_official is NAME ONLY and NY-ONLY. It lives in
--     nppes_organizations (sql/025), which is NY-scoped (103,772/104,060 NY) and
--     stores no title/phone split. So it is populated for NY orgs, NULL for the
--     national net-new leg. Surfaced honestly, not invented.
--
-- Idempotent — safe to re-run. Both the DDL and refresh_organizations() are.

create table if not exists organizations (
  npi                      text primary key,
  legal_business_name      text,
  -- DBA / other names. A side array, because nppes_other_names is 0..n per NPI
  -- (a matview column would force one). NULL when the org has no other names.
  other_names              text[],
  -- Practice location (NPPES has no separate mailing address in our columns).
  street1                  text,
  street2                  text,
  city                     text,
  state                    text,
  zip                      text,
  phone                    text,
  primary_taxonomy         text,
  -- Resolved via nucc_taxonomy (sql/031). display_name/classification are the
  -- public NUCC descriptors — free to store, unlike CPT.
  taxonomy_display         text,
  taxonomy_classification  text,
  -- Name only, NY subset only — see header. NULL for national net-new orgs.
  authorized_official      text,
  enumeration_date         date,
  last_update              date,
  deactivation_date        date,
  deactivated              boolean not null default false,
  -- Provenance flags (an org can be BOTH). ny_book = leg 1; platform_referenced
  -- = leg 2. An out-of-state platform billing into NY is (false, true).
  ny_book                  boolean not null default false,
  platform_referenced      boolean not null default false,
  -- ── The first join between the NPI-2 world and the billing-TIN world. ──
  -- is_billing_tin = this org's NPI is itself published as an npi-type TIN
  -- (3,113 of them). tin_registry_name = the business name the registry already
  -- resolved for that TIN, if any — a cross-check on legal_business_name.
  is_billing_tin           boolean not null default false,
  tin_registry_name        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists organizations_state_idx    on organizations (state);
create index if not exists organizations_ny_book_idx   on organizations (ny_book) where ny_book;
create index if not exists organizations_billing_idx   on organizations (is_billing_tin) where is_billing_tin;
create index if not exists organizations_taxonomy_idx  on organizations (primary_taxonomy);

comment on table organizations is
  'NPI-2 org book (NYS-41): every NY organization + every org any dataset references nationwide. Derived from nppes_npi by refresh_organizations(). No EIN (NPPES has none).';

-- ── refresh_organizations() ────────────────────────────────────────────────
-- Rebuilds the scope, upserts changed rows only, deletes rows that fell out of
-- scope. Returns (upserted, deleted) so a re-run's no-op is observable: first
-- run (105557, 0), second run (0, 0). Call it after every NPPES full load.
create or replace function refresh_organizations()
returns table(upserted bigint, deleted bigint)
language plpgsql as $$
declare
  v_upserted bigint;
  v_deleted  bigint;
begin
  -- The leg-2 reference set: every NPI any of our datasets points at. Small
  -- (tens of thousands), so materialize + index it and let the big type-2 scan
  -- probe it, rather than re-deriving the union per row.
  create temp table _ref on commit drop as
    select substring(tin from 5) as npi from provider_rate_signals where tin like 'npi:%'
    union
    select substring(tin_norm from 5) from tin_registry where tin_norm like 'npi:%'
    union
    select substring(tin from 5) from org_tin_rosters where tin like 'npi:%'
    union
    select npi from provider_network_participation where npi is not null
    union
    select npi from fhir_organizations where npi is not null;
  create index on _ref (npi);

  -- The npi-type-TIN subset — orgs that are themselves billing identifiers.
  create temp table _billing on commit drop as
    select substring(tin from 5) as npi from provider_rate_signals where tin like 'npi:%'
    union
    select substring(tin_norm from 5) from tin_registry where tin_norm like 'npi:%'
    union
    select substring(tin from 5) from org_tin_rosters where tin like 'npi:%';
  create index on _billing (npi);

  create temp table _scope on commit drop as
    select
      n.npi,
      n.org_name                                                       as legal_business_name,
      (select array_agg(o.other_name order by o.other_name)
         from nppes_other_names o where o.npi = n.npi)                 as other_names,
      n.loc_addr1 as street1, n.loc_addr2 as street2, n.loc_city as city,
      n.loc_state as state, n.loc_zip as zip, n.loc_phone as phone,
      n.primary_taxonomy,
      t.display_name                                                   as taxonomy_display,
      t.classification                                                 as taxonomy_classification,
      org.authorized_official,
      n.enumeration_date, n.last_update, n.deactivation_date,
      (n.deactivation_date is not null)                                as deactivated,
      (n.loc_state = 'NY')                                             as ny_book,
      exists (select 1 from _ref r where r.npi = n.npi)                as platform_referenced,
      exists (select 1 from _billing b where b.npi = n.npi)            as is_billing_tin,
      reg.business_name                                                as tin_registry_name
    from nppes_npi n
    left join nucc_taxonomy t       on t.code = n.primary_taxonomy
    left join nppes_organizations org on org.npi = n.npi
    left join tin_registry reg      on reg.tin_norm = 'npi:' || n.npi
    where n.entity_type = 2
      and (n.loc_state = 'NY' or exists (select 1 from _ref r where r.npi = n.npi));

  delete from organizations o
   where not exists (select 1 from _scope s where s.npi = o.npi);
  get diagnostics v_deleted = row_count;

  insert into organizations as o (
    npi, legal_business_name, other_names, street1, street2, city, state, zip,
    phone, primary_taxonomy, taxonomy_display, taxonomy_classification,
    authorized_official, enumeration_date, last_update, deactivation_date,
    deactivated, ny_book, platform_referenced, is_billing_tin, tin_registry_name
  )
  select
    npi, legal_business_name, other_names, street1, street2, city, state, zip,
    phone, primary_taxonomy, taxonomy_display, taxonomy_classification,
    authorized_official, enumeration_date, last_update, deactivation_date,
    deactivated, ny_book, platform_referenced, is_billing_tin, tin_registry_name
  from _scope
  on conflict (npi) do update set
    legal_business_name     = excluded.legal_business_name,
    other_names             = excluded.other_names,
    street1                 = excluded.street1,
    street2                 = excluded.street2,
    city                    = excluded.city,
    state                   = excluded.state,
    zip                     = excluded.zip,
    phone                   = excluded.phone,
    primary_taxonomy        = excluded.primary_taxonomy,
    taxonomy_display        = excluded.taxonomy_display,
    taxonomy_classification = excluded.taxonomy_classification,
    authorized_official     = excluded.authorized_official,
    enumeration_date        = excluded.enumeration_date,
    last_update             = excluded.last_update,
    deactivation_date       = excluded.deactivation_date,
    deactivated             = excluded.deactivated,
    ny_book                 = excluded.ny_book,
    platform_referenced     = excluded.platform_referenced,
    is_billing_tin          = excluded.is_billing_tin,
    tin_registry_name       = excluded.tin_registry_name,
    updated_at              = now()
  -- The teeth of the no-op: only write when something actually changed.
  where (o.legal_business_name, o.other_names, o.street1, o.street2, o.city,
         o.state, o.zip, o.phone, o.primary_taxonomy, o.taxonomy_display,
         o.taxonomy_classification, o.authorized_official, o.enumeration_date,
         o.last_update, o.deactivation_date, o.deactivated, o.ny_book,
         o.platform_referenced, o.is_billing_tin, o.tin_registry_name)
    is distinct from
        (excluded.legal_business_name, excluded.other_names, excluded.street1,
         excluded.street2, excluded.city, excluded.state, excluded.zip,
         excluded.phone, excluded.primary_taxonomy, excluded.taxonomy_display,
         excluded.taxonomy_classification, excluded.authorized_official,
         excluded.enumeration_date, excluded.last_update, excluded.deactivation_date,
         excluded.deactivated, excluded.ny_book, excluded.platform_referenced,
         excluded.is_billing_tin, excluded.tin_registry_name);
  get diagnostics v_upserted = row_count;

  return query select v_upserted, v_deleted;
end $$;
