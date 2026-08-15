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
import { listBookablePractitioners, listServices } from "@/lib/repos/services";
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
    // What their NUCC codes say they focus on — every code, not just the first.
    focus: p.focus?.length ? p.focus : undefined,
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
  /** Any of these focus tags — exact values from directory_filters.providers.focus. */
  focus?: string[];
  provider_type?: "therapist" | "psychiatrist" | "prescriber";
  insurance_payer?: string;
  prefer_accepting?: boolean;
  limit?: number;
  page?: number;
};

// ── Topics ───────────────────────────────────────────────────────────────────
//
// The directory (NPPES + Medicaid) records WHO is licensed to do what — not
// what anyone treats. There is no "anxiety" anywhere in 116,000 rows, so a
// free-text search for a condition finds only clinics with the word in their
// name. Until clinicians tag their own profiles, the honest thing is to map a
// condition to the license types and subspecialties that treat it, run THAT
// search, and say so. Every entry: how to filter, and how to explain it.
type ConditionRule = {
  match: RegExp;
  label: string;
  provider_type?: FindProvidersInput["provider_type"];
  subspecialty?: string;
  focus?: string[];
  profession?: string;
  explain: string;
};
export const CONDITION_RULES: ConditionRule[] = [
  // Order matters: first match wins, so "medication for anxiety" is a prescriber search.
  { match: /\b(medication|meds|prescri|psychiatr|refill|ssri|antidepressant)\w*/i, label: "medication", provider_type: "prescriber",
    explain: "Medication needs a prescriber — a psychiatrist or psychiatric nurse practitioner — so this searches those." },
  { match: /\b(anxi(ety|ous)|panic|phobi|worry|worrie[sd]|social anxiety|gad)\b/i, label: "anxiety", provider_type: "therapist",
    explain: "Anxiety is treated by talk therapy first (CBT and related), so this searches licensed therapists — psychologists, social workers, counsellors, family therapists." },
  { match: /\b(depress|low mood|sad(ness)?|hopeless|mdd)\b/i, label: "depression", provider_type: "therapist",
    explain: "Depression is treated by therapists and, when medication is wanted, prescribers; this searches therapists. Add provider_type 'prescriber' for medication." },
  { match: /\b(ocd|obsessive|compulsi)\w*/i, label: "OCD", focus: ["Cognitive & Behavioral"],
    explain: "OCD responds best to CBT/ERP, so this narrows to clinicians whose codes carry a Cognitive & Behavioral focus." },
  { match: /\b(ptsd|trauma|abuse|assault|veteran)\w*/i, label: "trauma / PTSD", provider_type: "therapist",
    explain: "Trauma and PTSD are treated by licensed therapists; this searches those. Ask about EMDR or trauma-focused CBT when you call." },
  { match: /\b(adhd|attention deficit|hyperactiv)\w*/i, label: "ADHD", provider_type: "prescriber",
    explain: "ADHD evaluation and medication sit with psychiatrists and psychiatric NPs, so this searches prescribers; therapists help with skills alongside." },
  { match: /\b(bipolar|mania|manic|schizo|psychosis|psychotic)\w*/i, label: "bipolar / psychosis", provider_type: "psychiatrist",
    explain: "Bipolar and psychotic disorders need a psychiatrist for diagnosis and medication, so this searches psychiatrists." },
  { match: /\b(addict|substance|alcohol|drink|drug|opioid|opiate|sober|recovery|suboxone|detox)\w*/i, label: "addiction / substance use", focus: ["Addiction (Substance Use Disorder)", "Addiction Psychiatry", "Addiction Medicine", "Rehabilitation, Substance Use Disorder"],
    explain: "This searches clinicians whose codes carry an addiction focus — counsellors, psychiatrists and addiction-medicine physicians. find_programs also lists OMH/OASAS treatment programs, which are often the better route." },
  { match: /\b(eating|anorexi|bulimi|binge|arfid)\w*/i, label: "eating disorder", provider_type: "therapist",
    explain: "Eating disorders are treated by specialised therapists (often with a medical team); this searches therapists — ask about eating-disorder experience when you call." },
  { match: /\b(autis|asd|asperger|developmental|aba)\w*/i, label: "autism / developmental", focus: ["Intellectual & Developmental Disabilities"],
    explain: "This narrows to clinicians with a developmental-disabilities focus; behavior analysts (ABA) are a separate profession you can filter on." },
  { match: /\b(child|children|kid|teen|adolescen|pediatric|paediatric|son|daughter)\w*/i, label: "child / adolescent", focus: ["Child & Adolescent Psychiatry", "Clinical Child & Adolescent", "Adolescent and Children Mental Health", "Psychiatric/Mental Health, Child & Adolescent", "Psychiatric/Mental Health, Child & Family", "School", "Developmental - Behavioral Pediatrics", "Adolescent Medicine"],
    explain: "This narrows to clinicians whose codes carry a child-and-adolescent focus — child psychiatrists, child psychologists, school psychologists." },
  { match: /\b(couple|marri|marital|relationship|family therapy|divorce)\w*/i, label: "couples / family", profession: "Marriage & Family Therapist",
    explain: "Couples and family work is the domain of marriage-and-family therapists; this filters to that profession. Clinicians tagged 'Family' focus are the next circle out." },
  { match: /\b(grief|bereave|loss of|mourning|widow)\w*/i, label: "grief", provider_type: "therapist",
    explain: "Grief counselling is provided by licensed therapists; this searches those." },
  { match: /\b(older adult|elderly|senior|geriatr|dementia|aging|ageing|memory)\w*/i, label: "older adults", focus: ["Geriatric Psychiatry", "Adult Development & Aging", "Psychiatric/Mental Health, Geropsychiatric", "Gerontology", "Geriatric Medicine"],
    explain: "This narrows to clinicians whose codes carry a geriatric / aging focus." },
  { match: /\b(group therapy|support group|group session)\w*/i, label: "group therapy", focus: ["Group Psychotherapy"],
    explain: "This narrows to clinicians with a group-psychotherapy focus." },
  { match: /\b(psychoanaly|analyst)\w*/i, label: "psychoanalysis", focus: ["Psychoanalysis"],
    explain: "This narrows to clinicians with a psychoanalysis focus." },
  { match: /\b(cbt|cognitive.behavio|dbt|behavio(u)?r(al)? therap)\w*/i, label: "CBT / behavioral", focus: ["Cognitive & Behavioral"],
    explain: "This narrows to clinicians whose codes carry a Cognitive & Behavioral focus." },
  { match: /\b(forensic|court|custody|legal|competenc)\w*/i, label: "forensic", focus: ["Forensic Psychiatry", "Forensic"],
    explain: "This narrows to clinicians with a forensic focus." },
  { match: /\b(sleep|insomnia|nightmare|apnea|narcolep)\w*/i, label: "sleep", focus: ["Sleep Medicine"],
    explain: "This narrows to clinicians whose codes carry a Sleep Medicine focus — insomnia and other sleep disorders." },
  { match: /\b(chronic pain|pain management|pain psych|fibromyalg)\w*/i, label: "chronic pain", focus: ["Pain Medicine", "Psychosomatic Medicine"],
    explain: "This narrows to clinicians with a pain-medicine or psychosomatic focus." },
];

