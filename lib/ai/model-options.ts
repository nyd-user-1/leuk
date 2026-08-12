// The model picker's roster, shared by every surface that lets a user choose
// one: /chat's ChatInput and the agent dock. Lifted out of chat-input.tsx so
// there is ONE list — app/api/ai/directory/route.ts keeps a matching `MODELS`
// Set as its allow-list, and an id in only one of the two places is either
// unreachable (picker-only) or a 503 (route-only).
//
// Every entry is a real AWS Bedrock inference-profile id, verified directly
// against this account AND against the directory route's tool-calling shape
// (2026-08-10): Bedrock lists far more profiles than an account is granted,
// and separately, several models it DOES grant reject tool use in streaming
// mode outright ("This model doesn't support tool use in streaming mode." — a
// Bedrock-side limitation, not an AI SDK bug). Since that route always
// attaches its 5 tools, the error fires on every request, not just ones that
// end up calling a tool. Sourced from 44b's 24-model picker
// (src/components/model-options.ts), filtered to what's both granted AND
// streaming-tool-compatible here. Dropped for ACCESS: claude-sonnet-5/
// claude-opus-5 (not granted), gpt-5.2/gpt-5-mini (OpenAI direct, not
// Bedrock), nova-premier/opus-4-1/sonnet-4-20250514/qwen3-coder-next
// ("Legacy" or invalid for this account). Dropped for STREAMING TOOL USE:
// Llama 4 Maverick, Llama 3.3 70B, Pixtral Large.

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  logo: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "us.anthropic.claude-haiku-4-5-20251001-v1:0", label: "Claude Haiku 4.5", description: "Fastest", logo: "/logos/anthropic.webp" },
  { id: "us.anthropic.claude-sonnet-4-6", label: "Claude Sonnet 4.6", description: "Fast and smart", logo: "/logos/anthropic.webp" },
  { id: "us.anthropic.claude-sonnet-4-5-20250929-v1:0", label: "Claude Sonnet 4.5", description: "Bedrock", logo: "/logos/anthropic.webp" },
  { id: "us.anthropic.claude-opus-4-6-v1", label: "Claude Opus 4.6", description: "Bedrock", logo: "/logos/anthropic.webp" },
  { id: "us.anthropic.claude-opus-4-5-20251101-v1:0", label: "Claude Opus 4.5", description: "Most capable", logo: "/logos/anthropic.webp" },
  { id: "mistral.mistral-large-3-675b-instruct", label: "Mistral Large 3", description: "Mistral 675B", logo: "/logos/mistral_small.png" },
  { id: "us.amazon.nova-pro-v1:0", label: "Nova Pro", description: "Amazon, fast", logo: "/logos/amazon.webp" },
  { id: "moonshotai.kimi-k2.5", label: "Kimi K2.5", description: "Moonshot, open weight", logo: "/logos/kimi.jpg" },
  { id: "moonshot.kimi-k2-thinking", label: "Kimi K2 Thinking", description: "Moonshot, reasoning", logo: "/logos/kimi.jpg" },
  { id: "qwen.qwen3-next-80b-a3b", label: "Qwen3 Next 80B", description: "Alibaba, open weight", logo: "/logos/alibaba_small.svg" },
  { id: "minimax.minimax-m2.5", label: "MiniMax M2.5", description: "MiniMax, open weight", logo: "/logos/minimax_small.svg" },
  { id: "zai.glm-5", label: "GLM-5", description: "Z AI, open weight", logo: "/logos/zai_small.svg" },
  { id: "openai.gpt-oss-120b-1:0", label: "gpt-oss 120B", description: "OpenAI, open weight", logo: "/logos/openai.webp" },
];

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id;

/** Allow-list for the chat routes. Derived from MODEL_OPTIONS rather than
 *  hand-maintained, so a picker entry can never drift out of lockstep with the
 *  route's Set — an id in only one place is either unreachable or a 503. */
export const MODEL_IDS = new Set(MODEL_OPTIONS.map((m) => m.id));

/** Extended thinking and the prompt-cache breakpoint are Anthropic mechanisms;
 *  only Claude models may carry those providerOptions. */
export const CLAUDE_MODEL_IDS = new Set(
  MODEL_OPTIONS.filter((m) => m.id.includes("anthropic.claude")).map((m) => m.id),
);
