import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  tool,
  toUIMessageStream,
  type ModelMessage,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { bedrockCredentials } from "@/lib/ai/bedrock";
import {
  DIRECTORY_SYSTEM,
  runDirectoryFacets,
  runGetProvider,
  runMarketRates,
  runRelationshipMap,
  runSearchProviders,
} from "@/lib/ai/directory-tools";

// POST /api/ai/directory — the care-directory agent, streamed.
//   { messages: UIMessage[], model?: string } → AI SDK UI message stream
//     (text deltas + live tool parts; the page consumes it with useChat).
//
// Reference data only (providers, networks, published rates) — no PHI touches
// this route, so there is no logEvent here; the audit boundary is clinical
// records, not public-directory questions. Auth-gated all the same: it burns
// API tokens, so it is not an anonymous endpoint. Making it truly public later
// means adding rate limiting + a spend cap, not removing requireUser lightly.
//
// On Bedrock (2026-08-09), same AWS credentials as lib/ai/clinical.ts's
// Bedrock path — this route has no PHI to protect, but there's no reason to
// run two separate model accounts when the inference credit is on AWS, not
// Anthropic direct. NOT gated through clinicalConfigured()/bedrockConfigured()
// (lib/ai/bedrock.ts) — those require LEUK_BEDROCK_MODEL_ID, which is the
// CLINICAL note-drafting model; this route picks its own model per request.
//
// Speed levers in play: true streaming (first tool call visible in ~2s),
// prompt caching on the stable system+tools prefix (cache_control below),
// thinking left OFF (Opus runs without thinking when the param is omitted),
// and a model picker — Sonnet/Haiku answer materially faster than Opus.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// The client (components/directory/chat-input.tsx) now sends real Bedrock
// inference-profile ids directly — no friendly-id translation layer. Every id
// in MODELS was verified directly against this AWS account's granted model
// access (2026-08-10): Bedrock lists far more inference profiles per region
// than an account is actually granted, and the failure is a plain
// AccessDeniedException at call time, not something discoverable up front.
// Keep this Set and chat-input.tsx's MODEL_OPTIONS in lockstep — an id here
// with no matching picker entry is unreachable; a picker entry not here 503s.
const MODELS = new Set([
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "us.anthropic.claude-sonnet-4-6",
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "us.anthropic.claude-opus-4-6-v1",
  "us.anthropic.claude-opus-4-5-20251101-v1:0",
  "mistral.mistral-large-3-675b-instruct",
  "us.amazon.nova-pro-v1:0",
  "moonshotai.kimi-k2.5",
  "moonshot.kimi-k2-thinking",
  "qwen.qwen3-next-80b-a3b",
  "minimax.minimax-m2.5",
  "zai.glm-5",
  "openai.gpt-oss-120b-1:0",
]);
const DEFAULT_MODEL = process.env.LEUK_DIRECTORY_AI_MODEL ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// Extended thinking (`reasoningConfig`) and the cache breakpoint below are
// Anthropic-specific mechanisms — only apply them when the picked model is a
// Claude model, so a Llama/Mistral/Nova/Kimi/Qwen/MiniMax/GLM/gpt-oss request
// doesn't carry a providerOption its model has no concept of.
const CLAUDE_MODELS = new Set([
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "us.anthropic.claude-sonnet-4-6",
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "us.anthropic.claude-opus-4-6-v1",
  "us.anthropic.claude-opus-4-5-20251101-v1:0",
]);

