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
import { AuthError, requireRole } from "@/lib/auth";
import { bedrockCredentials } from "@/lib/ai/bedrock";
import { CLAUDE_MODEL_IDS as CLAUDE_MODELS, MODEL_IDS as MODELS } from "@/lib/ai/model-options";
import {
  FRIDAY_SYSTEM,
  runNoteDetail,
  runUnsignedNotes,
  runUpcomingSessions,
} from "@/lib/ai/friday-tools";

// POST /api/ai/friday — the clinical agent, streamed.
//   { messages: UIMessage[], model?: string } → AI SDK UI message stream
//
// SEPARATE ROUTE FROM /api/ai/directory ON PURPOSE. Friday is `phi: yes`: her
// tools read notes, transcripts and schedules, so this route carries three
// obligations the directory route does not have and must not inherit by
// accident:
//
//   1. BEDROCK ONLY. The BAA covers Bedrock; the first-party Anthropic API is a
//      dev fallback for non-PHI paths and must never see a note body. There is
//      no fallback here — unconfigured Bedrock is a 503, never a downgrade.
//   2. AUDITED. Every tool logs before it returns (lib/ai/friday-tools.ts).
//   3. practitioner ROLE. requireRole, not requireUser: a client account
//      reaching this would be reading someone's chart through a chat box.
//
// NEVER LOG PHI — model id, latency and counts only. No prompt text, no tool
// results, no note bodies in any console line or audit meta.
//
// Read-only by construction: Friday has no tool that writes. Nothing she
// produces is final (docs/TASK-PRACTICE-AGENTS.md — no agent signs a note).

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Clinical default leans smarter than the directory agent's: a note summary is
// worth more latency than a provider lookup.
const DEFAULT_MODEL = process.env.LEUK_CLINICAL_CHAT_MODEL ?? "us.anthropic.claude-sonnet-4-6";

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

export async function POST(req: Request) {
  try {
    const user = await requireRole("practitioner");
    const provider = bedrock();
    if (!provider) {
      // Fail closed. A PHI agent with no BAA-covered model has nowhere legal to
      // send the prompt, and a canned reply would read as a real clinical answer.
      return NextResponse.json({ error: "Friday is not configured." }, { status: 503 });
    }

    const body = (await req.json()) as { messages?: UIMessage[]; model?: string; agent?: string };
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "messages are required." }, { status: 400 });
    }
    if (body.agent && body.agent !== "friday") {
      return NextResponse.json({ error: `Agent "${body.agent}" is not available here.` }, { status: 400 });
    }

    const model = body.model && MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
    const isClaude = CLAUDE_MODELS.has(model);

    const messages: ModelMessage[] = await convertToModelMessages(body.messages.slice(-24));
    if (isClaude && messages.length) {
      messages[messages.length - 1].providerOptions = {
        anthropic: { cacheControl: { type: "ephemeral" } },
      };
    }

    const tools = {
      unsigned_notes: tool({
        description:
          "Drafted (unsigned) notes and how many days each has been sitting. Use for 'what do I owe', 'anything unsigned', and end-of-week sweeps.",
        inputSchema: z.object({
          older_than_days: z.number().int().optional().describe("Only notes unsigned at least this many days"),
        }),
        execute: (input) => runUnsignedNotes(user.id, input),
      }),
      note_detail: tool({
        description:
          "The full body of one note by id. Call after unsigned_notes when the clinician asks about a specific note's contents. Do not call it speculatively — this reads a patient's chart.",
        inputSchema: z.object({ note_id: z.string().describe("Note id from unsigned_notes") }),
        execute: (input) => runNoteDetail(user.id, input),
      }),
      upcoming_sessions: tool({
        description:
          "This practitioner's own scheduled sessions over the next N days (default 7). Use for 'what's today', 'who am I seeing', and prep questions.",
        inputSchema: z.object({ days: z.number().int().optional().describe("Window in days, 1–60") }),
        execute: (input) => runUpcomingSessions(user.id, user.id, input),
      }),
    };

    const thinking = !isClaude
      ? undefined
      : model === "us.anthropic.claude-haiku-4-5-20251001-v1:0"
        ? { type: "enabled", budgetTokens: 2000 }
        : { type: "adaptive", display: "summarized" };

    const result = streamText({
      model: provider(model),
      instructions: FRIDAY_SYSTEM,
      messages,
      tools,
      stopWhen: isStepCount(8),
      maxOutputTokens: 8192,
      ...(thinking ? { providerOptions: { bedrock: { reasoningConfig: thinking } } } : {}),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream, sendReasoning: true }),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Name only — an error string from a clinical call can carry prompt content.
    console.error("ai/friday failed", (err as Error)?.name ?? "error");
    return NextResponse.json({ error: "Friday is temporarily unavailable." }, { status: 502 });
  }
}
