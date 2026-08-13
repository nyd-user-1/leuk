import { searchProviders, getProviderByNpi, providerFacets } from "@/lib/repos/directory";
import { listPayerFacets, networkParticipationForNpi } from "@/lib/repos/networks";
import { getOrgGraph } from "@/lib/repos/org-graph";
import { listOrgs } from "@/lib/repos/orgs";
import { listProviderRates } from "@/lib/repos/rate-directory";
import { getRateTable } from "@/lib/repos/rate-table";
import { RATE_TABLE_PAYERS, type RateTableRow } from "@/lib/rate-table";

// Tool layer for the care-directory agent — PUBLIC reference data only
// (directory providers, insurance participation, published MRF rates). NO PHI:
// every read goes to the reference database (`sql`), never the clinical one —
// this module must never import clients/notes/threads repos. The loop that
// calls these lives in app/api/ai/directory/route.ts (AI SDK streamText); the
// model never sees the corpus, only these few-KB results.

export const DIRECTORY_SYSTEM = `You are Leuk's care-directory assistant. You answer questions about New York behavioral-health providers using live tools over Leuk's reference dataset:
- ~126,000 NY providers (NPPES + NY Medicaid), with profession, subspecialty, location, and contact details.
- Insurance participation pulled from payers' own FHIR provider directories.
- Real negotiated rates from insurers' federally mandated machine-readable files (~15M rate rows, pre-aggregated).

Data honesty rules (non-negotiable):
- Only state facts returned by tools. Never invent a provider, NPI, phone number, network, or dollar figure.
- Rates are what the INSURER publishes it pays in-network — always name the payer and the as-of date when quoting one. They are per-session negotiated amounts, not provider revenue or patient prices.
- A provider "listed in a payer's directory" is a solid claim; "accepting new patients" is only known when the payer publishes it. Don't upgrade one into the other.
- If a search returns nothing, say so and suggest loosening a filter — never fill the gap from memory.

Style: plain language, tight. Lead with the answer; default to under ~120 words of prose (tables don't count) unless the user asks for depth. Use a markdown table when comparing 3+ providers or rates. Include NPI when naming a specific provider so the user can look them up. Say "insurance plan(s)" or "plan(s)" — never the phrase "payer books". No preamble like "I'll look up..." — call the tool, then answer. One clarifying question only when the request is truly ambiguous; otherwise pick sensible defaults and say what you assumed.

Entity names are LINKS. Tool results carry an "href" for every entity (providers, organizations, insurance plans). When you name one in prose or a table, link its FIRST mention with that exact href as a markdown link — e.g. [Headway NY](/orgs/ein%3A832675429), [Aetna Life Insurance Company](/published-rates?payer=Aetna%20Life%20Insurance%20Company&q=832675429). Copy hrefs verbatim from tool results; never construct or guess a URL. Later mentions of the same entity stay plain text.

Tool guidance: call directory_facets first when you need valid filter values (payer slugs, professions, counties). Prefer search_providers → get_provider to drill in. market_rates answers "what does insurer X pay" questions. relationship_map answers organization-level questions ("who does Headway work with", "map X's relationships", "which plans pay this group") — it renders an interactive relationship graph inline below your text automatically, so never recite the edges; give one or two takeaways (the plan covering the most clinicians, or a striking rate-count like one insurer publishing 78 different prices for one code) and let the map carry the rest.

End every answer with a follow-up block: the line FOLLOW_UPS: followed by 2-3 short, natural next questions (plain text, one per line, no bullets or brackets), each answerable with your tools. Whenever an organization or group practice is in play, make one of them a relationship-map request ("Map <organization>'s insurance relationships"); when THIS answer already rendered a relationship map, ALWAYS include one map follow-up (a sibling organization from otherMatches, or another group the conversation surfaced). The UI renders them as clickable links — never mention them in prose, and put nothing after the block. Example ending:
FOLLOW_UPS:
What does Oxford pay for the same session?
Map Headway New Jersey's insurance relationships`;

export type SearchInput = {
  q?: string; city?: string; county?: string; zip?: string; profession?: string;
  subspecialty?: string; gender?: string; provider_type?: "therapist" | "psychiatrist" | "prescriber";
  insurance_payer?: string; sort?: "accepting" | "network"; page?: number;
};

export async function runSearchProviders(input: SearchInput) {
  const res = await searchProviders({
    q: input.q, city: input.city, county: input.county, zip: input.zip,
    profession: input.profession, subspecialty: input.subspecialty, gender: input.gender,
    providerType: input.provider_type, insurancePayer: input.insurance_payer,
    sort: input.sort, page: input.page ?? 1, pageSize: 10,
  });
  return {
    total: res.total,
    page: res.page,
    items: res.items.map((p) => ({
      npi: p.npi, name: p.name, profession: p.profession, subspecialty: p.subspecialty ?? null,
      credential: p.credential ?? null, city: p.city, county: p.county, phone: p.phone,
      href: `/directory/providers/${p.npi}`,
    })),
  };
}

