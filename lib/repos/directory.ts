// Mixed domain: the directory tables are reference data via `sql`; referrals
// carries a client_id and lives in the HIPAA project via `sqlPhi`.
import { hasDb, sql, sqlPhi } from "@/lib/db";
import { isoDateOnly, isoDateTime } from "@/lib/format";
import { mockId, mockStore } from "@/lib/mock";
import "@/lib/mock/directory";
import { mockParticipation } from "@/lib/mock/networks";
import { PROGRAM_FAMILIES, familyForType, typesForFamily, type ProgramFamily } from "@/lib/program-taxonomy";
import type {
  DirectoryProgram,
  DirectoryProvider,
  ProviderApplication,
  ProviderLead,
  Referral,
  ReferralStatus,
} from "@/lib/types";

// External provider directory repo — search over the NY open-data tables
// (directory_providers, directory_programs) plus referrals + provider
// applications. Dual-mode: hasDb ? sql : mockStore(). Search is paginated
// server-side; dynamic WHERE clauses use sql.query(text, params).

export const PAGE_SIZE = 25;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ── row mappers ────────────────────────────────────────────────────────────

type ProviderRow = {
  id: string;
  npi: string | null;
  name: string;
  slug: string | null;
  profession: string | null;
  license_no: string | null;
  taxonomy: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  source: DirectoryProvider["source"];
  source_id: string;
  updated_at: string | Date;
  // NPPES enrichment (null on Medicaid rows).
  primary_taxonomy?: string | null;
  subspecialty?: string | null;
  taxonomies?: string[] | null;
  focus?: string[] | null;
  credential?: string | null;
  gender?: string | null;
  license_state?: string | null;
  entity_type?: string | null;
  is_sole_proprietor?: boolean | null;
  parent_org?: string | null;
  enumeration_date?: string | Date | null;
  deactivated_at?: string | Date | null;
};

function toProvider(r: ProviderRow): DirectoryProvider {
  return {
    id: r.id,
    npi: r.npi,
    name: r.name,
    slug: r.slug ?? null,
    profession: r.profession,
    licenseNo: r.license_no,
    taxonomy: r.taxonomy,
    address: r.address,
    city: r.city,
    county: r.county,
    zip: r.zip,
    phone: r.phone,
    source: r.source,
    sourceId: r.source_id,
    updatedAt: isoDateTime(r.updated_at),
    primaryTaxonomy: r.primary_taxonomy ?? null,
    subspecialty: r.subspecialty ?? null,
    taxonomies: r.taxonomies ?? null,
    focus: r.focus ?? [],
    credential: r.credential ?? null,
    gender: r.gender ?? null,
    licenseState: r.license_state ?? null,
    entityType: r.entity_type ?? null,
    isSoleProprietor: r.is_sole_proprietor ?? null,
    parentOrg: r.parent_org ?? null,
    enumerationDate: r.enumeration_date ? isoDateOnly(r.enumeration_date) : null,
    deactivatedAt: r.deactivated_at ? isoDateOnly(r.deactivated_at) : null,
  };
}

// Canonical discipline vocabulary (NPPES labels). Medicaid's raw uppercase
// categories are normalized to these (sql/007 + the ingest map). Grouped for
// the nav's therapist/psychiatrist split and the "prescriber" pathway.
const PRESCRIBER_PROFS = ["Psychiatrist", "Psychiatric Nurse Practitioner"];
const THERAPIST_PROFS = [
  "Clinical Social Worker",
  "Mental Health Counselor",
  "Marriage & Family Therapist",
  "Psychologist",
  "Clinical Neuropsychologist",
  "Psychoanalyst",
  "Behavior Analyst",
];

type ProgramRow = {
  id: string;
  agency: string | null;
  facility: string | null;
  program_name: string;
  program_type: string | null;
  populations: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  zip: string | null;
  phone: string | null;
  source: DirectoryProgram["source"];
  source_id: string;
  updated_at: string | Date;
};

function toProgram(r: ProgramRow): DirectoryProgram {
  return {
    id: r.id,
    agency: r.agency,
    facility: r.facility,
    programName: r.program_name,
    programType: r.program_type,
    populations: r.populations,
    address: r.address,
    city: r.city,
    county: r.county,
    zip: r.zip,
    phone: r.phone,
    source: r.source,
    sourceId: r.source_id,
    updatedAt: isoDateTime(r.updated_at),
  };
}

// ── providers ──────────────────────────────────────────────────────────────

let defaultListingMemo: { at: number; page: Page<DirectoryProvider> } | null = null;

