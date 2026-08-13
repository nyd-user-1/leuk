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
    name: "Friday (Agent)",
    role: "Sessions, notes, and clinical drafting",
    icon: "message-circle-heart",
    image: "/agents/friday.jpg",
    phi: "yes",
    endpoint: "/api/ai/friday",
    placeholder: "Ask about your notes or today's sessions…",
  },
  {
    id: "bev",
    name: "Bev (Agent)",
    role: "Where you are and aren't listed by payers",
    icon: "id-card",
    image: "/agents/bev.jpg",
    phi: "none",
    endpoint: "/api/ai/directory",
    placeholder: "Ask where you're listed…",
  },
  {
    id: "sal",
    name: "Sal (Agent)",
    role: "Published rates vs. what the practice charges",
    icon: "dollar",
    image: "/agents/sal.jpg",
    phi: "none",
    endpoint: "/api/ai/directory",
    placeholder: "Ask what a payer publishes…",
  },
];

export const DEFAULT_AGENT_ID = "directory";

export function getAgent(id: string): AgentDef {
  return AGENTS.find((a) => a.id === id) ?? AGENTS[0];
}

/** "/" commands offered in the composer. Deliberately a plain list: skills will
 *  be appended here (or fetched into the same shape) without the composer, the
 *  Inbox or /chat needing to change. `agents` scopes a command to specific
 *  agents; omit it to offer the command everywhere. */
export interface AgentCommand {
  name: string;
  description?: string;
  group?: string;
  agents?: string[];
  /** What actually goes into the message. Picking "/missing" inserts THIS, not
   *  the literal token — the model has no "/missing" function and said so. A
   *  command is a saved phrasing until skills give it real dispatch. */
  prompt: string;
}

export const AGENT_COMMANDS: AgentCommand[] = [
  {
    name: "listings", group: "Credentialing", agents: ["bev", "directory"],
    description: "Where this provider is listed, by payer",
    prompt: "Which payer directories list this provider? Give me one line per payer with the as-of date.",
  },
  {
    name: "missing", group: "Credentialing", agents: ["bev"],
    description: "Payer directories this provider is absent from",
    prompt: "Which payer directories does this provider NOT appear in? Say plainly whether that means unlisted or uncontracted.",
  },
  {
    name: "rates", group: "Rates", agents: ["sal", "directory"],
    description: "Published rates for a payer and code",
    prompt: "What does this payer publish for this CPT code? Give median and the interquartile range.",
  },
  {
    name: "compare", group: "Rates", agents: ["sal", "directory"],
    description: "Compare two payers on the same code",
    prompt: "Compare these two payers on the same CPT code — median, spread, and the dollar gap.",
  },
  {
    name: "charges", group: "Rates", agents: ["sal"],
    description: "This practice's list prices vs. published rates",
    prompt: "Compare this practice's list prices against what payers publish, and flag anything we list below the published rate.",
  },
  {
    name: "unsigned", group: "Clinical", agents: ["friday"],
    description: "Notes drafted but not signed",
    prompt: "Which of my notes are drafted but still unsigned, and how long has each been sitting?",
  },
  {
    name: "today", group: "Clinical", agents: ["friday"],
    description: "Today's sessions",
    prompt: "What sessions do I have today?",
  },
];

/** Commands an agent may be offered. */
export function commandsFor(agentId: string): AgentCommand[] {
  return AGENT_COMMANDS.filter((c) => !c.agents || c.agents.includes(agentId));
}
