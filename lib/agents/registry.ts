import type { IconName } from "@/components/ui/icons";

// The agent roster the dock's picker renders. An agent here is a
// (system prompt + tool set + PHI class) preset over the same Bedrock engine —
// NOT a separate runtime. They are also not AWS AgentCore agents; Leuk's
// production-legal model path is Bedrock Converse via lib/ai/bedrock.ts and
// app/api/ai/directory/route.ts. See docs/TASK-PRACTICE-AGENTS.md.
//
// `endpoint: null` means DESIGNED, NOT WIRED — the picker shows the row greyed
// with its reason so the roster tells the truth about what can actually answer.
// Wiring one is: add its system prompt + tools to a streaming route, set
// `endpoint`, and — for `phi: "yes"` — a logEvent on every clinical read.

export type AgentPhi = "none" | "yes";

export interface AgentDef {
  id: string;
  name: string;
  /** One line, shown under the name in the picker. */
  role: string;
  icon: IconName;
  /** `yes` → clinical data in the prompt: Bedrock only, audited, never logged. */
  phi: AgentPhi;
  /** Streaming chat endpoint, or null when the agent isn't built yet. */
  endpoint: string | null;
  /** Portrait, when the agent has one; otherwise `icon` on a teal wash. */
  image?: string;
  /** Why it can't be picked. Required when `endpoint` is null. */
  unavailable?: string;
  placeholder: string;
}

export const AGENTS: AgentDef[] = [
  {
    id: "directory",
    name: "Directory",
    role: "Providers, networks, and published rates",
    icon: "globe",
    phi: "none",
    endpoint: "/api/ai/directory",
    placeholder: "Ask about providers, insurers, or rates…",
  },
  {
    id: "friday",
    name: "Friday",
    role: "Sessions, notes, and clinical drafting",
    icon: "message-circle-heart",
    image: "/agents/friday.jpg",
    phi: "yes",
    endpoint: null,
    unavailable: "Not wired yet — needs a streaming clinical route with PHI auditing.",
    placeholder: "Ask about this session…",
  },
  {
    id: "bev",
    name: "Bev",
    role: "Where you are and aren't listed by payers",
    icon: "id-card",
    phi: "none",
    endpoint: "/api/ai/directory",
    placeholder: "Ask where you're listed…",
  },
  {
    id: "sal",
    name: "Sal",
    role: "Published rates vs. what the practice charges",
    icon: "dollar",
    phi: "none",
    endpoint: "/api/ai/directory",
    placeholder: "Ask what a payer publishes…",
  },
];

export const DEFAULT_AGENT_ID = "directory";

export function getAgent(id: string): AgentDef {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
}
