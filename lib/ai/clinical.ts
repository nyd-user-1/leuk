import Anthropic from "@anthropic-ai/sdk";
import {
  bedrockConfigured,
  clinicalComplete as bedrockComplete,
  type ClinicalCompletion,
} from "@/lib/ai/bedrock";

export { parseJsonLoose } from "@/lib/ai/bedrock";
export type { ClinicalCompletion } from "@/lib/ai/bedrock";

// Provider selection for the clinical AI (notes + ask).
//
//   1. Claude on Bedrock (lib/ai/bedrock.ts) — the BAA-covered path and the
//      ONLY path that may ever run in production. See that module's header for
//      the PHI ruling; nothing here weakens it.
//   2. First-party Anthropic API — DEV FALLBACK ONLY, hard-gated to
//      non-production builds (NODE_ENV). Local development runs against the
//      seeded demo dataset, so no PHI exists to leak; deployed environments
//      (Vercel previews and prod both build with NODE_ENV=production) can
//      never take this branch, deliberately — a preview points at real
//      databases. When Bedrock is unconfigured in production, clinical
//      callers fall back to their scripted demo, exactly as before.
//
// NEVER LOG PHI — same rule as the Bedrock module: model id, latency, token
// counts only; never prompt or completion text.

const DEV_MODEL = process.env.LEUK_CLINICAL_AI_MODEL ?? "claude-opus-4-8";

function anthropicDevAvailable(): boolean {
  return process.env.NODE_ENV !== "production" && !!process.env.ANTHROPIC_API_KEY;
}

/** True when SOME real-Claude path is available. Clinical routes check this to
 *  decide real completion vs. their demo fallback. */
export function clinicalConfigured(): boolean {
  return bedrockConfigured() || anthropicDevAvailable();
}

/**
 * One-shot clinical completion. Bedrock when configured; otherwise the
 * Anthropic API in dev. THROWS on misconfiguration or API error — callers
 * decide the fallback, because clinical routes must never fabricate a note.
 * (`temperature` is honored only on the Bedrock path — current first-party
 * models reject sampling params.)
 */
export async function clinicalComplete(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<ClinicalCompletion> {
  if (bedrockConfigured()) return bedrockComplete(opts);
  if (!anthropicDevAvailable()) throw new Error("Clinical AI not configured");

  const client = new Anthropic();
  const res = await client.messages.create({
    model: DEV_MODEL,
    max_tokens: opts.maxTokens ?? 1400,
    thinking: { type: "adaptive" },
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { text, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
}
