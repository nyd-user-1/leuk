# Leuk Database Atlas

> **Generated** by `scripts/db-atlas.mjs` on 2026-08-05 — do not hand-edit. Re-run `node --env-file=.env.local scripts/db-atlas.mjs` to refresh. Row counts on tables above 500,000 rows are planner estimates (`≈`), never `count(*)`.

The live public schema holds **91** relations — 78 tables and 13 materialized views. Grouped by domain below; the graph of how they join is in the per-table Obsidian notes under `~/Vaults/hq/leuk/atlas/`.

## Contents

- [Objects](#objects)
- [Insurance graph](#insurance-graph)
- [Rates (Transparency-in-Coverage)](#rates-transparency-in-coverage)
- [Medicare benchmark (CMS PFS)](#medicare-benchmark-cms-pfs)
- [Employers & plans](#employers-plans)
- [Maintenance & platform](#maintenance-platform)
- [Practice management (EHR)](#practice-management-ehr)
- [Unmapped tables](#unmapped-tables)
- [Matview lineage](#matview-lineage)

## Objects

_The provider book everything else keys on. One clinician, one NPI, many sources._

### `directory_providers`

NY behavioral-health provider book; one row per (source, source_id). Rows exceed distinct NPIs because one clinician arrives from several sources; person-level merge open (NYS-34).

**Table** · 124,163 rows · defined in sql/003 · powers `/directory`

**Joins:** `nppes_npi` (`npi`) · `org_affiliations` (`npi`) · `org_tin_rosters` (`npi`) · `provider_network_participation` (`npi`) · `provider_participation_summary` (`npi`) · `provider_qualifications` (`npi`) · `provider_rate_signals` (`npi`) · `provider_rate_summary` (`npi`)

| column | type |
| --- | --- |
| `id` | uuid |
| `npi` | text |
| `name` | text |
| `profession` | text |
| `license_no` | text |
| `taxonomy` | text |
| `address` | text |
| `city` | text |
| `county` | text |
| `zip` | text |
| `phone` | text |
| `source` | text |
| `source_id` | text |
| `raw` | jsonb |
| `updated_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |
| `entity_type` | text |
| `primary_taxonomy` | text |
| `subspecialty` | text |
| `taxonomies` | text[] |
| `credential` | text |
| `gender` | text |
| `license_state` | text |
| `enumeration_date` | date |
| `last_update_date` | date |
| `deactivated_at` | date |
| `deactivation_reason` | text |
| `reactivated_at` | date |
| `is_sole_proprietor` | boolean |
| `parent_org` | text |
| `medicaid_id` | text |
| `slug` | text |
| `first_name` | text |
| `last_name` | text |

### `directory_programs`

OMH state-licensed treatment programs — the clinics, not the clinicians; powers /programs and the portal resources.

**Table** · 6,462 rows · defined in sql/003 · powers `/programs`

| column | type |
| --- | --- |
| `id` | uuid |
| `agency` | text |
| `facility` | text |
| `program_name` | text |
| `program_type` | text |
| `populations` | text |
| `address` | text |
| `city` | text |
| `county` | text |
| `zip` | text |
| `phone` | text |
| `source` | text |
| `source_id` | text |
| `raw` | jsonb |
| `updated_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |

### `provider_qualifications`

Per-NPI licenses, degrees and taxonomies — the source of the profession + credential filters. Licensing, not what a provider treats.

**Table** · 99,511 rows · defined in sql/028 · powers `/directory`

**Joins:** `directory_providers` (`npi`) · `nppes_npi` (`npi`) · `nucc_taxonomy`

| column | type |
| --- | --- |
| `id` | uuid |
| `npi` | text |
| `qual_type` | text |
| `code` | text |
| `display` | text |
| `license_state` | text |
| `license_number` | text |
| `source` | text |
| `ingested_at` | timestamp with time zone |

### `nppes_npi`

The raw national NPPES registry as loaded — every provider in the country, all specialties. directory_providers is the NY behavioral-health distillation of it.

**Table** · ≈ 9,674,243 rows · defined in sql/030 · powers `/directory`

**Joins:** `directory_providers` (`npi`) · `nppes_organizations` (`npi`) · `nppes_other_names` (`npi`) · `nucc_taxonomy` · `organizations` (`npi`) · `provider_qualifications` (`npi`)

| column | type |
| --- | --- |
| `npi` | text |
| `entity_type` | smallint |
| `org_name` | text |
| `last_name` | text |
| `first_name` | text |
| `credential` | text |
| `loc_addr1` | text |
| `loc_addr2` | text |
| `loc_city` | text |
| `loc_state` | text |
| `loc_zip` | text |
| `loc_phone` | text |
| `mail_phone` | text |
| `sole_proprietor` | text |
| `primary_taxonomy` | text |
| `enumeration_date` | date |
| `last_update` | date |
| `deactivation_date` | date |
| `reactivation_date` | date |
| `ingested_at` | timestamp with time zone |
| `addr_key` | text |
| `zip5` | text |
| `loc_phone_key` | text |
| `mail_phone_key` | text |

### `organizations`

NPI-2 org book (sql/034): every NY organization + every org our datasets reference nationwide (NY book + net-new national platforms like Headway). Derived in SQL from nppes_npi; no EIN (NPPES suppresses it). Some are also billing TINs — the first NPI-2 ↔ billing-TIN join.

**Table** · 105,557 rows · defined in sql/034 · powers `/directory`

**Joins:** `nppes_npi` (`npi`) · `nppes_organizations` (`npi`) · `org_tin_rosters` (`tin`) · `tin_registry` (`tin`)

| column | type |
| --- | --- |
| `npi` | text |
| `legal_business_name` | text |
| `other_names` | text[] |
| `street1` | text |
| `street2` | text |
| `city` | text |
| `state` | text |
| `zip` | text |
| `phone` | text |
| `primary_taxonomy` | text |
| `taxonomy_display` | text |
| `taxonomy_classification` | text |
| `authorized_official` | text |
| `enumeration_date` | date |
| `last_update` | date |
| `deactivation_date` | date |
| `deactivated` | boolean |
| `ny_book` | boolean |
| `platform_referenced` | boolean |
| `is_billing_tin` | boolean |
| `tin_registry_name` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `cpt_codes`

OUR OWN plain-language names for the behavioral billing codes (20 codes) — never AMA descriptor text, which is licensed. The single source of display labels (lib/cpt-labels.generated.ts regenerates from it); the five live codes match RATE_CODES in lib/rate-table.ts.

**Table** · 20 rows · defined in sql/033

**Joins:** `cms_rvu` (`code`) · `provider_rate_signals`

| column | type |
| --- | --- |
| `code` | text |
| `display_name` | text |
| `patient_friendly_name` | text |
| `category` | text |
| `active` | boolean |
| `notes` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `hcpcs_codes`

CMS HCPCS Level II with OFFICIAL descriptors (public, unlike CPT). Where NY Medicaid behavioral codes live (H0004/H0015/H2019). Vocabulary only — we hold zero rates for these; the MRF scanner's code list is CPT-only.

**Table** · 8,725 rows · defined in sql/033

| column | type |
| --- | --- |
| `code` | text |
| `long_description` | text |
| `short_description` | text |
| `pricing_indicator` | text |
| `coverage_code` | text |
| `bets_code` | text |
| `type_of_service` | text |
| `added_date` | date |
| `action_effective_date` | date |
| `termination_date` | date |
| `action_code` | text |
| `source_release` | text |
| `effective_date` | date |
| `updated_at` | timestamp with time zone |

### `nppes_organizations`

NPI-2 (organization) identity records from the NPPES monthly dissemination file — NY practice locations plus every NPI that appears as an 'npi:' billing TIN. CMS suppresses EINs in the public file, so this names npi-TINs directly but cannot name ein-TINs on its own.

**Table** · 104,060 rows · defined in sql/025

**Joins:** `employers` (`ein`) · `nppes_npi` (`npi`) · `nppes_other_names` (`npi`) · `organizations` (`npi`) · `tin_registry`

| column | type |
| --- | --- |
| `npi` | text |
| `name` | text |
| `other_name` | text |
| `ein` | text |
| `taxonomy` | text |
| `address` | text |
| `city` | text |
| `state` | text |
| `zip` | text |
| `phone` | text |
| `authorized_official` | text |
| `is_subpart` | boolean |
| `parent_lbn` | text |
| `enumeration_date` | date |
| `last_update` | date |
| `deactivation_date` | date |
| `ingested_at` | timestamp with time zone |

### `nppes_other_names`

The NPPES Other Name reference file — additional names for NPI-2s, overwhelmingly DBAs ('doing business as'). The display name a patient recognizes usually lives here, not in the opaque Legal Business Name (type_code 3 = DBA). Read by the org-name matcher and the Form 5500 name flywheel.

**Table** · ≈ 719,947 rows · defined in sql/030

**Joins:** `nppes_npi` (`npi`) · `nppes_organizations` (`npi`) · `tin_registry`

| column | type |
| --- | --- |
| `npi` | text |
| `other_name` | text |
| `type_code` | text |

### `nucc_taxonomy`

The NUCC Health Care Provider Taxonomy code set (883 codes, v26.0) — the reference that makes a taxonomy code legible (grouping / classification / specialization). Reference/display only; scripts/lib/mh-taxonomy.mjs stays the behavioral-health policy filter.

**Table** · 883 rows · defined in sql/031

**Joins:** `nppes_npi` · `provider_qualifications`

| column | type |
| --- | --- |
| `code` | text |
| `grouping` | text |
| `classification` | text |
| `specialization` | text |
| `definition` | text |
| `display_name` | text |
| `section` | text |

## Insurance graph

_Who is in which network, attested by the payer's own directory._

### `insurers`

Canonical insurer entities (DFS-resolved, sql/043) — the fixed points every payer label maps onto.

**Table** · 48 rows · defined in sql/043

**Joins:** `networks` (`insurer_id`)

| column | type |
| --- | --- |
| `id` | text |
| `name` | text |
| `kind` | text |
| `parent_id` | text |
| `naic_group_code` | text |
| `notes` | text |
| `created_at` | timestamp with time zone |

### `networks`

Canonical networks + label crosswalk (sql/044, resolves 99.35% of rate rows) — the join point where FHIR and MRF vocabularies meet.

**Table** · 72 rows · defined in sql/044

**Joins:** `insurers` (`insurer_id`) · `org_network_rates`

| column | type |
| --- | --- |
| `id` | text |
| `insurer_id` | text |
| `administrator_id` | text |
| `name` | text |
| `kind` | text |
| `notes` | text |
| `created_at` | timestamp with time zone |

### `payer_sources`

The insurers whose FHIR directories we harvest. 'Configured' is not the same as 'live'.

**Table** · 12 rows · defined in sql/013

**Joins:** `org_affiliations` (`payer_source_id`) · `payer_networks` (`payer_source_id`) · `payer_unmatched_npis` (`payer_source_id`) · `provider_network_participation` (`payer_source_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `slug` | text |
| `name` | text |
| `fhir_base_url` | text |
| `auth_type` | text |
| `plan_net_profile` | boolean |
| `last_synced_at` | timestamp with time zone |
| `active` | boolean |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |
| `auth_strategy` | text |
| `pagination_strategy` | text |
| `supports_include` | boolean |
| `supports_lastupdated` | boolean |
| `bulk_export_url` | text |
| `ig_version` | text |
| `role_cardinality` | text |
| `status` | text |
| `last_probe_at` | timestamp with time zone |
| `last_probe_result` | jsonb |
| `max_last_updated` | timestamp with time zone |

### `payer_networks`

Per-insurer network/product labels from directories — the labels membership hangs off (anthem 356+ · cigna 226 · uhc 213 · humana 135 · mvp 18).

**Table** · 1,133 rows · defined in sql/013

**Joins:** `fhir_insurance_plans` · `fhir_org_affiliations` · `payer_sources` (`payer_source_id`) · `provider_network_participation` (`payer_source_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `payer_source_id` | uuid |
| `network_name` | text |
| `raw_network_id` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `provider_network_participation`

Payer-attested membership: one row per (npi × payer × network × location), carrying accepting-new-patients + as-of. THE membership evidence, FHIR flavor — what the insurance badge reads.

**Table** · ≈ 2,448,473 rows · defined in sql/013 · powers `/directory`

**Joins:** `directory_providers` (`npi`) · `fhir_locations` · `payer_networks` (`network_id`) · `payer_sources` (`payer_source_id`) · `provider_participation_summary` (`npi`)

| column | type |
| --- | --- |
| `id` | uuid |
| `npi` | text |
| `payer_source_id` | uuid |
| `network_id` | uuid |
| `accepting_new_patients` | text |
| `location_ref` | text |
| `raw_specialty_code` | text |
| `source_last_updated` | timestamp with time zone |
| `ingested_at` | timestamp with time zone |
| `raw_resource` | jsonb |
| `data_completeness` | text |

### `payer_unmatched_npis`

Providers a payer names that our book has never heard of — the discovery pool (NYS-40; the big pool still lives in .harvest files).

**Table** · 808 rows · defined in sql/013

**Joins:** `payer_sources` (`payer_source_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `npi` | text |
| `payer_source_id` | uuid |
| `name` | text |
| `network_name` | text |
| `raw_specialty_code` | text |
| `accepting_new_patients` | text |
| `first_seen_at` | timestamp with time zone |
| `last_seen_at` | timestamp with time zone |
| `raw_resource` | jsonb |

### `fhir_locations`

Practice sites from payer FHIR directories (national, not NY-only) — the addresses behind a network listing.

**Table** · 44,916 rows · defined in sql/029

**Joins:** `fhir_healthcare_services` (`location`) · `provider_network_participation`

| column | type |
| --- | --- |
| `id` | text |
| `name` | text |
| `phone` | text |
| `address` | text |
| `city` | text |
| `state` | text |
| `zip` | text |
| `lat` | double precision |
| `lng` | double precision |
| `accessibility` | text[] |
| `hours` | jsonb |
| `last_updated` | timestamp with time zone |
| `source` | text |
| `raw` | jsonb |
| `ingested_at` | timestamp with time zone |

### `fhir_organizations`

Org entities from payer FHIR directories (groups, facilities), as the payer models them.

**Table** · 5,851 rows · defined in sql/029

**Joins:** `fhir_org_affiliations` (`organization`) · `org_affiliations`

| column | type |
| --- | --- |
| `id` | text |
| `npi` | text |
| `name` | text |
| `org_type` | text |
| `is_network` | boolean |
| `taxonomy` | text |
| `phone` | text |
| `address` | text |
| `city` | text |
| `state` | text |
| `zip` | text |
| `last_updated` | timestamp with time zone |
| `source` | text |
| `raw` | jsonb |
| `ingested_at` | timestamp with time zone |

### `fhir_org_affiliations`

How a payer wires its orgs to its networks (org ↔ network/org relationships as published).

**Table** · 2,664 rows · defined in sql/029

**Joins:** `fhir_organizations` (`organization`) · `payer_networks`

| column | type |
| --- | --- |
| `id` | text |
| `primary_org_ref` | text |
| `primary_org_display` | text |
| `participating_org_ref` | text |
| `participating_display` | text |
| `network_refs` | text[] |
| `network_names` | text[] |
| `location_refs` | text[] |
| `service_refs` | text[] |
| `specialties` | text[] |
| `last_updated` | timestamp with time zone |
| `source` | text |
| `raw` | jsonb |
| `ingested_at` | timestamp with time zone |

### `fhir_healthcare_services`

What a payer says is offered where — the payer's own service taxonomy, not ours.

**Table** · 56,646 rows · defined in sql/029

**Joins:** `fhir_locations` (`location`)

| column | type |
| --- | --- |
| `id` | text |
| `org_ref` | text |
| `location_refs` | text[] |
| `name` | text |
| `categories` | text[] |
| `service_types` | text[] |
| `specialties` | text[] |
| `delivery_methods` | text[] |
| `telehealth` | boolean |
| `languages` | text[] |
| `last_updated` | timestamp with time zone |
| `source` | text |
| `raw` | jsonb |
| `ingested_at` | timestamp with time zone |

### `fhir_insurance_plans`

The InsurancePlan/product objects payers publish alongside their network labels.

**Table** · 809 rows · defined in sql/029

**Joins:** `payer_networks`

| column | type |
| --- | --- |
| `id` | text |
| `plan_key` | text |
| `name` | text |
| `plan_type` | text |
| `owned_by_ref` | text |
| `coverage_area` | text[] |
| `network_refs` | text[] |
| `last_updated` | timestamp with time zone |
| `source` | text |
| `raw` | jsonb |
| `ingested_at` | timestamp with time zone |

### `org_affiliations`

Payer-attested provider↔org links pulled from the PractitionerRole.organization reference in Anthem/Humana Plan-Net resources (display = the real org name, e.g. 'Lifestance Psychology'). Extracted idempotently from provider_network_participation.raw_resource by scripts/orgs-sync.mjs; re-run after every FHIR harvest.

**Table** · 163,523 rows · defined in sql/025

**Joins:** `directory_providers` (`npi`) · `fhir_organizations` · `payer_sources` (`payer_source_id`) · `tin_registry`

| column | type |
| --- | --- |
| `id` | uuid |
| `npi` | text |
| `payer_source_id` | uuid |
| `org_ref` | text |
| `org_display` | text |
| `first_seen` | date |
| `last_seen` | date |

## Rates (Transparency-in-Coverage)

_What payers actually pay, from their own published machine-readable files._

### `provider_rate_signals`

The rate corpus. One row per (npi × tin × payer × plan/network × CPT × rate × POS × file date). A rate proves a CONTRACT as of a date — never patient cost, never standalone membership.

**Table** · ≈ 16,470,526 rows · defined in sql/017 · powers `/rates`

**Joins:** `cpt_codes` · `directory_providers` (`npi`) · `org_tin_rate_summary` (`tin`) · `payer_rate_totals` (`payer`) · `plans` (`source_file`) · `provider_rate_summary` (`npi`) · `rate_bands_checked_payers` (`payer`) · `rate_bands_license_summary` (`billing_code`) · `rate_bands_payer_summary` (`payer`) · `rate_table_mv` (`tin`) · `tin_registry` (`tin`)

| column | type |
| --- | --- |
| `id` | uuid |
| `npi` | text |
| `tin` | text |
| `payer` | text |
| `plan_or_network` | text |
| `billing_code` | text |
| `negotiated_rate` | numeric(10,2) |
| `billing_class` | text |
| `negotiated_type` | text |
| `place_of_service` | text |
| `source_file` | text |
| `file_date` | date |
| `as_of` | date |
| `ingested_at` | timestamp with time zone |

### `provider_rate_summary`

Per-NPI rate rollup (matview) — what each provider is paid, precomputed so /recruiting stays fast.

**Matview** · 44,093 rows · defined in sql/021 · powers `/recruiting` · refreshed nightly by the 04:12 cron

**Joins:** `directory_providers` (`npi`) · `provider_rate_signals` (`npi`)

| column | type |
| --- | --- |
| `npi` | text |
| `payer_count` | integer |
| `best_90791` | numeric |
| `best_90834` | numeric |
| `best_90837` | numeric |
| `best_90853` | numeric |
| `best_99214` | numeric |
| `as_of` | date |

### `provider_participation_summary`

Per-NPI network aggregate (matview) feeding the directory Accepting/Network sort; refresh with the other matviews after every ingest.

**Matview** · 39,701 rows · defined in sql/023 · powers `/directory` · refreshed nightly by the 04:12 cron

**Joins:** `directory_providers` (`npi`) · `provider_network_participation` (`npi`)

| column | type |
| --- | --- |
| `npi` | text |
| `any_accepting` | boolean |
| `network_count` | bigint |
| `payer_count` | bigint |
| `latest_source_update` | timestamp with time zone |

### `rate_table_mv`

The published rate table (matview): one row per (payer, TIN) with per-code rates + clinician counts — precomputed, which is why the public page loads instantly.

**Matview** · 38,984 rows · defined in sql/027 · powers `/published-rates` · refreshed nightly by the 04:12 cron

**Joins:** `org_tin_rosters` (`tin`) · `provider_rate_signals` (`tin`) · `rate_table_child_mv` (`tin`) · `tin_registry` (`tin`)

| column | type |
| --- | --- |
| `tin` | text |
| `payer` | text |
| `display_name` | text |
| `entity_kind` | text |
| `credential` | text |
| `credential_norm` | text |
| `profession` | text |
| `primary_taxonomy` | text |
| `county` | text |
| `npis` | text[] |
| `n_clinicians` | integer |
| `n_leaves` | integer |
| `c90791` | numeric(10,2) |
| `c90834` | numeric(10,2) |
| `c90837` | numeric(10,2) |
| `c90853` | numeric(10,2) |
| `c99214` | numeric(10,2) |
| `n90791` | integer |
| `n90834` | integer |
| `n90837` | integer |
| `n90853` | integer |
| `n99214` | integer |
| `as_of` | date |

### `rate_table_child_mv`

Per-network/setting detail rows under each rate_table_mv parent (facility vs office is a real price difference).

**Matview** · 144,865 rows · defined in sql/032 · powers `/published-rates` · refreshed nightly by the 04:12 cron

**Joins:** `rate_table_mv` (`tin`)

| column | type |
| --- | --- |
| `tin` | text |
| `payer` | text |
| `npi` | text |
| `network` | text |
| `setting` | text |
| `display_name` | text |
| `credential` | text |
| `credential_norm` | text |
| `profession` | text |
| `city` | text |
| `county` | text |
| `c90791` | numeric(10,2) |
| `c90834` | numeric(10,2) |
| `c90837` | numeric(10,2) |
| `c90853` | numeric(10,2) |
| `c99214` | numeric(10,2) |
| `n90791` | integer |
| `n90834` | integer |
| `n90837` | integer |
| `n90853` | integer |
| `n99214` | integer |
| `as_of` | date |

### `org_tin_rosters`

Per-TIN clinician roster (matview): who bills under each org — the roster behind an org page.

**Matview** · 165,361 rows · defined in sql/025 · powers `/orgs` · refreshed nightly by the 04:12 cron

**Joins:** `directory_providers` (`npi`) · `org_tin_rate_summary` (`tin`) · `organizations` (`npi`) · `rate_table_mv` (`tin`) · `tin_registry` (`tin`)

| column | type |
| --- | --- |
| `tin` | text |
| `npi` | text |
| `payer_count` | integer |
| `payers` | text[] |
| `rate_rows` | integer |
| `last_file_date` | date |
| `as_of` | date |

### `org_tin_rate_summary`

Per-(TIN, payer, code) rate percentiles (matview) — what each org is paid at p25/median/p75.

**Matview** · ≈ 941,014 rows · defined in sql/025 · powers `/orgs` · refreshed nightly by the 04:12 cron

**Joins:** `org_tin_rosters` (`tin`) · `provider_rate_signals` (`tin`)

| column | type |
| --- | --- |
| `tin` | text |
| `payer` | text |
| `billing_code` | text |
| `npis` | integer |
| `rate_points` | integer |
| `distinct_rates` | integer |
| `p25` | double precision |
| `median` | double precision |
| `p75` | double precision |
| `min_rate` | double precision |
| `max_rate` | double precision |
| `as_of` | date |

### `tin_registry`

TIN → business-name registry: the naming layer behind every org display name. Without it every org reads as a 9-digit number (NYS-27 backfill has run).

**Table** · 29,795 rows · defined in sql/019 · powers `/orgs`

**Joins:** `form5500_filings` · `nppes_organizations` · `nppes_other_names` · `org_affiliations` · `org_tin_rosters` (`tin`) · `organizations` (`tin`) · `provider_rate_signals` (`tin`) · `rate_table_mv` (`tin`)

| column | type |
| --- | --- |
| `tin_norm` | text |
| `business_name` | text |
| `source` | text |
| `first_seen` | date |
| `last_seen` | date |

### `payer_rate_totals`

Per-payer rate totals (matview) — the small denominator table the admin/observatory reads instead of scanning the multi-million-row corpus.

**Matview** · 36 rows · defined in sql/026 · powers `/workspace` · refreshed nightly by the 04:12 cron

**Joins:** `provider_rate_signals` (`payer`) · `rate_bands_payer_summary` (`payer`)

| column | type |
| --- | --- |
| `payer` | text |
| `npis` | integer |
| `rows` | integer |
| `latest` | date |

### `rate_bands_license_summary`

Rate bands by license/profession (matview) — the p25/median/p75 distribution per profession that /rates Bands renders. Part of the sql/024 precompute that took /rates from 20-32s to <0.3s.

**Matview** · 1,658 rows · defined in sql/024 · powers `/rates` · refreshed nightly by the 04:12 cron

**Joins:** `provider_rate_signals` (`billing_code`)

| column | type |
| --- | --- |
| `payer` | text |
| `billing_code` | text |
| `license` | text |
| `network` | text |
| `npis` | integer |
| `p25` | double precision |
| `median` | double precision |
| `p75` | double precision |
| `as_of` | date |

### `rate_bands_payer_summary`

Rate bands by payer (matview) — per-payer percentile bands over the priced codes.

**Matview** · 189 rows · defined in sql/024 · powers `/rates` · refreshed nightly by the 04:12 cron

**Joins:** `payer_rate_totals` (`payer`) · `provider_rate_signals` (`payer`)

| column | type |
| --- | --- |
| `payer` | text |
| `billing_code` | text |
| `npis` | integer |
| `p25` | double precision |
| `median` | double precision |
| `p75` | double precision |
| `as_of` | date |

### `rate_bands_checked_payers`

The set of payers with enough rows to publish bands (matview) — gates which payers /rates Bands will show.

**Matview** · 14 rows · defined in sql/024 · powers `/rates` · refreshed nightly by the 04:12 cron

**Joins:** `provider_rate_signals` (`payer`)

| column | type |
| --- | --- |
| `payer` | text |

## Medicare benchmark (CMS PFS)

_What Medicare itself pays per NY locality — the yardstick every negotiated rate is measured against._

### `medicare_benchmark_ny` · _not yet loaded_

The computed benchmark: what Medicare allows per (NY locality × code), from cms_rvu × cms_gpci × the conversion factor. The denominator every '% of Medicare' number divides by.
Defined in sql/033; the loader hasn't populated it in this database yet.

### `cms_rvu`

PFS Relative Value File: work/PE/MP RVUs per code × modifier. Deliberately carries NO descriptor column — that text is AMA-licensed to CMS, not to us.

**Table** · 19,356 rows · defined in sql/033

**Joins:** `cpt_codes` (`code`)

| column | type |
| --- | --- |
| `hcpcs_code` | text |
| `modifier` | text |
| `status_code` | text |
| `work_rvu` | numeric(9,2) |
| `pe_rvu_nonfacility` | numeric(9,2) |
| `pe_rvu_facility` | numeric(9,2) |
| `mp_rvu` | numeric(9,2) |
| `total_rvu_nonfacility` | numeric(9,2) |
| `total_rvu_facility` | numeric(9,2) |
| `global_period` | text |
| `source_release` | text |
| `effective_year` | integer |
| `updated_at` | timestamp with time zone |

### `cms_gpci`

Geographic practice cost indices, 109 localities. NY has five (Manhattan · NYC Suburbs/LI · Poughkeepsie · Queens · Rest of NY) — the geography multiplier that makes the same code pay differently in Manhattan and Buffalo.

**Table** · 109 rows · defined in sql/033

| column | type |
| --- | --- |
| `state` | text |
| `locality_code` | text |
| `locality_name` | text |
| `mac` | text |
| `gpci_work` | numeric(7,3) |
| `gpci_pe` | numeric(7,3) |
| `gpci_mp` | numeric(7,3) |
| `source_release` | text |
| `effective_year` | integer |
| `updated_at` | timestamp with time zone |

### `cms_pfs_config`

PFS scalars — the dollars-per-RVU conversion factors that turn relative units into money. CY2026 ships two ($33.4009 non-APM, which the benchmark uses, and $33.5675 for qualifying APM participants).

**Table** · 2 rows · defined in sql/033

| column | type |
| --- | --- |
| `key` | text |
| `value` | numeric |
| `source` | text |
| `effective_year` | integer |
| `updated_at` | timestamp with time zone |

## Employers & plans

_Which employer buys which plan — the demand side of the rate corpus, and the plan-registry assembly._

### `employers`

Plan sponsors from the Aetna ToC (EIN-keyed) — the employers behind the plans we hold rates for.

**Table** · 5,572 rows · defined in sql/020 · powers `/plans`

**Joins:** `form5500_filings` (`ein`) · `nppes_organizations` (`ein`) · `plans`

| column | type |
| --- | --- |
| `ein` | text |
| `name` | text |
| `market_type` | text |
| `state` | text |
| `self_funded` | boolean |
| `plan_count` | integer |
| `source` | text |
| `first_seen` | date |
| `last_seen` | date |

### `plans`

Employer plans; each points at a network product. The plan catalog (display cleanup NYS-44).

**Table** · 20,542 rows · defined in sql/020 · powers `/plans`

**Joins:** `employers` · `provider_rate_signals` (`source_file`)

| column | type |
| --- | --- |
| `id` | uuid |
| `employer_ein` | text |
| `plan_name` | text |
| `network_product` | text |
| `reporting_entity` | text |
| `self_funded` | boolean |
| `file_schema` | text |
| `source_file` | text |
| `file_date` | date |
| `source` | text |
| `first_seen` | date |
| `last_seen` | date |

### `form5500_filings`

DOL/EFAST2 Form 5500 health/welfare filings — the de-facto plan registry (the HPID never shipped). EIN-keyed, joins straight onto employers/plans/tin_registry (NYS-101).

**Table** · 150,635 rows · defined in sql/040

**Joins:** `employers` (`ein`) · `form5500_schedule_a` (`ein`) · `tin_registry`

| column | type |
| --- | --- |
| `ein` | text |
| `plan_number` | text |
| `plan_year` | integer |
| `ack_id` | text |
| `plan_name` | text |
| `sponsor_name` | text |
| `sponsor_dba` | text |
| `sponsor_city` | text |
| `sponsor_state` | text |
| `sponsor_zip` | text |
| `business_code` | text |
| `participants` | integer |
| `active_participants` | integer |
| `welfare_codes` | text |
| `has_health_code` | boolean |
| `funding_insurance` | boolean |
| `funding_trust` | boolean |
| `funding_gen_asset` | boolean |
| `benefit_insurance` | boolean |
| `benefit_trust` | boolean |
| `benefit_gen_asset` | boolean |
| `num_sch_a` | integer |
| `collective_bargain` | boolean |
| `final_filing` | boolean |
| `date_received` | date |
| `form_year` | integer |
| `loaded_at` | timestamp with time zone |

### `form5500_schedule_a`

Schedule A insurance-contract rows under each 5500 filing — the named carrier + covered-lives behind a plan.

**Table** · ≈ 588,640 rows · defined in sql/040

**Joins:** `form5500_filings` (`ein`)

| column | type |
| --- | --- |
| `ack_id` | text |
| `form_id` | integer |
| `ein` | text |
| `plan_number` | text |
| `plan_year` | integer |
| `carrier_name` | text |
| `carrier_ein` | text |
| `carrier_naic` | text |
| `contract_number` | text |
| `covered_lives` | integer |
| `policy_from` | date |
| `policy_to` | date |
| `broker_comm_total` | numeric |
| `broker_fees_total` | numeric |
| `benefit_health` | boolean |
| `benefit_dental` | boolean |
| `benefit_vision` | boolean |
| `benefit_drug` | boolean |
| `benefit_life` | boolean |
| `benefit_stop_loss` | boolean |
| `benefit_hmo` | boolean |
| `benefit_ppo` | boolean |
| `benefit_indemnity` | boolean |
| `benefit_other_text` | text |
| `premium_earned` | numeric |
| `premium_received` | numeric |
| `claims_paid` | numeric |
| `form_year` | integer |
| `loaded_at` | timestamp with time zone |

## Maintenance & platform

_The ledger and notification tables the automation writes to._

### `sync_runs`

The maintenance ledger: one row per run of the nightly matview cron ('daily') and the harvest runner ('harvest:<id>'). The /workspace sync-health card + run-history table read it.

**Table** · 93 rows · defined in sql/035 · powers `/workspace`

| column | type |
| --- | --- |
| `id` | uuid |
| `job` | text |
| `status` | text |
| `trigger` | text |
| `started_at` | timestamp with time zone |
| `finished_at` | timestamp with time zone |
| `duration_ms` | integer |
| `steps` | jsonb |
| `error` | text |
| `created_at` | timestamp with time zone |
| `timeout_ms` | integer |

### `notifications`

Per-user in-app notifications (v1 kind: sync_failure) — the rows behind the TopBar bell (NYS-100). No PHI: pipeline rows name jobs and tables only.

**Table** · 9 rows · defined in sql/038

**Joins:** `users` (`user_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid |
| `kind` | text |
| `title` | text |
| `body` | text |
| `href` | text |
| `read_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |

## Practice management (EHR)

_The practice's own records. PHI — the atlas prints structure and counts, never contents._

### `users`

Login accounts: staff (admin/practitioner) and client portal users; soft-deleted via deleted_at.

**Table** · 7 rows · defined in sql/001

**Joins:** `appointments` · `clients` · `notifications` (`user_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `role` | text |
| `name` | text |
| `email` | text |
| `password_hash` | text |
| `avatar_hue` | text |
| `phone` | text |
| `timezone` | text |
| `deleted_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |
| `slug` | text |

### `clients`

Patient/client records; user_id links an optional portal login. PHI.

**Table** · 18 rows · defined in sql/001

**Joins:** `appointments` (`client_id`) · `files` (`client_id`) · `insurance_policies` (`client_id`) · `invoices` (`client_id`) · `messages` (`client_id`) · `notes` (`client_id`) · `users`

| column | type |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid |
| `first_name` | text |
| `last_name` | text |
| `dob` | date |
| `email` | text |
| `phone` | text |
| `address` | text |
| `gender` | text |
| `pronouns` | text |
| `status` | text |
| `tags` | text[] |
| `primary_practitioner_id` | uuid |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |
| `photon_patient_id` | text |

### `appointments`

Calendar events tying client + practitioner + service + location with a status lifecycle.

**Table** · 186 rows · defined in sql/001

**Joins:** `clients` (`client_id`) · `users`

| column | type |
| --- | --- |
| `id` | uuid |
| `client_id` | uuid |
| `practitioner_id` | uuid |
| `service_id` | uuid |
| `location_id` | uuid |
| `starts_at` | timestamp with time zone |
| `ends_at` | timestamp with time zone |
| `status` | text |
| `video_room` | text |
| `booked_via` | text |
| `notes_brief` | text |
| `cancelled_reason` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `invoices`

Client invoices with human numbers (INV-2026-0001) and a draft→sent→paid/overdue/void lifecycle.

**Table** · 12 rows · defined in sql/001

**Joins:** `clients` (`client_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `number` | text |
| `client_id` | uuid |
| `appointment_id` | uuid |
| `status` | text |
| `issued_on` | date |
| `due_on` | date |
| `subtotal_cents` | integer |
| `tax_cents` | integer |
| `total_cents` | integer |
| `stripe_checkout_id` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `notes`

Clinical documentation (soft-deleted, sign-and-lock lifecycle). PHI.

**Table** · 32 rows · defined in sql/001

**Joins:** `clients` (`client_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `client_id` | uuid |
| `appointment_id` | uuid |
| `author_id` | uuid |
| `template` | text |
| `title` | text |
| `body_md` | text |
| `status` | text |
| `signed_at` | timestamp with time zone |
| `deleted_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `messages`

Individual secure messages within a thread; read_at marks recipient receipt. PHI.

**Table** · 16 rows · defined in sql/001

**Joins:** `clients` (`client_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `thread_id` | uuid |
| `sender_id` | uuid |
| `body` | text |
| `read_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `files`

Client documents: portal uploads, rendered form PDFs, generated superbills. PHI.

**Table** · 4 rows · defined in sql/001

**Joins:** `clients` (`client_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `client_id` | uuid |
| `uploader_id` | uuid |
| `name` | text |
| `mime` | text |
| `size_bytes` | bigint |
| `url` | text |
| `kind` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |
| `storage` | text |
| `provenance` | text |

### `payers`

Insurance companies for BILLING (name + clearinghouse code) — distinct from payer_sources (the directory harvest side).

**Table** · 3 rows · defined in sql/001

**Joins:** `insurance_policies` (`payer_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `name` | text |
| `payer_code` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `insurance_policies`

A client's coverage with a payer (member/group ids, verification status, copay). PHI.

**Table** · 8 rows · defined in sql/001

**Joins:** `clients` (`client_id`) · `payers` (`payer_id`)

| column | type |
| --- | --- |
| `id` | uuid |
| `client_id` | uuid |
| `payer_id` | uuid |
| `member_id` | text |
| `group_id` | text |
| `kind` | text |
| `status` | text |
| `copay_cents` | integer |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

## Unmapped tables

_In the database but not yet in the atlas metadata (mirror `lib/repos/admin.ts`). Structure + count only._

### `audit_events`

**Table** · 2,960 rows · 7 columns

| column | type |
| --- | --- |
| `id` | bigint |
| `actor_id` | uuid |
| `action` | text |
| `entity` | text |
| `entity_id` | text |
| `meta` | jsonb |
| `at` | timestamp with time zone |

### `availability`

**Table** · 30 rows · 7 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `practitioner_id` | uuid |
| `weekday` | integer |
| `start_time` | time without time zone |
| `end_time` | time without time zone |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `canvas_maps`

**Table** · 0 rows · 6 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `owner_id` | text |
| `name` | text |
| `doc` | jsonb |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `dfs_insurers`

**Table** · 242 rows · 10 columns

| column | type |
| --- | --- |
| `cpat_num` | integer |
| `naic` | text |
| `name` | text |
| `org_type` | text |
| `domicile` | text |
| `group_code` | text |
| `group_name` | text |
| `fein` | text |
| `website` | text |
| `loaded_at` | timestamp with time zone |

### `form5500_sf_filings`

**Table** · 52,375 rows · 19 columns

| column | type |
| --- | --- |
| `ein` | text |
| `plan_number` | text |
| `plan_year` | integer |
| `ack_id` | text |
| `plan_name` | text |
| `sponsor_name` | text |
| `sponsor_dba` | text |
| `sponsor_city` | text |
| `sponsor_state` | text |
| `sponsor_zip` | text |
| `business_code` | text |
| `participants` | integer |
| `welfare_codes` | text |
| `pension_codes` | text |
| `has_health_code` | boolean |
| `final_filing` | boolean |
| `date_received` | date |
| `form_year` | integer |
| `loaded_at` | timestamp with time zone |

### `form_responses`

**Table** · 3 rows · 8 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `form_id` | uuid |
| `client_id` | uuid |
| `answers` | jsonb |
| `status` | text |
| `submitted_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `forms`

**Table** · 14 rows · 7 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `title` | text |
| `description` | text |
| `schema` | jsonb |
| `status` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `insurer_aliases`

**Table** · 101 rows · 4 columns

| column | type |
| --- | --- |
| `source` | text |
| `label` | text |
| `insurer_id` | text |
| `role` | text |

### `insurer_companies`

**Table** · 37 rows · 10 columns

| column | type |
| --- | --- |
| `naic` | text |
| `insurer_id` | text |
| `name` | text |
| `ein` | text |
| `license_type` | text |
| `group_code` | text |
| `group_name` | text |
| `domicile` | text |
| `source` | text |
| `loaded_at` | timestamp with time zone |

### `invoice_items`

**Table** · 14 rows · 8 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `invoice_id` | uuid |
| `description` | text |
| `qty` | integer |
| `unit_cents` | integer |
| `amount_cents` | integer |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `lead_reports`

**Table** · 18 rows · 4 columns

| column | type |
| --- | --- |
| `report_date` | date |
| `title` | text |
| `body_md` | text |
| `updated_at` | timestamp with time zone |

### `locations`

**Table** · 2 rows · 6 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `name` | text |
| `address` | text |
| `kind` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `network_aliases`

**Table** · 89 rows · 4 columns

| column | type |
| --- | --- |
| `source` | text |
| `payer_label` | text |
| `network_label` | text |
| `network_id` | text |

### `note_amendments`

**Table** · 4 rows · 5 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `note_id` | uuid |
| `author_id` | uuid |
| `body_md` | text |
| `created_at` | timestamp with time zone |

### `note_templates`

**Table** · 3 rows · 7 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `name` | text |
| `template` | text |
| `body_md` | text |
| `is_builtin` | boolean |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `nppes_endpoints`

**Table** · ≈ 556,512 rows · 15 columns

| column | type |
| --- | --- |
| `npi` | text |
| `endpoint_type` | text |
| `endpoint_type_description` | text |
| `endpoint` | text |
| `affiliation` | text |
| `endpoint_description` | text |
| `affiliation_lbn` | text |
| `use_code` | text |
| `use_description` | text |
| `content_type` | text |
| `content_description` | text |
| `aff_address1` | text |
| `aff_city` | text |
| `aff_state` | text |
| `aff_postal` | text |

### `nppes_sync_log`

**Table** · 2 rows · 4 columns

| column | type |
| --- | --- |
| `file_name` | text |
| `kind` | text |
| `rows_applied` | integer |
| `applied_at` | timestamp with time zone |

### `org_network_rates`

**Matview** · ≈ 1,163,331 rows · 10 columns

| column | type |
| --- | --- |
| `network_id` | text |
| `tin` | text |
| `billing_code` | text |
| `n_npis` | integer |
| `n_rates` | integer |
| `rate_single` | numeric |
| `rate_min` | numeric |
| `rate_max` | numeric |
| `as_of` | date |
| `file_date` | date |

### `org_tin_npi_rates`

**Matview** · ≈ 1,765,261 rows · 6 columns

| column | type |
| --- | --- |
| `tin` | text |
| `npi` | text |
| `billing_code` | text |
| `distinct_rates` | integer |
| `min_rate` | double precision |
| `max_rate` | double precision |

### `password_tokens`

**Table** · 0 rows · 6 columns

| column | type |
| --- | --- |
| `token` | text |
| `user_id` | uuid |
| `purpose` | text |
| `expires_at` | timestamp with time zone |
| `used_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |

### `payer_network_map`

**Table** · 1,133 rows · 5 columns

| column | type |
| --- | --- |
| `payer_network_id` | uuid |
| `scope` | text |
| `network_id` | text |
| `rule` | text |
| `mapped_at` | timestamp with time zone |

### `payments`

**Table** · 9 rows · 8 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `invoice_id` | uuid |
| `amount_cents` | integer |
| `method` | text |
| `stripe_payment_intent` | text |
| `paid_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `provider_affiliation_attestations`

**Table** · 0 rows · 7 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `npi` | text |
| `tin` | text |
| `status` | text |
| `attested_month` | date |
| `note` | text |
| `created_at` | timestamp with time zone |

### `provider_applications`

**Table** · 0 rows · 10 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `name` | text |
| `email` | text |
| `phone` | text |
| `license_type` | text |
| `state` | text |
| `npi` | text |
| `message` | text |
| `status` | text |
| `created_at` | timestamp with time zone |

### `provider_leads`

**Table** · 0 rows · 9 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `provider_id` | uuid |
| `name` | text |
| `email` | text |
| `phone` | text |
| `payer` | text |
| `note` | text |
| `status` | text |
| `created_at` | timestamp with time zone |

### `provider_merge_map`

**Table** · 16,934 rows · 6 columns

| column | type |
| --- | --- |
| `merged_id` | uuid |
| `surviving_id` | uuid |
| `npi` | text |
| `rule` | text |
| `confidence` | numeric(3,2) |
| `merged_at` | timestamp with time zone |

### `provider_profiles`

**Table** · 5 rows · 25 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid |
| `role_title` | text |
| `pronouns` | text |
| `years_experience` | integer |
| `intro_md` | text |
| `approach_md` | text |
| `expect_md` | text |
| `identify_as` | text |
| `style_is` | text |
| `training` | text |
| `license_type` | text |
| `licensed_in` | text[] |
| `insurance_accepted` | text[] |
| `top_specialties` | text[] |
| `more_specialties` | text[] |
| `therapy_methods` | text[] |
| `care_types` | text[] |
| `ages_served` | text[] |
| `languages` | text[] |
| `location_label` | text |
| `nearby_areas` | text[] |
| `illustration_key` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `rate_service_rows_mv`

**Matview** · ≈ 1,091,544 rows · 17 columns

| column | type |
| --- | --- |
| `payer` | text |
| `tin` | text |
| `npi` | text |
| `network` | text |
| `setting` | text |
| `billing_code` | text |
| `rate` | numeric |
| `n_rates` | integer |
| `min_rate` | numeric |
| `max_rate` | numeric |
| `display_name` | text |
| `credential` | text |
| `profession` | text |
| `city` | text |
| `county` | text |
| `as_of` | date |
| `search_text` | text |

### `referrals`

**Table** · 0 rows · 8 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `client_id` | uuid |
| `provider_id` | uuid |
| `program_id` | uuid |
| `reason` | text |
| `status` | text |
| `created_by` | uuid |
| `created_at` | timestamp with time zone |

### `schema_drafts`

**Table** · 1 rows · 6 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `owner_id` | text |
| `name` | text |
| `doc` | jsonb |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `services`

**Table** · 5 rows · 9 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `name` | text |
| `duration_min` | integer |
| `price_cents` | integer |
| `color` | text |
| `telehealth` | boolean |
| `active` | boolean |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `sessions`

**Table** · 719 rows · 4 columns

| column | type |
| --- | --- |
| `token` | text |
| `user_id` | uuid |
| `expires_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |

### `stripe_connect_accounts`

**Table** · 1 rows · 11 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `user_id` | uuid |
| `org_tin` | text |
| `stripe_account_id` | text |
| `business_type` | text |
| `charges_enabled` | boolean |
| `payouts_enabled` | boolean |
| `details_submitted` | boolean |
| `requirements_due` | jsonb |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `stripe_events`

**Table** · 16 rows · 7 columns

| column | type |
| --- | --- |
| `id` | text |
| `type` | text |
| `stripe_account_id` | text |
| `payload` | jsonb |
| `received_at` | timestamp with time zone |
| `processed_at` | timestamp with time zone |
| `error` | text |

### `stripe_payment_splits`

**Table** · 0 rows · 10 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `invoice_id` | uuid |
| `payment_intent_id` | text |
| `checkout_session_id` | text |
| `destination_account_id` | text |
| `amount_cents` | integer |
| `application_fee_cents` | integer |
| `currency` | text |
| `transfer_id` | text |
| `created_at` | timestamp with time zone |

### `threads`

**Table** · 9 rows · 7 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `client_id` | uuid |
| `subject` | text |
| `status` | text |
| `last_message_at` | timestamp with time zone |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `transcripts`

**Table** · 2 rows · 7 columns

| column | type |
| --- | --- |
| `id` | uuid |
| `appointment_id` | uuid |
| `segments` | jsonb |
| `summary_md` | text |
| `status` | text |
| `created_at` | timestamp with time zone |
| `updated_at` | timestamp with time zone |

### `uhc_census_matches`

**Table** · 2,589 rows · 5 columns

| column | type |
| --- | --- |
| `name_raw` | text |
| `ein` | text |
| `sponsor_name` | text |
| `method` | text |
| `matched_at` | timestamp with time zone |

### `uhc_employer_census`

**Table** · 67,111 rows · 3 columns

| column | type |
| --- | --- |
| `name_raw` | text |
| `name_norm` | text |
| `loaded_at` | timestamp with time zone |

## Matview lineage

The derived views the app reads instead of the base tables. The nightly 04:12 cron (`app/api/cron/daily/route.ts`) rebuilds the ones marked ✓, `CONCURRENTLY`, in dependency order.

| Matview | Defined in | Rebuilt by nightly cron | Reads |
| --- | --- | --- | --- |
| `org_network_rates` | — | ✓ | — |
| `org_tin_npi_rates` | — | on ingest | — |
| `org_tin_rate_summary` | sql/025 | ✓ | `org_tin_rosters`, `provider_rate_signals` |
| `org_tin_rosters` | sql/025 | ✓ | `directory_providers`, `org_tin_rate_summary`, `organizations`, `rate_table_mv` |
| `payer_rate_totals` | sql/026 | ✓ | `provider_rate_signals`, `rate_bands_payer_summary` |
| `provider_participation_summary` | sql/023 | ✓ | `directory_providers`, `provider_network_participation` |
| `provider_rate_summary` | sql/021 | ✓ | `directory_providers`, `provider_rate_signals` |
| `rate_bands_checked_payers` | sql/024 | ✓ | `provider_rate_signals` |
| `rate_bands_license_summary` | sql/024 | ✓ | `provider_rate_signals` |
| `rate_bands_payer_summary` | sql/024 | ✓ | `payer_rate_totals`, `provider_rate_signals` |
| `rate_service_rows_mv` | — | ✓ | — |
| `rate_table_child_mv` | sql/032 | ✓ | `rate_table_mv` |
| `rate_table_mv` | sql/027 | ✓ | `org_tin_rosters`, `provider_rate_signals`, `rate_table_child_mv`, `tin_registry` |