/** If the free text names a condition, turn it into filters and an explanation. */
export function interpretCondition(q: string | undefined) {
  if (!q) return null;
  const rule = CONDITION_RULES.find((r) => r.match.test(q));
  return rule ?? null;
}

export async function runFindProviders(input: FindProvidersInput) {
  const limit = cap(input.limit, 10);

  // A condition in the free text becomes filters; the words themselves would
  // match nothing (or, worse, only clinics with the condition in their name).
  const cond = !input.profession && !input.subspecialty && !input.provider_type && !input.focus?.length ? interpretCondition(input.q) : null;
  const q = cond ? undefined : input.q;
  const providerType = cond?.provider_type ?? input.provider_type;
  const subspecialty = cond?.subspecialty ?? input.subspecialty;
  const focus = cond?.focus ?? input.focus;
  const profession = cond?.profession ?? input.profession;

  const [res, bookable] = await Promise.all([
    searchProviders({
    q,
    city: input.city,
    county: input.county,
    zip: input.zip,
    profession,
    subspecialty,
    focus,
    providerType,
    insurancePayer: input.insurance_payer,
    // Ranking, NOT filtering. Most NPPES rows carry no acceptance flag, so a
    // hard filter would silently discard the majority of a county's
    // clinicians. This floats payer-confirmed open panels to the top instead.
    sort: input.prefer_accepting ? "accepting" : undefined,
    page: input.page ?? 1,
    pageSize: limit,
    }),
    // The practice's own bookable clinicians ride along on EVERY directory
    // answer, unfiltered by county or anything else. The directory is a
    // statewide reference list nobody can book through; these five can be
    // booked right now, and a person asking "who can I see" must always be
    // told that — it is not the model's call whether to mention it.
    runListBookable().catch(() => null),
  ]);

  return {
    kind: "providers" as const,
    ...(cond
      ? {
          interpreted_as: {
            topic: cond.label,
            filters: { provider_type: providerType ?? null, focus: focus ?? null, subspecialty: subspecialty ?? null, profession: profession ?? null },
            why: `${cond.explain} Focus tags come from the clinician's own registered taxonomy codes — confirm when you call.`,
          },
        }
      : {}),
    total: res.total,
    page: res.page,
    showing: res.items.length,
    // The filters this page was computed with — the card re-sends them to page.
    query: { q, city: input.city, county: input.county, zip: input.zip, profession, subspecialty, focus, provider_type: providerType, insurance_payer: input.insurance_payer, prefer_accepting: input.prefer_accepting, limit },
    providers: res.items.map(toCard),
    note:
      res.total > res.items.length
        ? `${res.total.toLocaleString()} match. Ask for the next page, or narrow by city, county or insurance.`
        : undefined,
    // Names only, deliberately no URLs: given links, a model renders link
    // cards and sends the person off to a web page. The booking UI is the
    // card that list_bookable / get_availability render in the chat.
    bookable_here: bookable
      ? {
          note: "Separate from the directory above: these clinicians can be booked right now, in this chat, at Leuk (Manhattan, telehealth available). To show them, CALL list_bookable — it renders the booking card. Do not link to booking pages.",
          practitioners: bookable.practitioners.map((p) => ({ id: p.id, name: p.name })),
          services: bookable.services.map((s) => `${s.name} (${s.minutes} min, $${s.price_usd})`),
        }
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
    kind: "provider" as const,
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
    kind: "programs" as const,
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
  return { kind: "resources" as const, showing: rows.length, resources: rows.map(toProgramCard) };
}

export async function runGetProgram(input: { id?: string }) {
  if (!input.id) return { error: "id is required." };
  const p = await getProgram(input.id);
  if (!p) return { error: `No program with id ${input.id}.` };
  return {
    kind: "program" as const,
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
      // What clinicians' NUCC codes say they focus on (all codes, sql/076).
      // Exact values for find_providers.focus.
      focus: prov.focus,
      // Free-text topics find_providers understands in q. Each maps to focus
      // tags / license types and the result explains the mapping.
      topics: CONDITION_RULES.map((r) => r.label),
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
  const [services, practitioners] = await Promise.all([listServices(), listBookablePractitioners()]);
  return {
    kind: "roster" as const,
    practitioners: practitioners
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