export async function runGetProvider(input: { npi?: string }) {
  const npi = (input.npi ?? "").replace(/\D/g, "");
  if (npi.length !== 10) return { error: "npi must be 10 digits" };
  const p = await getProviderByNpi(npi);
  if (!p) return { error: `No provider with NPI ${npi} in the directory` };
  const [networks, rates] = await Promise.all([
    networkParticipationForNpi(npi).catch(() => []),
    listProviderRates(npi).catch(() => []),
  ]);
  const cappedRates = rates.slice(0, 40);
  return {
    provider: {
      npi: p.npi, name: p.name, profession: p.profession, subspecialty: p.subspecialty ?? null,
      credential: p.credential ?? null, gender: p.gender ?? null, address: p.address,
      city: p.city, county: p.county, zip: p.zip, phone: p.phone,
      href: `/directory/providers/${p.npi}`,
    },
    insuranceNetworks: networks,
    publishedRates: cappedRates,
    ratesTruncated: rates.length > cappedRates.length ? rates.length : undefined,
  };
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 100) / 100;
}

export async function runMarketRates(input: { payer?: string; code?: string; top?: number }) {
  const code = (input.code ?? "90837") as "90791" | "90834" | "90837" | "90853" | "99214";
  const field = `c${code}` as keyof RateTableRow;
  const data = await getRateTable();
  const needle = input.payer?.trim().toLowerCase();
  const payers = RATE_TABLE_PAYERS.filter((p) => !needle || p.toLowerCase().includes(needle));
  if (!payers.length) {
    return { error: `No tracked insurer matches "${input.payer}"`, trackedInsurers: RATE_TABLE_PAYERS };
  }
  const out = payers.map((payer) => {
    const rows = data.rows.filter((r) => r.payer === payer && typeof r[field] === "number");
    const values = rows.map((r) => r[field] as number).sort((a, b) => a - b);
    const summary = {
      payer,
      asOf: data.asOfByPayer[payer] ?? null,
      code,
      billingEntities: values.length,
      p25: quantile(values, 0.25),
      median: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      max: values.length ? values[values.length - 1] : NaN,
    };
    if (!input.top) return summary;
    const top = rows
      .sort((a, b) => (b[field] as number) - (a[field] as number))
      .slice(0, Math.min(input.top, 10))
      .map((r) => ({
        name: r.displayName ?? "(unnamed billing group)",
        kind: r.entityKind,
        credential: r.credential,
        providers: r.nProviders,
        rate: r[field],
      }));
    return { ...summary, topEntities: top };
  });
  return { results: out };
}

// The relationship_map tool — resolves the user's words to ONE billing TIN
// (digits → EIN/org-NPI directly; otherwise name search, biggest roster
// wins), then returns the same pure {nodes, edges} graph the /orgs Map tab
// renders. The chat UI mounts it inline as generative UI; the model narrates
// takeaways from the summary fields and must not recite edges.
export async function runRelationshipMap(input: { org?: string }) {
  const q = (input.org ?? "").trim();
  if (!q) return { error: "Provide an organization name or EIN." };

  const digits = q.replace(/\D/g, "");
  const numericOnly = /^[\d\s().-]+$/.test(q);
  let tin: string | null = null;
  let otherMatches: Array<{ tin: string; name: string; clinicians: number }> = [];
  if (numericOnly && digits.length === 9) tin = `ein:${digits}`;
  else if (numericOnly && digits.length === 10) tin = `npi:${digits}`;
  else {
    const res = await listOrgs({ q, named: true, limit: 5 });
    if (!res.rows.length) {
      return { error: `No organization matching "${q}" has published rates in the corpus.` };
    }
    // listOrgs orders by roster size — the biggest matching org wins; the
    // rest ride along so the model can offer them if the pick looks wrong.
    tin = res.rows[0].tin;
    otherMatches = res.rows.slice(1).map((r) => ({ tin: r.tin, name: r.label, clinicians: r.npis }));
  }

  const graph = await getOrgGraph(tin);
  if (!graph) return { error: `No billing roster for ${tin} in the rate corpus.` };
  return {
    organization: graph.label,
    tin: graph.tin,
    href: `/orgs/${encodeURIComponent(graph.tin)}`,
    clinicians: graph.clinicians,
    codes: graph.codes,
    insurancePlans: graph.nodes
      .filter((n) => n.kind === "payer")
      .map((n) => ({ name: n.label, cliniciansInPlan: n.clinicians, href: n.href })),
    // The UI renders this inline as the relationship map.
    graph,
    otherMatches: otherMatches.length
      ? otherMatches.map((m) => ({ ...m, href: `/orgs/${encodeURIComponent(m.tin)}` }))
      : undefined,
  };
}

// Facets drift only on ingest — memo them in-process so the agent's most
// common first tool call costs ~0ms instead of two DB round-trips.
let facetsCache: { at: number; data: unknown } | null = null;
const FACETS_TTL_MS = 10 * 60 * 1000;

export async function runDirectoryFacets() {
  if (facetsCache && Date.now() - facetsCache.at < FACETS_TTL_MS) return facetsCache.data;
  const [facets, payers] = await Promise.all([providerFacets(), listPayerFacets()]);
  const data = {
    professions: facets.professions,
    subspecialties: facets.subspecialties,
    counties: facets.counties,
    cities: facets.cities.slice(0, 60),
    insurancePayers: payers.map((p) => ({
      slug: p.slug, name: p.name, providerCount: p.providerCount,
      directoryOnly: p.coarse || undefined,
    })),
    rateTrackedInsurers: RATE_TABLE_PAYERS,
  };
  facetsCache = { at: Date.now(), data };
  return data;
}
