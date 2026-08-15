import { cptLabel } from "@/components/rates/cpt";
import type { OrgGraph, OrgGraphEdge, OrgGraphRate } from "@/lib/org-graph";

// Turning an ANSWER into a DOCUMENT — the seed markdown behind the pencil in
// the answer footer.
//
// The prose transfers as-is. The interesting part is the canvas: a chat answer
// can carry a relationship map (React Flow), and a markdown document cannot
// hold a canvas. A screenshot would be honest but dead — you can't edit a
// picture of a table, and a memo about what a plan pays wants the numbers in
// rows. So the graph is SERIALISED, not captured: the org's payer edges become
// a rates table, the member edges become a roster, and the "open the full
// workspace" link stays so the live canvas is one click from the draft.
//
// Same defaults the canvas itself uses (components/orgs/org-map.tsx): 90837 if
// the org has rows for it, otherwise the first code, so the table quotes the
// number the reader was just looking at.

/** The code the canvas would have been showing. Mirrors OrgMap's initial state. */
export function preferredCode(graph: OrgGraph): string | null {
  if (graph.codes.includes("90837")) return "90837";
  return graph.codes[0] ?? null;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** One rate cell. "78 distinct rates" is a finding, not a missing value. */
function rateCell(rate: OrgGraphRate | undefined): string {
  if (!rate) return "—";
  return rate.kind === "published" ? money(rate.amount) : `${rate.nRates.toLocaleString()} distinct rates`;
}

/** 'ein:832675429' → 'EIN 83-2675429'. Inlined rather than imported from
 *  lib/repos/tin-registry, which pulls lib/db and can't reach the browser. */
function tinLabel(tin: string): string {
  const m = /^ein:(\d{2})(\d{7})$/.exec(tin.replace(/[\s-]/g, ""));
  if (m) return `EIN ${m[1]}-${m[2]}`;
  const npi = /^npi:(\d{10})$/.exec(tin);
  return npi ? `Org NPI ${npi[1]}` : tin;
}

/** Escape the one character that would end a cell early. */
const cell = (s: string) => s.replace(/\|/g, "\\|");

/** One markdown table. Rows join with single newlines — a blank line between
 *  them is a paragraph break, and the table stops being a table. */
function table(head: string[], rows: string[][]): string {
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

/** `withHeading: false` when the caller already used the org's name as the
 *  document title — a heading immediately under an identical H1 reads as a bug. */
export function orgGraphToMarkdown(graph: OrgGraph, withHeading = true): string {
  const code = preferredCode(graph);
  const payers = graph.edges.filter(
    (e): e is Extract<OrgGraphEdge, { kind: "rates" }> => e.kind === "rates",
  );
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // Each entry is one BLOCK, joined by a blank line at the end. A table is a
  // single block whose rows are joined by single newlines — separate them with
  // blank lines and markdown stops seeing a table at all.
  const out: string[] = [];

  if (withHeading) out.push(`## ${graph.label}`);
  const asOf = payers.map((e) => e.asOf).filter((d): d is string => !!d).sort().at(-1);
  out.push(
    [
      tinLabel(graph.tin),
      `${graph.clinicians.toLocaleString()} clinicians`,
      `${payers.length} ${payers.length === 1 ? "plan" : "plans"}`,
      asOf ? `payer files as of ${asOf}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  if (payers.length) {
    out.push(
      code
        ? `### Published rates — ${cptLabel(code)} (CPT ${code})`
        : "### Plans",
    );
    out.push(
      table(
        ["Plan", "Clinicians in plan", "Published rate"],
        payers.map((e) => {
          const node = byId.get(e.target);
          return [
            cell(node?.kind === "payer" ? node.label : e.payer),
            node?.kind === "payer" ? node.clinicians.toLocaleString() : "—",
            cell(rateCell(code ? e.rates[code] : undefined)),
          ];
        }),
      ),
    );
    if (graph.codes.length > 1) {
      out.push(
        `_This org publishes rates for ${graph.codes.length} codes; the table quotes ${
          code ?? "—"
        }. The others are in the [live map](/orgs/${encodeURIComponent(graph.tin)})._`,
      );
    }
  }

  const members = graph.nodes.filter(
    (n): n is Extract<typeof n, { kind: "provider" }> => n.kind === "provider",
  );
  if (members.length) {
    const more = graph.nodes.find((n) => n.kind === "providersMore");
    out.push(
      `### Clinicians billing under this TIN${
        more && more.kind === "providersMore"
          ? ` — ${members.length} shown of ${(members.length + more.count).toLocaleString()}`
          : ""
      }`,
    );
    out.push(
      table(
        ["Clinician", "Profession", "NPI"],
        members.map((m) => [`[${cell(m.label)}](${m.href})`, cell(m.profession ?? "—"), m.npi]),
      ),
    );
  }

  out.push(`[Open the full organization workspace](/orgs/${encodeURIComponent(graph.tin)})`);
  return out.join("\n\n");
}

/** Seed markdown for the draft: the canvas as tables, then the prose. Order
 *  follows the answer, where the map renders above the text it explains. */
export function buildAnswerDoc({ markdown, graphs }: { markdown: string; graphs: OrgGraph[] }): string {
  const { title, body } = titleFor(markdown.trim(), graphs[0]?.label);
  const parts = [
    `# ${title}`,
    ...graphs.map((g) => orgGraphToMarkdown(g, g.label !== title)),
    body,
  ];
  return parts.filter(Boolean).join("\n\n");
}

const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);

/** The document's H1, and the prose with the line it came from removed —
 *  otherwise a title lifted off the answer's opening line renders twice. */
function titleFor(md: string, graphLabel?: string): { title: string; body: string } {
  if (graphLabel) return { title: graphLabel, body: md };

  const lines = md.split("\n");
  const idx = lines.findIndex((l) => l.trim().length > 0);
  const first = idx === -1 ? "" : lines[idx].trim();

  const heading = /^#{1,6}\s+(.+)$/.exec(first);
  if (heading) {
    // The answer already opens with a heading — promote it rather than stack a
    // second one on top.
    return { title: heading[1].trim(), body: lines.slice(idx + 1).join("\n").trim() };
  }

  // A table row is data, never a title. This is what produced headings reading
  // "| Payer | Median Rate | 25th Pctl.".
  if (!first || isTableRow(first)) return { title: "Untitled draft", body: md };

  const plain = first.replace(/[*_`[\]]|\((?:https?:|\/)[^)]*\)/g, "").trim();
  // A short opening line IS the title, so it comes out of the body. A long one
  // is a real paragraph: borrow a truncated sentence and leave it in place.
  if (plain.length <= 90) {
    return { title: plain.replace(/:$/, ""), body: lines.slice(idx + 1).join("\n").trim() };
  }
  const sentence = plain.split(/(?<=[.?!])\s/)[0] ?? plain;
  return {
    title: sentence.length > 80 ? `${sentence.slice(0, 77).trimEnd()}…` : sentence,
    body: md,
  };
}
