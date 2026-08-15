import {
  getProgram,
  getProviderByNpi,
  nycResourceCategories,
  programFacets,
  providerFacets,
  searchNycResources,
  searchPrograms,
  searchProviders,
} from "@/lib/repos/directory";
import { listPayerFacets, networkParticipationForNpi } from "@/lib/repos/networks";
import { listAvailability, listPractitioners, listServices } from "@/lib/repos/services";
import { formatPhone, providerDisplayName, titleCase } from "@/lib/format";
import type { DirectoryProgram, DirectoryProvider } from "@/lib/types";

// The Leuk MCP toolset — READ HALF.
//
// Every function here reads REFERENCE data out of `sql` (DATABASE_URL): the
// NPPES/OMH provider directory, the OMH program registry, payer-published
// network participation, and the practice's own bookable services. Not one of
// them may touch `sqlPhi`, and `scripts/check-mcp-boundary.mjs` fails if that
// ever changes.
//
// The single write tool lives in `lib/mcp/booking.ts`, alone and on purpose:
// booking necessarily creates a client and an appointment, which is PHI, so it
// is quarantined in one file the boundary checker names explicitly rather than
// mixed in here where the invariant would stop being checkable.
//
// Dependency-free by design — no MCP types, no Zod. The transport
// (`app/api/mcp/route.ts`) owns schemas and shaping; these are plain
// async functions, so the same bodies could back an internal agent later
// without dragging the protocol along. Same split as 44b's registry-tools.
//
// RESULT SHAPE DISCIPLINE. These land in someone else's context window, which
// costs them money and attention. Return the fields a person choosing a
// clinician actually needs, cap every limit server-side whatever was asked for,
// and put a site path on every record so an answer is checkable.

/** Server-side ceiling. A caller asking for 500 rows gets this. */
const MAX = 25;

const cap = (n: number | undefined, fallback: number) =>
  Math.max(1, Math.min(MAX, Math.floor(n ?? fallback)));

// Site-relative; the transport rewrites `href` into an absolute `url`.
const providerHref = (p: DirectoryProvider) =>
  p.slug ? `/providers/${p.slug}` : p.npi ? `/directory/providers/${p.npi}` : "/directory";

// Registry rows are SHOUTED and unformatted. A model will read these values
// straight back to a person, so normalise here rather than hoping it thinks to.
const city = (v: string | null) => (v ? titleCase(v) : null);
const phone = (v: string | null) => {
  if (!v) return null;
  // OMH writes the literal string "Not Available" into the phone column.
  const digits = v.replace(/\D/g, "");
  return digits.length === 10 ? formatPhone(v) : null;
};

function toCard(p: DirectoryProvider) {
  return {
    npi: p.npi,
    // NPPES stores "PADGETT SHELLEY"; nobody wants to read that.
    name: providerDisplayName(p.name, p.entityType ?? null),
    profession: p.profession,
    subspecialty: p.subspecialty ?? null,
    credential: p.credential ?? null,
    city: city(p.city),
    county: p.county,
    phone: phone(p.phone),
    href: providerHref(p),
  };
}

// ── find_providers ───────────────────────────────────────────────────────────

export type FindProvidersInput = {
  q?: string;
  city?: string;
  county?: string;
  zip?: string;
  profession?: string;
  subspecialty?: string;
  provider_type?: "therapist" | "psychiatrist" | "prescriber";
  insurance_payer?: string;
  prefer_accepting?: boolean;
  limit?: number;
  page?: number;
};

export async function runFindProviders(input: FindProvidersInput) {
  const limit = cap(input.limit, 10);
  const res = await searchProviders({
    q: input.q,
    city: input.city,
    county: input.county,
    zip: input.zip,
    profession: input.profession,
    subspecialty: input.subspecialty,
    providerType: input.provider_type,
    insurancePayer: input.insurance_payer,
    // Ranking, NOT filtering. Most NPPES rows carry no acceptance flag, so a
    // hard filter would silently discard the majority of a county's
    // clinicians. This floats payer-confirmed open panels to the top instead.
    sort: input.prefer_accepting ? "accepting" : undefined,
    page: input.page ?? 1,
    pageSize: limit,
  });

  return {
    total: res.total,
    page: res.page,
    showing: res.items.length,
    providers: res.items.map(toCard),
    note:
      res.total > res.items.length
        ? `${res.total.toLocaleString()} match. Ask for the next page, or narrow by city, county or insurance.`
        : undefined,
  };
}

// ── get_provider ─────────────────────────────────────────────────────────────