export async function searchProviders(opts: {
  q?: string;
  zip?: string;
  city?: string;
  county?: string;
  profession?: string;
  subspecialty?: string;
  /** Any of these focus tags (see providerFacets().focus). */
  focus?: string[];
  gender?: string;
  providerType?: string; // "therapist" | "psychiatrist" | "prescriber"
  prescribersOnly?: boolean;
  includeInactive?: boolean; // default false → deactivated NPIs hidden
  /** payer_sources.slug — keep only providers with a participation row for
      that payer (full or coarse — both mean "listed in their directory"). */
  insurancePayer?: string;
  /** Global server-side sort over the participation aggregate — client-side
      sort only reorders loaded pages, which reads as false scarcity on these
      columns. Mock mode ignores it. */
  sort?: "accepting" | "network";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}): Promise<Page<DirectoryProvider>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const q = opts.q?.trim();
  const zip5 = opts.zip?.replace(/[^0-9]/g, "").slice(0, 5) || undefined;
  const prescribers = opts.prescribersOnly || opts.providerType === "psychiatrist" || opts.providerType === "prescriber";
  const therapists = opts.providerType === "therapist";

  // The unfiltered page-1 listing (the /directory first paint, also served for
  // 1-char terms) is the one query the indexes can't help — full-table window
  // dedup — and its result only drifts when ingest runs. Memo it briefly.
  const isDefaultListing =
    hasDb && (!q || q.length === 1) && !zip5 && !opts.city && !opts.county && !opts.profession &&
    !opts.subspecialty && !opts.focus?.length && !opts.gender && !prescribers && !therapists &&
    !opts.insurancePayer && !opts.includeInactive && !opts.sort && page === 1 && pageSize === PAGE_SIZE;
  if (isDefaultListing && defaultListingMemo && Date.now() - defaultListingMemo.at < 60_000) {
    return defaultListingMemo.page;
  }

  if (hasDb) {
    const where: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (!opts.includeInactive) where.push(`deactivated_at IS NULL`); // hide dead NPIs
    // Length-tiered text match: trigram indexes need 3+ chars, so short terms
    // would seq-scan + similarity-sort the whole table (~1s measured). One char
    // isn't a search yet → unfiltered default listing (instant). Two chars →
    // name-prefix only, so 2-letter surnames (Ng, Li, Wu) still work. 3+ →
    // the full five-column fuzzy match.
    const fuzzy = !!q && q.length >= 3;
    if (q && q.length === 2) {
      where.push(`name ILIKE $${p}`);
      params.push(`${q}%`);
      p++;
    } else if (fuzzy) {
      where.push(
        `(name ILIKE $${p} OR city ILIKE $${p} OR profession ILIKE $${p} OR subspecialty ILIKE $${p} OR primary_taxonomy ILIKE $${p})`,
      );
      params.push(`%${q}%`);
      p++;
    }
    if (zip5) {
      where.push(`left(regexp_replace(zip,'[^0-9]','','g'),5) = $${p++}`);
      params.push(zip5);
    }
    if (opts.city) {
      where.push(`lower(city) = lower($${p++})`); // city case varies by source
      params.push(opts.city);
    }
    if (opts.county) {
      where.push(`county = $${p++}`);
      params.push(opts.county);
    }
    if (opts.profession) {
      where.push(`profession = $${p++}`);
      params.push(opts.profession);
    }
    if (opts.subspecialty) {
      where.push(`subspecialty = $${p++}`);
      params.push(opts.subspecialty);
    }
    if (opts.focus?.length) {
      where.push(`focus && $${p++}`);
      params.push(opts.focus);
    }
    if (opts.gender) {
      where.push(`gender = $${p++}`);
      params.push(opts.gender);
    }
    if (prescribers) {
      where.push(`profession = ANY($${p++})`);
      params.push(PRESCRIBER_PROFS);
    } else if (therapists) {
      where.push(`profession = ANY($${p++})`);
      params.push(THERAPIST_PROFS);
    }
    if (opts.insurancePayer) {
      // Any participation row counts — full (network+accepting) or coarse
      // (presence-only, e.g. Healthfirst): both are "listed in the payer's
      // published directory", which is the claim this filter makes.
      where.push(
        `npi IN (SELECT pnp.npi FROM provider_network_participation pnp ` +
          `JOIN payer_sources ps ON ps.id = pnp.payer_source_id ` +
          `WHERE ps.slug = $${p++})`,
      );
      params.push(opts.insurancePayer);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    // A provider can exist as both a medicaid and an nppes row (same NPI).
    // Dedupe at query time to one row per NPI, preferring the medicaid row (it
    // carries license + Medicaid participation); rows without an NPI pass
    // through (COALESCE to id makes each its own partition). Filter first so the
    // preferred row is chosen among rows that actually match the search.
    const deduped =
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (` +
      `PARTITION BY COALESCE(npi, id::text) ` +
      `ORDER BY CASE source WHEN 'medicaid' THEN 0 ELSE 1 END, id) AS _rn ` +
      `FROM directory_providers ${clause}) t WHERE _rn = 1`;
    // Relevance: when there's a free-text query, rank by trigram similarity
    // against name (pg_trgm + the GIN indexes in sql/005 + sql/022 already
    // exist for this — added for ILIKE perf, reused here for ranking);
    // otherwise alphabetical is the sanest default.
    // Every ORDER BY ends in the unique id: LIMIT/OFFSET paging over ties
    // (same name; worse, the 3-value accepting rank) is otherwise unstable —
    // Postgres may re-serve page-1 rows on page 2, which the infinite-scroll
    // append renders as duplicate React keys.
    const dataParams = [...params, pageSize, (page - 1) * pageSize];
    const limitIdx = p++;
    const offsetIdx = p++;
    const columnSorted = opts.sort === "accepting" || opts.sort === "network";
    let orderBy = "name, id";
    // Similarity ranking only when no column sort overrides it — pushing the
    // similarity param and then replacing the ORDER BY would leave an unused
    // bind parameter, which Postgres rejects.
    if (fuzzy && !columnSorted) {
      dataParams.push(q);
      orderBy = `similarity(name, $${p++}) DESC, name, id`;
    }
    // Accepting/network sort joins the participation aggregate and overrides
    // relevance order. Rank: accepting 2 > listed-not-accepting 1 > no data 0;
    // network = distinct network count, no data -1.
    let sortJoin = "";
    if (columnSorted) {
      const dirSql = opts.sortDir === "asc" ? "ASC" : "DESC";
      // provider_participation_summary (sql/023) is this aggregate, precomputed
      // — the live GROUP BY over provider_network_participation hit 2.7–5s past
      // 1M rows. Refreshed post-ingest alongside provider_rate_summary.
      sortJoin = ` LEFT JOIN provider_participation_summary x ON x.npi = d.npi`;
      orderBy =
        opts.sort === "accepting"
          ? `(CASE WHEN x.any_accepting THEN 2 WHEN x.npi IS NOT NULL THEN 1 ELSE 0 END) ${dirSql}, d.name, d.id`
          : `COALESCE(x.network_count, -1) ${dirSql}, d.name, d.id`;
    }
    // Count and page are independent — one flight, not two sequential trips.
    // The count skips the window-dedup entirely: counting distinct partition
    // keys is the same number, at a fraction of the cost (measured ~4x).
    const [countRows, rows] = (await Promise.all([
      sql.query(
        `SELECT count(DISTINCT COALESCE(npi, id::text))::int AS n FROM directory_providers ${clause}`,
        params,
      ),
      sql.query(
        `SELECT d.* FROM (${deduped}) d${sortJoin} ORDER BY ${orderBy} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        dataParams,
      ),
    ])) as [Array<{ n: number }>, ProviderRow[]];
    const total = countRows[0]?.n ?? 0;
    const result = { items: rows.map(toProvider), total, page, pageSize };
    if (isDefaultListing) defaultListingMemo = { at: Date.now(), page: result };
    return result;
  }

  let all = filterProviders([...mockStore().directoryProviders.values()], opts);
  if (opts.insurancePayer) {
    const inPayer = new Set(
      mockParticipation.filter((m) => m.payerSlug === opts.insurancePayer).map((m) => m.npi),
    );
    all = all.filter((r) => r.npi && inPayer.has(r.npi));
  }
  return paginate(all, page, pageSize);
}

