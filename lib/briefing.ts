import Anthropic from "@anthropic-ai/sdk";
import { hasDb, sql } from "@/lib/db";
import { platformInventory, type DictionaryGroup } from "@/lib/repos/admin";

// briefing.ts — the platform's first AI workflow, kept deliberately small.
//
// It answers one question: "what do we have, what grew, what's thin?" It reads
// the SAME inventory the observatory renders (lib/repos/admin.ts), asks Claude
// for ~150 words of plain English, and caches the answer for 12 hours.
//
// Two rules this file exists to enforce:
//
//  1. NO PHI, EVER. The prompt is built from table counts and payer sync dates
//     — never a client, a name, an appointment, a note. buildFacts() below is
//     the whole prompt surface: if it isn't in there, it can't be sent. The
//     dashboard's Layer-1 practice numbers (caseload, invoices, today's
//     schedule) are deliberately NOT passed in, even though the page has them:
//     they're a small enough population to be identifying, and a narrative is
//     not worth that risk.
//  2. NEVER THROW. No key, no network, a bad response — every path returns a
//     BriefingResult the card can render. The dashboard must not depend on
//     Anthropic being up.

const MODEL = "claude-sonnet-5";
const CACHE_MS = 12 * 60 * 60_000;

export type BriefingResult =
  | { state: "ok"; text: string; generatedAt: string }
  | { state: "off"; reason: string }
  | { state: "error"; reason: string };

let memo: { at: number; data: BriefingResult } | null = null;

/** Deltas cheap enough to ask for on a page load. The obvious "rows added in
 *  the last 7 days" is NOT one of them: provider_rate_signals.ingested_at has
 *  no index, so that count is a 5s seq scan over 9.3M rows — and right after a
 *  bulk load it reports ~100% anyway, which tells nobody anything. Payer sync
 *  dates and the per-payer rate totals matview say what actually moved, in
 *  ~30 rows. */
const DELTA_SQL = `
  SELECT (SELECT count(*) FROM payer_sources WHERE last_synced_at > now() - interval '7 days')      AS payers_synced_7d,
         (SELECT max(last_synced_at)::date::text FROM payer_sources)                                 AS last_payer_sync,
         (SELECT count(*) FROM payer_rate_totals WHERE latest > now() - interval '7 days')           AS payers_new_rates_7d,
         (SELECT max(latest)::date::text FROM payer_rate_totals)                                     AS last_rate_file
`;

type Deltas = {
  payers_synced_7d: number;
  last_payer_sync: string | null;
  payers_new_rates_7d: number;
  last_rate_file: string | null;
};

/** The ENTIRE prompt surface: table names, counts, and sync dates. Read this
 *  function to know exactly what leaves the building. */
function buildFacts(groups: DictionaryGroup[], deltas: Deltas | null): string {
  const lines: string[] = [];
  for (const g of groups.filter((x) => x.platform)) {
    lines.push(`\n## ${g.title}${g.blurb ? ` — ${g.blurb}` : ""}`);
    for (const t of g.tables) {
      if (t.planned) {
        lines.push(`- ${t.name}: NOT BUILT YET (${t.planned}) — ${t.meaning}`);
        continue;
      }
      if (t.missing) {
        lines.push(`- ${t.name}: table not loaded yet — ${t.meaning}`);
        continue;
      }
      const n = t.count === null ? "unknown" : `${t.countKind === "estimate" ? "~" : ""}${t.count.toLocaleString("en-US")} rows`;
      const facts = t.facts?.length ? ` (${t.facts.map((f) => `${f.label}: ${f.value}`).join(", ")})` : "";
      lines.push(`- ${t.name}: ${n}${facts} — ${t.blurb ?? t.meaning}`);
    }
  }
  if (deltas) {
    lines.push(
      `\n## Last 7 days`,
      `- payer directories re-synced: ${deltas.payers_synced_7d} (most recent sync ${deltas.last_payer_sync ?? "never"})`,
      `- payers with new rate files: ${deltas.payers_new_rates_7d} (most recent file ${deltas.last_rate_file ?? "never"})`,
    );
  }
  return lines.join("\n");
}

const SYSTEM = `You are the in-house data lead for Leuk, a NY behavioral-health practice platform.
You are briefing the founder on the state of the data platform. He built it and knows the domain — do not explain what an NPI is.

Line 1: a headline for the briefing — at most ten words, no trailing period, front-page voice, specific to what the data shows tonight (not "Platform Update").
Then a blank line. Then ~150 words of plain prose. No headings, no bullets, no preamble. Cover, in this order:
1. What we have — the shape of the corpus, in one or two sentences.
2. What grew — reference the 7-day activity only if it shows something.
3. What's thin — the honest gap. Empty tables, tables not loaded, "NOT BUILT YET" entries, and lopsided coverage are the interesting parts. Say which one you'd fix next and why.

Be specific and use the real numbers. Do not flatter, do not hedge, and do not invent anything not in the data below.`;

/**
 * mode:
 *  - "auto"   (default) return the 12h-cached briefing, generating on a miss —
 *              the original behavior, kept for any server-render callers.
 *  - "cached" NEVER call the API: return whatever is memoized (any age), or
 *              state:"off" if nothing has been generated this process.
 *  - "fresh"  always call the API and replace the memo — the Insights switch.
 */
export async function platformBriefing(mode: "auto" | "cached" | "fresh" = "auto"): Promise<BriefingResult> {
  if (mode === "cached") {
    return memo?.data ?? { state: "off", reason: "No briefing generated yet." };
  }
  if (mode !== "fresh" && memo && Date.now() - memo.at < CACHE_MS) return memo.data;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { state: "off", reason: "AI briefing off — add ANTHROPIC_API_KEY to .env.local" };

  try {
    const [{ groups }, deltaRows] = await Promise.all([
      platformInventory(),
      hasDb ? (sql.query(DELTA_SQL, []) as unknown as Promise<Deltas[]>) : Promise.resolve([] as Deltas[]),
    ]);

    const facts = buildFacts(groups, deltaRows[0] ?? null);

    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      // Sonnet 5 runs adaptive thinking when `thinking` is omitted — a silent
      // change from 4.6. This is a 150-word summary of numbers already
      // computed; thinking would buy nothing and cost latency on a page load.
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Here is tonight's inventory.\n${facts}` }],
    });

    if (response.stop_reason === "refusal") {
      return { state: "error", reason: "The model declined to answer." };
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return { state: "error", reason: "The model returned nothing." };

    const data: BriefingResult = { state: "ok", text, generatedAt: new Date().toISOString() };
    memo = { at: Date.now(), data };
    return data;
  } catch (err) {
    // Never throw: a briefing is a nice-to-have, the dashboard is not.
    // Cache the failure briefly so a down API doesn't get hit once per view.
    const reason =
      err instanceof Anthropic.AuthenticationError
        ? "ANTHROPIC_API_KEY was rejected."
        : err instanceof Anthropic.RateLimitError
          ? "Rate limited — the briefing will refresh later."
          : err instanceof Anthropic.APIError
            ? `The API returned ${err.status}.`
            : "Could not reach the API.";
    const data: BriefingResult = { state: "error", reason };
    memo = { at: Date.now() - CACHE_MS + 60_000, data };
    return data;
  }
}