let bedrockProvider: ReturnType<typeof createAmazonBedrock> | null = null;
function bedrock() {
  if (bedrockProvider) return bedrockProvider;
  const creds = bedrockCredentials();
  if (!creds) return null;
  bedrockProvider = createAmazonBedrock(
    "apiKey" in creds
      ? { region: creds.region, apiKey: creds.apiKey }
      : { region: creds.region, accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  );
  return bedrockProvider;
}

const tools = {
  search_providers: tool({
    description:
      "Search the NY provider directory. Call this when the user wants providers matching criteria (name, place, profession, insurance). Call directory_facets first if unsure of valid values for profession/subspecialty/county/insurance_payer. Returns one page (10 rows) plus the total count.",
    inputSchema: z.object({
      q: z.string().optional().describe("Free-text name search (provider name fragment)"),
      city: z.string().optional(),
      county: z.string().optional(),
      zip: z.string().optional().describe("5-digit ZIP"),
      profession: z.string().optional().describe("Exact profession from directory_facets"),
      subspecialty: z.string().optional().describe("Exact subspecialty from directory_facets"),
      gender: z.enum(["F", "M"]).optional(),
      provider_type: z
        .enum(["therapist", "psychiatrist", "prescriber"])
        .optional()
        .describe("Coarse filter: therapist (non-prescribing), psychiatrist/prescriber (can prescribe)"),
      insurance_payer: z
        .string()
        .optional()
        .describe("Payer slug from directory_facets — keeps only providers in that payer's directory"),
      sort: z
        .enum(["accepting", "network"])
        .optional()
        .describe("Server-side sort: accepting-new-patients first, or most network memberships first"),
      page: z.number().int().optional().describe("1-based page (10 per page)"),
    }),
    execute: (input) => runSearchProviders(input),
  }),
  get_provider: tool({
    description:
      "Full record for one provider by NPI: identity, contact, insurance-network participation, and their published in-network rates. Use after search_providers to drill into a specific provider.",
    inputSchema: z.object({ npi: z.string().describe("10-digit NPI") }),
    execute: (input) => runGetProvider(input),
  }),
  market_rates: tool({
    description:
      "Market-level published rates: what an insurer pays in-network for the five core behavioral-health CPT codes (90791 intake, 90834 45-min therapy, 90837 60-min therapy, 90853 group, 99214 medication management). Returns distribution stats (median/quartiles) and optionally the top-paid billing entities. Use for 'what does X pay' and rate-comparison questions.",
    inputSchema: z.object({
      payer: z
        .string()
        .optional()
        .describe("Insurer name or fragment (e.g. 'Cigna', 'Oxford'). Omit to get stats for every insurer."),
      code: z
        .enum(["90791", "90834", "90837", "90853", "99214"])
        .optional()
        .describe("CPT code to rank/summarize. Default 90837."),
      top: z
        .number()
        .int()
        .optional()
        .describe("Also return the N highest-paid billing entities for that payer+code (max 10)"),
    }),
    execute: (input) => runMarketRates(input),
  }),
  relationship_map: tool({
    description:
      "Draw an organization's relationship map — rendered INLINE in the chat as an interactive graph: member clinicians on one side, the insurance plans that pay the organization on the other, with published-rate chips per billing code (the one published rate when a plan publishes exactly one, else the count of distinct rates). Use for organization-level questions: who bills under a group practice or platform (Headway, Alma, a hospital system), which insurers pay it, at what published rates. The graph appears automatically — do not restate its contents.",
    inputSchema: z.object({
      org: z
        .string()
        .describe("Organization name fragment (e.g. 'Headway') or a 9-digit EIN / 10-digit organization NPI"),
    }),
    execute: (input) => runRelationshipMap(input),
  }),
  directory_facets: tool({
    description:
      "Valid filter values: professions, subspecialties, counties, cities, and the insurance payers we track (slug + name + provider count). Cheap — call whenever you need to map a user's words onto exact filter values.",
    inputSchema: z.object({}),
    execute: () => runDirectoryFacets(),
  }),
};

export async function POST(req: Request) {
  try {
    await requireUser();
    const provider = bedrock();
    if (!provider) {
      return NextResponse.json({ error: "Directory assistant is not configured." }, { status: 503 });
    }

    const body = (await req.json()) as { messages?: UIMessage[]; model?: string };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "messages are required." }, { status: 400 });
    }
    const model = body.model && MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
    const isClaude = CLAUDE_MODELS.has(model);

    // Cache breakpoint on the last conversation message: everything before it
    // (tools + instructions + history) is served from Anthropic's prompt cache
    // on each tool round and each follow-up turn — most of this route's
    // time-to-first-token. Bedrock's Converse API honors the same
    // providerOptions.anthropic.cacheControl shape (the package re-exports
    // AnthropicProviderOptions verbatim). Claude only — see CLAUDE_MODELS.
    const messages: ModelMessage[] = await convertToModelMessages(body.messages.slice(-24));
    if (isClaude && messages.length) {
      messages[messages.length - 1].providerOptions = {
        anthropic: { cacheControl: { type: "ephemeral" } },
      };
    }

    // Internal chain-of-thought ON for Claude (ruling 2026-07-22): the model
    // thinks before and between tool calls and the summarized reasoning
    // streams to the UI as `reasoning` parts. Haiku is a pre-adaptive model —
    // it takes a budget; Sonnet/Opus run adaptive with display opt-in
    // (omitted-by-default there). Non-Claude models have no equivalent
    // concept, so they run without a reasoningConfig providerOption at all.
    const thinking = !isClaude
      ? undefined
      : model === "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        ? { type: "enabled", budgetTokens: 2000 }
        : { type: "adaptive", display: "summarized" };

    const result = streamText({
      model: provider(model),
      instructions: DIRECTORY_SYSTEM,
      messages,
      tools,
      stopWhen: isStepCount(8),
      maxOutputTokens: 8192,
      // Bedrock's equivalent of Anthropic's `thinking` param — same shape
      // (type/budgetTokens/display), different providerOptions key.
      ...(thinking ? { providerOptions: { bedrock: { reasoningConfig: thinking } } } : {}),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream, sendReasoning: true }),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("ai/directory failed", (err as Error)?.name ?? "error");
    return NextResponse.json({ error: "The directory assistant is temporarily unavailable." }, { status: 502 });
  }
}