export async function getProvider(id: string): Promise<DirectoryProvider | null> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM directory_providers WHERE id = ${id}`) as ProviderRow[];
    return rows[0] ? toProvider(rows[0]) : null;
  }
  return mockStore().directoryProviders.get(id) ?? null;
}

/**
 * Real nearby-area names for a directory provider's "Nearby areas" block —
 * other cities with providers in the same county (genuine data we already
 * have), not fabricated neighboring towns. Falls back to the provider's own
 * city when the county has no other distinct city on file.
 */
export async function nearbyCities(county: string | null, excludeCity: string | null, limit = 16): Promise<string[]> {
  if (!county) return [];
  if (hasDb) {
    const rows = (await sql`
      SELECT DISTINCT initcap(lower(city)) AS city FROM directory_providers
      WHERE county = ${county} AND city IS NOT NULL AND deactivated_at IS NULL
        AND lower(city) != lower(${excludeCity ?? ""})
      ORDER BY city LIMIT ${limit}
    `) as Array<{ city: string }>;
    return rows.map((r) => r.city);
  }
  const cities = [...mockStore().directoryProviders.values()]
    .filter((p) => p.county === county && p.city && p.city.toLowerCase() !== (excludeCity ?? "").toLowerCase())
    .map((p) => p.city as string);
  return [...new Set(cities)].sort().slice(0, limit);
}

/** Public profile lookup — /providers/[slug]'s fallback when no practitioner matches. */
export async function getProviderBySlug(slug: string): Promise<DirectoryProvider | null> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM directory_providers WHERE slug = ${slug}`) as ProviderRow[];
    return rows[0] ? toProvider(rows[0]) : null;
  }
  return [...mockStore().directoryProviders.values()].find((p) => p.slug === slug) ?? null;
}

