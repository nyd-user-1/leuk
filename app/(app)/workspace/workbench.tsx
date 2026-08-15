import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import type { TagHue } from "@/components/ui/tag";
import { formatDate, isoDateTime } from "@/lib/format";
import type { LeadReport } from "@/lib/repos/lead-reports";
import { localToolsEnabled } from "@/lib/local-tools";
import { RULE_CATEGORY, RULES } from "@/lib/rules";
import { EcoSection } from "./section";
import { WorkbenchGrid, type DocCard } from "./workbench-grid";

// The three document collections behind the "Agents, Reports, and Rules"
// section, each loaded here on the server and handed to one grid:
//
//   Agents   the standing terminals; the card opens that agent's identity file
//            (~/.claude/agents/<name>-agent.md).
//   Reports  every lead_reports row, newest first — the nightly cross-terminal
//            digest, opened and edited in place.
//   Rules    the standards, one flat list now, each card carrying its category
//            (Design · Agent · Database) as a badge so the old tab grouping
//            survives the merge.

const AGENTS: { name: string; label: string; model: "Fable" | "Opus"; mine?: boolean; blurb: string }[] = [
  { name: "lead", label: "Lead", model: "Fable", blurb: "Writes the briefs, reviews every report, rules on every flag — dispatcher today, reviewer as the loop matures." },
  { name: "data", label: "Data", model: "Fable", blurb: "Supply-side acquisition — harvests payer MRF/TiC + FHIR directories, cracks walled payers, runs the loaders." },
  { name: "quality", label: "Quality", model: "Opus", blurb: "Data trustworthiness — matview/repo correctness, measure-before-port forensics, the thin product surfaces." },
  { name: "ui", label: "UI", model: "Opus", blurb: "Guardian of the design system — composes the 44 primitives, kills one-offs, keeps every surface on-system.", mine: true },
  { name: "docs", label: "Docs", model: "Opus", blurb: "Institutional memory — Linear structure and the three living documents, kept dual-homed with the code." },
  { name: "review", label: "Review", model: "Opus", blurb: "Adversarial review of a commit range — findings only, re-verifies every claim against reality." },
  { name: "security", label: "Security", model: "Opus", blurb: "Standing posture — PHI/HIPAA handling, auth on every route, secret hygiene across both repos." },
  { name: "ops", label: "Ops", model: "Opus", blurb: "The automation fleets and their tripwires; sequences migrations so no sql/0XX range collides." },
  { name: "research", label: "Research", model: "Opus", blurb: "Discovery spikes that end in a sized, buildable brief — a number, never a vibe." },
  { name: "qa", label: "QA", model: "Opus", blurb: "End-to-end headless product drives after big change days — reads the output, not the exit code." },
];

const CATEGORY_HUE: Record<keyof typeof RULE_CATEGORY, TagHue> = {
  design: "teal",
  agent: "violet",
  database: "blue",
};

/** A source document off disk, with its last-modified stamp. Both null where the
 *  file isn't readable (e.g. deployed, where ~/.claude and docs/ aren't there). */
async function docFile(path: string): Promise<{ doc: string | null; updatedAt: string | null }> {
  try {
    const [doc, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
    return { doc, updatedAt: isoDateTime(info.mtime) };
  } catch {
    return { doc: null, updatedAt: null };
  }
}

/** A one-line lede from a report body — the first real line, markdown stripped. */
function lede(md: string): string {
  const line = md
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#"));
  return line
    ? line.replace(/^[-*]\s+/, "").replace(/[*_`>]/g, "").trim()
    : "A cross-terminal digest — open to read and annotate.";
}

/** Deployed builds: the database-backed half of the section, on its own. */
function ReportsOnly({ reports }: { reports: LeadReport[] }) {
  if (!reports.length) return null;
  return (
    <EcoSection
      title="Reports"
      info="The nightly cross-terminal digest. Agents and Rules read local files and are available only on a development server."
    >
      <WorkbenchGrid
        agents={[]}
        rules={[]}
        reports={reports.map((r) => ({
          key: r.reportDate,
          title: r.title,
          description: lede(r.bodyMd),
          date: formatDate(`${r.reportDate}T12:00:00`),
          endpoint: `/api/insights/report/${r.reportDate}`,
          sheetLabel: "Report",
          doc: r.bodyMd,
        }))}
      />
    </EcoSection>
  );
}

export async function Workbench({ reports }: { reports: LeadReport[] }) {
  // Agents and Rules read the developer's own disk — ~/.claude/agents and the
  // docs/rules tree. Neither exists in a deployed build, so the section is
  // omitted there rather than rendering cards that 500 when opened. Reports
  // come from the database and survive on their own; see lib/local-tools.ts.
  if (!localToolsEnabled()) return <ReportsOnly reports={reports} />;

  const [agentDocs, ruleDocs] = await Promise.all([
    Promise.all(AGENTS.map((a) => docFile(join(os.homedir(), ".claude", "agents", `${a.name}-agent.md`)))),
    Promise.all(RULES.map((r) => docFile(join(process.cwd(), "docs", "rules", `${r.id}.md`)))),
  ]);

  const agentCards: DocCard[] = AGENTS.map((a, i) => ({
    key: a.name,
    title: a.label,
    description: a.blurb,
    tags: [
      { label: a.model, hue: (a.model === "Fable" ? "violet" : "grey") as TagHue },
      ...(a.mine ? [{ label: "Built this page", hue: "green" as TagHue }] : []),
    ],
    endpoint: `/api/agents/${a.name}`,
    sheetLabel: "Agent",
    doc: agentDocs[i].doc,
  }));

  const reportCards: DocCard[] = reports.map((r) => ({
    key: r.reportDate,
    title: r.title,
    description: lede(r.bodyMd),
    // The night the report covers, not when it was last touched — two reports
    // edited the same afternoon would otherwise wear the same date. Date-only
    // strings get the T12:00:00 anchor the rest of /workspace uses, so the
    // local-timezone read can't slide them a day backwards.
    date: formatDate(`${r.reportDate}T12:00:00`),
    endpoint: `/api/insights/report/${r.reportDate}`,
    sheetLabel: "Report",
    doc: r.bodyMd,
  }));

  const ruleCards: DocCard[] = RULES.map((r, i) => ({
    key: r.id,
    title: r.title,
    description: r.body,
    tags: [{ label: RULE_CATEGORY[r.tab], hue: CATEGORY_HUE[r.tab] }],
    date: ruleDocs[i].updatedAt ? formatDate(ruleDocs[i].updatedAt!) : undefined,
    endpoint: `/api/rules/${r.id}`,
    sheetLabel: "Rule",
    doc: ruleDocs[i].doc,
  }));

  return (
    <EcoSection
      title="Agents, Reports, and Rules"
      info="The fleet, what it shipped, and the standards that make ten independent terminals read like one hand. Every card opens the document behind it, editable in place."
    >
      <WorkbenchGrid agents={agentCards} reports={reportCards} rules={ruleCards} />
    </EcoSection>
  );
}