export async function runGetProvider(input: { npi?: string }) {
  const npi = (input.npi ?? "").replace(/\D/g, "");
  if (npi.length !== 10) return { error: "npi must be the 10-digit NPPES number." };

  const p = await getProviderByNpi(npi);
  if (!p) return { error: `No provider in the directory with NPI ${npi}.` };

  // Which insurers list this clinician, and whether the payer says the panel is
  // open. This is the single most useful thing we know that a model does not.
  const participation = await networkParticipationForNpi(npi);

  return {
    ...toCard(p),
    address: p.address ? titleCase(p.address) : null,
    // NPPES stores ZIP+4 unpunctuated ("112091509"), which reads as a phone
    // number gone wrong. Five digits is what anyone needs to place an office.
    zip: p.zip ? p.zip.slice(0, 5) : null,
    gender: p.gender ?? null,
    taxonomy: p.primaryTaxonomy ?? p.taxonomy,
    license_state: p.licenseState ?? null,
    // A participation row is a payer's own directory attestation, not proof of
    // coverage — say so, so the model doesn't promise a benefit.
    insurance: participation.map((r) => ({
      payer: r.payer,
      network: r.network || null,
      panel: r.accepting,
      as_of: r.asOf,
    })),
    insurance_caveat:
      "Each row is what the insurer publishes in its own directory. Verify with the plan and the office before relying on it.",
  };
}

// ── find_programs / find_resources ───────────────────────────────────────────

const toProgramCard = (p: DirectoryProgram) => ({
  id: p.id,
  name: p.programName,
  agency: p.agency,
  // OMH repeats the agency in `facility` on most rows; drop the echo.
  facility: p.facility && p.facility !== p.agency ? p.facility : null,
  type: p.programType,
  city: city(p.city),
  county: p.county,
  phone: phone(p.phone),
  href: `/programs/${p.id}`,
});

export async function runFindPrograms(input: {
  q?: string;
  county?: string;
  type?: string;
  limit?: number;
  page?: number;
}) {
  const limit = cap(input.limit, 10);
  const res = await searchPrograms({
    q: input.q,
    county: input.county,
    type: input.type,
    page: input.page ?? 1,
    pageSize: limit,
  });
  return {
    total: res.total,
    page: res.page,
    showing: res.items.length,
    programs: res.items.map(toProgramCard),
  };
}

export async function runFindResources(input: { q?: string; category?: string; limit?: number }) {
  const rows = await searchNycResources({
    q: input.q,
    category: input.category,
    limit: cap(input.limit, 10),
  });
  return { showing: rows.length, resources: rows.map(toProgramCard) };
}

export async function runGetProgram(input: { id?: string }) {
  if (!input.id) return { error: "id is required." };
  const p = await getProgram(input.id);
  if (!p) return { error: `No program with id ${input.id}.` };
  return {
    ...toProgramCard(p),
    address: p.address ? titleCase(p.address) : null,
    zip: p.zip ? p.zip.slice(0, 5) : null,
    populations: p.populations,
    source: p.source,
  };
}

// ── directory_filters ────────────────────────────────────────────────────────

/**
 * Every filter's valid values, in one call. Exists so a model stops guessing:
 * "Brooklyn" is a city and "Kings" is the county, and a query that confuses
 * them returns nothing rather than erroring — the worst failure mode there is,
 * because it looks like an answer.
 */
export async function runDirectoryFilters() {
  const [prov, prog, categories, payers] = await Promise.all([
    providerFacets(),
    programFacets(),
    nycResourceCategories(),
    listPayerFacets(),
  ]);
  return {
    providers: {
      counties: prov.counties,
      professions: prov.professions,
      subspecialties: prov.subspecialties.slice(0, 40),
      cities: prov.cities.slice(0, 120),
      provider_type: ["therapist", "psychiatrist", "prescriber"],
    },
    // `insurance_payer` on find_providers takes the SLUG, not the display name.
    insurance_payers: payers.slice(0, 40).map((p) => ({ slug: p.slug, name: p.name, providers: p.providerCount })),
    programs: { counties: prog.counties, types: prog.types },
    resource_categories: categories,
    note: "County and city are separate filters. NYC boroughs are counties: Manhattan is 'New York', Brooklyn is 'Kings', Staten Island is 'Richmond'.",
  };
}

// ── the practice's own bookable surface ──────────────────────────────────────

/**
 * What can be booked, and with whom. Distinct from the directory: that finds
 * ANY clinician in New York, this is who you can book HERE, at this practice.
 */
export async function runListBookable() {
  const [services, practitioners, rules] = await Promise.all([listServices(), listPractitioners(), listAvailability()]);
  // "Bookable" means has published hours. Staff without an availability rule
  // set (an admin account, a new hire) are not offered, whatever their role.
  const withHours = new Set(rules.map((r) => r.practitionerId));
  return {
    practitioners: practitioners
      .filter((p) => withHours.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        href: p.slug ? `/providers/${p.slug}` : undefined,
        book_href: `/book/${p.slug ?? p.id}`,
      })),
    services: services
      .filter((s) => s.active)
      .map((s) => ({
        id: s.id,
        name: s.name,
        minutes: s.durationMin,
        telehealth: s.telehealth,
        price_usd: s.priceCents / 100,
      })),
    note: "Pass a practitioner id and a service id to get_availability for open times, then book_appointment. Link the person to book_url if they would rather finish on the booking page.",
  };
}