/**
 * Internal profile lookup by NPI — /directory/providers/[npi]'s data source.
 * A provider can exist as both a medicaid and an nppes row (same NPI); prefer
 * the medicaid row, same tie-break as getStanding's own name/profession join.
 */
export async function getProviderByNpi(npi: string): Promise<DirectoryProvider | null> {
  if (hasDb) {
    const rows = (await sql`
      SELECT * FROM directory_providers WHERE npi = ${npi}
      ORDER BY (source = 'medicaid') DESC
      LIMIT 1
    `) as ProviderRow[];
    return rows[0] ? toProvider(rows[0]) : null;
  }
  const rows = [...mockStore().directoryProviders.values()].filter((p) => p.npi === npi);
  if (!rows.length) return null;
  return rows.find((p) => p.source === "medicaid") ?? rows[0];
}

function filterProviders(
  list: DirectoryProvider[],
  opts: {
    q?: string;
    zip?: string;
    city?: string;
    county?: string;
    profession?: string;
    subspecialty?: string;
    focus?: string[];
    gender?: string;
    providerType?: string;
    prescribersOnly?: boolean;
    includeInactive?: boolean;
  },
): DirectoryProvider[] {
  const q = opts.q?.trim().toLowerCase();
  const zip5 = opts.zip?.replace(/[^0-9]/g, "").slice(0, 5) || undefined;
  const prescribers = opts.prescribersOnly || opts.providerType === "psychiatrist" || opts.providerType === "prescriber";
  const therapists = opts.providerType === "therapist";
  const matched = list.filter((r) => {
    if (!opts.includeInactive && r.deactivatedAt) return false;
    if (
      q &&
      !`${r.name} ${r.city ?? ""} ${r.profession ?? ""} ${r.subspecialty ?? ""} ${r.primaryTaxonomy ?? ""}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (zip5 && (r.zip ?? "").replace(/[^0-9]/g, "").slice(0, 5) !== zip5) return false;
    if (opts.city && (r.city ?? "").toLowerCase() !== opts.city.toLowerCase()) return false;
    if (opts.county && r.county !== opts.county) return false;
    if (opts.profession && r.profession !== opts.profession) return false;
    if (opts.subspecialty && r.subspecialty !== opts.subspecialty) return false;
    if (opts.focus?.length && !opts.focus.some((f) => (r.focus ?? []).includes(f))) return false;
    if (opts.gender && r.gender !== opts.gender) return false;
    if (prescribers && !PRESCRIBER_PROFS.includes(r.profession ?? "")) return false;
    if (therapists && !THERAPIST_PROFS.includes(r.profession ?? "")) return false;
    return true;
  });
  // Dedupe to one row per NPI, preferring medicaid; null-NPI rows pass through.
  const byNpi = new Map<string, DirectoryProvider>();
  const passthrough: DirectoryProvider[] = [];
  for (const r of matched) {
    if (!r.npi) { passthrough.push(r); continue; }
    const cur = byNpi.get(r.npi);
    if (!cur || (r.source === "medicaid" && cur.source !== "medicaid")) byNpi.set(r.npi, r);
  }
  return [...byNpi.values(), ...passthrough].sort((a, b) => a.name.localeCompare(b.name));
}

// ── programs ───────────────────────────────────────────────────────────────

export async function searchPrograms(opts: {
  q?: string;
  county?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}): Promise<Page<DirectoryProgram>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const q = opts.q?.trim();

  if (hasDb) {
    const where: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    if (q) {
      where.push(`(program_name ILIKE $${p} OR agency ILIKE $${p} OR facility ILIKE $${p} OR city ILIKE $${p})`);
      params.push(`%${q}%`);
      p++;
    }
    if (opts.county) {
      where.push(`county = $${p++}`);
      params.push(opts.county);
    }
    if (opts.type) {
      where.push(`program_type = $${p++}`);
      params.push(opts.type);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    // Count and page are independent — one flight, not two sequential trips.
    const [countRows, rows] = (await Promise.all([
      sql.query(`SELECT count(*)::int AS n FROM directory_programs ${clause}`, params),
      sql.query(
        `SELECT * FROM directory_programs ${clause} ORDER BY program_name LIMIT $${p++} OFFSET $${p++}`,
        [...params, pageSize, (page - 1) * pageSize],
      ),
    ])) as [Array<{ n: number }>, ProgramRow[]];
    const total = countRows[0]?.n ?? 0;
    return { items: rows.map(toProgram), total, page, pageSize };
  }

  const all = filterPrograms([...mockStore().directoryPrograms.values()], opts);
  return paginate(all, page, pageSize);
}

// ── program families (patient-facing taxonomy over OMH program_type) ────────
// See lib/program-taxonomy.ts — 94 raw types → 10 families. These two power
// the dynamic program pages (family pages, county pages, audience filters).

export interface ProgramFamilyFacet extends ProgramFamily {
  programCount: number;
  countyCount: number;
}

/** Family cards for the /programs index: every family with live counts. */
export async function programFamilyFacets(): Promise<ProgramFamilyFacet[]> {
  let typeCounts: Array<{ program_type: string | null; county: string | null; n: number }>;
  if (hasDb) {
    typeCounts = (await sql`
      SELECT program_type, county, count(*)::int AS n
      FROM directory_programs GROUP BY program_type, county
    `) as Array<{ program_type: string | null; county: string | null; n: number }>;
  } else {
    const agg = new Map<string, { program_type: string | null; county: string | null; n: number }>();
    for (const pr of mockStore().directoryPrograms.values()) {
      const key = `${pr.programType}|${pr.county}`;
      const cur = agg.get(key) ?? { program_type: pr.programType, county: pr.county, n: 0 };
      cur.n += 1;
      agg.set(key, cur);
    }
    typeCounts = [...agg.values()];
  }
  const byFamily = new Map<string, { programCount: number; counties: Set<string> }>();
  for (const r of typeCounts) {
    const fam = familyForType(r.program_type);
    const cur = byFamily.get(fam) ?? { programCount: 0, counties: new Set<string>() };
    cur.programCount += Number(r.n);
    if (r.county) cur.counties.add(r.county);
    byFamily.set(fam, cur);
  }
  return PROGRAM_FAMILIES.map((f) => ({
    ...f,
    programCount: byFamily.get(f.slug)?.programCount ?? 0,
    countyCount: byFamily.get(f.slug)?.counties.size ?? 0,
  })).filter((f) => f.programCount > 0);
}

/** Programs in one family, optionally narrowed by county and/or audience. */
export async function listProgramsByFamily(opts: {
  family: string;
  county?: string;
  /** 'children' | 'adolescents' | 'adults' — matches the populations enum. */
  population?: string;
  page?: number;
  pageSize?: number;
}): Promise<Page<DirectoryProgram>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const types = typesForFamily(opts.family);
  if (!types.length) return { items: [], total: 0, page, pageSize };

  if (hasDb) {
    const where: string[] = [`program_type = ANY($1)`];
    const params: unknown[] = [types];
    let p = 2;
    if (opts.county) {
      where.push(`county = $${p++}`);
      params.push(opts.county);
    }
    if (opts.population) {
      // populations is a clean word-list enum ("Children Adolescents Adults");
      // prefix-match the word so 'adolescents' also matches "Adolescents".
      where.push(`populations ILIKE $${p++}`);
      params.push(`%${opts.population.slice(0, 8)}%`);
    }
    const clause = `WHERE ${where.join(" AND ")}`;
    const countRows = (await sql.query(`SELECT count(*)::int AS n FROM directory_programs ${clause}`, params)) as Array<{ n: number }>;
    const total = countRows[0]?.n ?? 0;
    const rows = (await sql.query(
      `SELECT * FROM directory_programs ${clause} ORDER BY county NULLS LAST, program_name LIMIT $${p++} OFFSET $${p++}`,
      [...params, pageSize, (page - 1) * pageSize],
    )) as ProgramRow[];
    return { items: rows.map(toProgram), total, page, pageSize };
  }

  const typeSet = new Set(types);
  const pop = opts.population?.toLowerCase().slice(0, 8);
  const all = [...mockStore().directoryPrograms.values()].filter(
    (pr) =>
      typeSet.has(pr.programType ?? "") &&
      (!opts.county || pr.county === opts.county) &&
      (!pop || (pr.populations ?? "").toLowerCase().includes(pop)),
  );
  return paginate(all, page, pageSize);
}

export async function getProgram(id: string): Promise<DirectoryProgram | null> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM directory_programs WHERE id = ${id}`) as ProgramRow[];
    return rows[0] ? toProgram(rows[0]) : null;
  }
  return mockStore().directoryPrograms.get(id) ?? null;
}

function filterPrograms(list: DirectoryProgram[], opts: { q?: string; county?: string; type?: string }): DirectoryProgram[] {
  const q = opts.q?.trim().toLowerCase();
  return list
    .filter((r) => {
      if (q && !`${r.programName} ${r.agency ?? ""} ${r.facility ?? ""} ${r.city ?? ""}`.toLowerCase().includes(q)) return false;
      if (opts.county && r.county !== opts.county) return false;
      if (opts.type && r.programType !== opts.type) return false;
      return true;
    })
    .sort((a, b) => a.programName.localeCompare(b.programName));
}

/** Distinct filter facet values (cities, counties, professions, subspecialties) for filter chips. */
export async function providerFacets(): Promise<{ cities: string[]; counties: string[]; professions: string[]; subspecialties: string[]; focus: string[] }> {
  if (hasDb) {
    // Four independent facet queries — one flight, not four sequential trips.
    const [ci, c, pr, ss, fo] = (await Promise.all([
      sql`SELECT DISTINCT initcap(lower(city)) AS city FROM directory_providers WHERE city IS NOT NULL AND deactivated_at IS NULL ORDER BY city`,
      sql`SELECT DISTINCT county FROM directory_providers WHERE county IS NOT NULL AND deactivated_at IS NULL ORDER BY county`,
      sql`SELECT DISTINCT profession FROM directory_providers WHERE profession IS NOT NULL AND deactivated_at IS NULL ORDER BY profession`,
      sql`SELECT subspecialty, count(*)::int n FROM directory_providers WHERE subspecialty IS NOT NULL AND deactivated_at IS NULL GROUP BY subspecialty ORDER BY n DESC`,
      sql`SELECT f AS focus, count(*)::int n FROM directory_providers, unnest(focus) f WHERE deactivated_at IS NULL GROUP BY f ORDER BY n DESC`,
    ])) as [Array<{ city: string }>, Array<{ county: string }>, Array<{ profession: string }>, Array<{ subspecialty: string }>, Array<{ focus: string }>];
    return { cities: ci.map((r) => r.city), counties: c.map((r) => r.county), professions: pr.map((r) => r.profession), subspecialties: ss.map((r) => r.subspecialty), focus: fo.map((r) => r.focus) };
  }
  const list = [...mockStore().directoryProviders.values()];
  return {
    cities: unique(list.map((r) => r.city)),
    counties: unique(list.map((r) => r.county)),
    professions: unique(list.map((r) => r.profession)),
    subspecialties: unique(list.map((r) => r.subspecialty ?? null)),
    focus: unique(list.flatMap((r) => r.focus ?? [])),
  };
}

// NYC boroughs (title-case, as stored for OMH programs) — the portal
// Resources slice. NYC DOHMH's own directory (8nqg-ia7v) is private, so the
// client-facing resources are OMH programs scoped to the five boroughs.
const NYC_COUNTIES = ["New York", "Kings", "Queens", "Bronx", "Richmond"];

/** Curated NYC-borough programs for the client portal Resources page. */
export async function searchNycResources(opts: {
  q?: string;
  category?: string;
  limit?: number;
}): Promise<DirectoryProgram[]> {
  const limit = opts.limit ?? 60;
  const q = opts.q?.trim();

  if (hasDb) {
    const where: string[] = [`county = ANY($1)`, `source = 'omh'`];
    const params: unknown[] = [NYC_COUNTIES];
    let p = 2;
    if (q) {
      where.push(`(program_name ILIKE $${p} OR agency ILIKE $${p} OR city ILIKE $${p})`);
      params.push(`%${q}%`);
      p++;
    }
    if (opts.category) {
      where.push(`program_type = $${p++}`);
      params.push(opts.category);
    }
    const rows = (await sql.query(
      `SELECT * FROM directory_programs WHERE ${where.join(" AND ")} ORDER BY program_name LIMIT $${p}`,
      [...params, limit],
    )) as ProgramRow[];
    return rows.map(toProgram);
  }

  return filterPrograms([...mockStore().directoryPrograms.values()], {
    q,
    type: opts.category,
  })
    .filter((r) => r.county && NYC_COUNTIES.includes(r.county))
    .slice(0, limit);
}

/** Distinct program types among NYC-borough programs (portal category chips). */
export async function nycResourceCategories(): Promise<string[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT program_type, count(*)::int AS n
      FROM directory_programs
      WHERE source = 'omh' AND county = ANY(${NYC_COUNTIES}) AND program_type IS NOT NULL
      GROUP BY program_type ORDER BY n DESC LIMIT 12
    `) as Array<{ program_type: string }>;
    return rows.map((r) => r.program_type);
  }
  const list = [...mockStore().directoryPrograms.values()].filter((r) => r.county && NYC_COUNTIES.includes(r.county));
  return unique(list.map((r) => r.programType));
}

export async function programFacets(): Promise<{ counties: string[]; types: string[] }> {
  if (hasDb) {
    const c = (await sql`SELECT DISTINCT county FROM directory_programs WHERE county IS NOT NULL ORDER BY county`) as Array<{ county: string }>;
    const t = (await sql`SELECT DISTINCT program_type FROM directory_programs WHERE program_type IS NOT NULL ORDER BY program_type`) as Array<{ program_type: string }>;
    return { counties: c.map((r) => r.county), types: t.map((r) => r.program_type) };
  }
  const list = [...mockStore().directoryPrograms.values()];
  return {
    counties: unique(list.map((r) => r.county)),
    types: unique(list.map((r) => r.programType)),
  };
}

// ── referrals ──────────────────────────────────────────────────────────────

type ReferralRow = {
  id: string;
  client_id: string;
  provider_id: string | null;
  program_id: string | null;
  reason: string | null;
  status: ReferralStatus;
  created_by: string | null;
  created_at: string | Date;
  target_name?: string | null;
  target_kind?: "provider" | "program" | null;
};

function toReferral(r: ReferralRow): Referral {
  return {
    id: r.id,
    clientId: r.client_id,
    providerId: r.provider_id,
    programId: r.program_id,
    reason: r.reason,
    status: r.status,
    createdBy: r.created_by,
    createdAt: isoDateTime(r.created_at),
    targetName: r.target_name ?? undefined,
    targetKind: r.target_kind ?? undefined,
  };
}

export async function createReferral(input: {
  clientId: string;
  providerId?: string | null;
  programId?: string | null;
  reason?: string | null;
  createdBy?: string | null;
  status?: ReferralStatus;
}): Promise<Referral> {
  const status = input.status ?? "sent";
  if (hasDb) {
    const rows = (await sqlPhi`
      INSERT INTO referrals (client_id, provider_id, program_id, reason, status, created_by)
      VALUES (${input.clientId}, ${input.providerId ?? null}, ${input.programId ?? null}, ${input.reason ?? null}, ${status}, ${input.createdBy ?? null})
      RETURNING *
    `) as ReferralRow[];
    return toReferral(rows[0]);
  }
  const now = new Date().toISOString();
  const ref: Referral = {
    id: mockId(),
    clientId: input.clientId,
    providerId: input.providerId ?? null,
    programId: input.programId ?? null,
    reason: input.reason ?? null,
    status,
    createdBy: input.createdBy ?? null,
    createdAt: now,
  };
  mockStore().referrals.set(ref.id, ref);
  return ref;
}

export async function listReferrals(opts: { clientId: string }): Promise<Referral[]> {
  if (hasDb) {
    // referrals is PHI; directory_providers/directory_programs are reference.
    // Separate servers, so no join — fetch the rows, then resolve the target
    // names by id in one follow-up query and stitch them together.
    const rows = (await sqlPhi`
      SELECT r.*,
        CASE WHEN r.provider_id IS NOT NULL THEN 'provider' ELSE 'program' END AS target_kind
      FROM referrals r
      WHERE r.client_id = ${opts.clientId}
      ORDER BY r.created_at DESC
    `) as ReferralRow[];
    if (!rows.length) return [];

    const providerIds = [...new Set(rows.map((r) => r.provider_id).filter(Boolean))] as string[];
    const programIds = [...new Set(rows.map((r) => r.program_id).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (providerIds.length || programIds.length) {
      const targets = (await sql`
        SELECT id, name FROM directory_providers WHERE id = ANY(${providerIds}::uuid[])
        UNION ALL
        SELECT id, program_name FROM directory_programs WHERE id = ANY(${programIds}::uuid[])
      `) as Array<{ id: string; name: string | null }>;
      for (const t of targets) if (t.name) names.set(t.id, t.name);
    }
    return rows.map((r) =>
      toReferral({ ...r, target_name: names.get(r.provider_id ?? r.program_id ?? "") ?? null }),
    );
  }
  const store = mockStore();
  return [...store.referrals.values()]
    .filter((r) => r.clientId === opts.clientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => {
      const targetName = r.providerId
        ? store.directoryProviders.get(r.providerId)?.name
        : r.programId
          ? store.directoryPrograms.get(r.programId)?.programName
          : undefined;
      return { ...r, targetName, targetKind: r.providerId ? "provider" : "program" };
    });
}

// ── provider applications ──────────────────────────────────────────────────

type ApplicationRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  license_type: string | null;
  state: string | null;
  npi: string | null;
  message: string | null;
  status: ProviderApplication["status"];
  created_at: string | Date;
};

function toApplication(r: ApplicationRow): ProviderApplication {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    licenseType: r.license_type,
    state: r.state,
    npi: r.npi,
    message: r.message,
    status: r.status,
    createdAt: isoDateTime(r.created_at),
  };
}

export async function createProviderApplication(input: {
  name: string;
  email: string;
  phone?: string | null;
  licenseType?: string | null;
  state?: string | null;
  npi?: string | null;
  message?: string | null;
}): Promise<ProviderApplication> {
  if (hasDb) {
    const rows = (await sql`
      INSERT INTO provider_applications (name, email, phone, license_type, state, npi, message)
      VALUES (${input.name}, ${input.email}, ${input.phone ?? null}, ${input.licenseType ?? null}, ${input.state ?? null}, ${input.npi ?? null}, ${input.message ?? null})
      RETURNING *
    `) as ApplicationRow[];
    return toApplication(rows[0]);
  }
  const now = new Date().toISOString();
  const app: ProviderApplication = {
    id: mockId(),
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    licenseType: input.licenseType ?? null,
    state: input.state ?? null,
    npi: input.npi ?? null,
    message: input.message ?? null,
    status: "new",
    createdAt: now,
  };
  mockStore().providerApplications.set(app.id, app);
  return app;
}

export async function listProviderApplications(): Promise<ProviderApplication[]> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM provider_applications ORDER BY created_at DESC`) as ApplicationRow[];
    return rows.map(toApplication);
  }
  return [...mockStore().providerApplications.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function countNewApplications(): Promise<number> {
  if (hasDb) {
    const rows = (await sql`SELECT count(*)::int AS n FROM provider_applications WHERE status = 'new'`) as Array<{ n: number }>;
    return rows[0]?.n ?? 0;
  }
  return [...mockStore().providerApplications.values()].filter((a) => a.status === "new").length;
}

// ── helpers ────────────────────────────────────────────────────────────────

function paginate<T>(all: T[], page: number, pageSize: number): Page<T> {
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), total: all.length, page, pageSize };
}

