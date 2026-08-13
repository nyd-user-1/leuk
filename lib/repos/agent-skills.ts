import { hasDb, sql } from "@/lib/db";
import { AGENT_COMMANDS } from "@/lib/agents/registry";

// Skills catalogue for the composer's "/" menu (sql/073_agent_skills.sql).
// Reference data — no PHI — so it lives in the public project alongside the
// directory and rate corpora.
//
// Rows beat a hardcoded array here because the list is meant to grow: adding a
// skill is an INSERT. In mock mode we fall back to the built-in commands so the
// menu is never empty offline.

export interface AgentSkill {
  slug: string;
  agentId: string;
  group: string;
  title: string;
  description: string;
  prompt: string;
}

type Row = {
  slug: string;
  agent_id: string;
  group_label: string;
  title: string;
  description: string;
  prompt: string;
};

export async function listAgentSkills(agentId?: string): Promise<AgentSkill[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT slug, agent_id, group_label, title, description, prompt
      FROM agent_skills
      WHERE active AND (${agentId ?? null}::text IS NULL OR agent_id = ${agentId ?? null})
      ORDER BY group_label, title
    `) as Row[];
    return rows.map((r) => ({
      slug: r.slug,
      agentId: r.agent_id,
      group: r.group_label,
      title: r.title,
      description: r.description,
      prompt: r.prompt,
    }));
  }
  return AGENT_COMMANDS.filter((c) => !agentId || !c.agents || c.agents.includes(agentId)).map((c) => ({
    slug: c.name,
    agentId: agentId ?? "directory",
    group: c.group ?? "Commands",
    title: c.name,
    description: c.description ?? "",
    prompt: c.prompt,
  }));
}