function unique(vals: Array<string | null>): string[] {
  return [...new Set(vals.filter((v): v is string => !!v))].sort();
}

// ── provider leads (public "request an appointment" on directory profiles) ────

type LeadRow = {
  id: string;
  provider_id: string;
  name: string;
  email: string;
  phone: string | null;
  payer: string | null;
  note: string | null;
  status: ProviderLead["status"];
  created_at: string | Date;
};

function toLead(r: LeadRow): ProviderLead {
  return {
    id: r.id,
    providerId: r.provider_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    payer: r.payer,
    note: r.note,
    status: r.status,
    createdAt: isoDateTime(r.created_at),
  };
}

export async function createProviderLead(input: {
  providerId: string;
  name: string;
  email: string;
  phone?: string | null;
  payer?: string | null;
  note?: string | null;
}): Promise<ProviderLead> {
  if (hasDb) {
    const rows = (await sql`
      INSERT INTO provider_leads (provider_id, name, email, phone, payer, note)
      VALUES (${input.providerId}, ${input.name}, ${input.email},
              ${input.phone ?? null}, ${input.payer ?? null}, ${input.note ?? null})
      RETURNING *
    `) as LeadRow[];
    return toLead(rows[0]);
  }
  const lead: ProviderLead = {
    id: mockId(),
    providerId: input.providerId,
    name: input.name,
    email: input.email,
    phone: input.phone ?? null,
    payer: input.payer ?? null,
    note: input.note ?? null,
    status: "new",
    createdAt: new Date().toISOString(),
  };
  mockStore().providerLeads.set(lead.id, lead);
  return lead;
}

export async function listProviderLeads(f?: { providerId?: string }): Promise<ProviderLead[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT * FROM provider_leads
      WHERE (${f?.providerId ?? null}::uuid IS NULL OR provider_id = ${f?.providerId ?? null})
      ORDER BY created_at DESC
    `) as LeadRow[];
    return rows.map(toLead);
  }
  return [...mockStore().providerLeads.values()]
    .filter((l) => !f?.providerId || l.providerId === f.providerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── sitemap support ───────────────────────────────────────────────────────────

export async function countActiveProviders(): Promise<number> {
  if (hasDb) {
    const rows = (await sql`SELECT count(*)::int AS n FROM directory_providers WHERE deactivated_at IS NULL AND slug IS NOT NULL`) as Array<{ n: number }>;
    return rows[0]?.n ?? 0;
  }
  return [...mockStore().directoryProviders.values()].filter((p) => !p.deactivatedAt && p.slug).length;
}

/** One stable, id-ordered page of provider slugs for the chunked sitemap. */
export async function listProviderSlugs(page: number, pageSize: number): Promise<string[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT slug FROM directory_providers
      WHERE deactivated_at IS NULL AND slug IS NOT NULL
      ORDER BY id
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `) as Array<{ slug: string }>;
    return rows.map((r) => r.slug);
  }
  return [...mockStore().directoryProviders.values()]
    .filter((p) => !p.deactivatedAt && p.slug)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice((page - 1) * pageSize, page * pageSize)
    .map((p) => p.slug as string);
}
