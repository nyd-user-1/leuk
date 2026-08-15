import { Schema, type Node as PMNode } from "prosemirror-model";
import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  schema as base,
} from "prosemirror-markdown";
import { tableNodes } from "prosemirror-tables";

// The editor's markdown dialect = CommonMark + GFM TABLES.
//
// Why this module exists: prosemirror-markdown's default schema has no table
// node, and its default parser runs markdown-it in "commonmark" mode with the
// table rule off. Feeding it a pipe table doesn't degrade politely — the rows
// collapse into ONE paragraph of pipes on the first round trip, so a document
// pasted or seeded with a table is corrupted the moment the user types. Agents
// answer rate questions with tables and clinicians paste them into notes, so
// the editor has to hold one losslessly.
//
// Three pieces have to agree, and all three live here so they can't drift:
//   1. schema     — base nodes + prosemirror-tables' table/row/cell
//   2. parser     — the SAME markdown-it instance as the default parser, with
//                   the table rule enabled, plus token→node handlers
//   3. serializer — pipe-table output, including the alignment row
//
// `cellContent: "inline*"` rather than the usual "block+": a GFM cell holds
// inline content and nothing else, and markdown-it emits an inline token
// directly inside td/th. With "block+" the parser would have to synthesise a
// paragraph per cell that the serializer then has to unwrap again.

const tables = tableNodes({
  tableGroup: "block",
  cellContent: "inline*",
  cellAttributes: {},
});

export const schema = new Schema({
  nodes: base.spec.nodes.append(tables),
  marks: base.spec.marks,
});

// ── parser ──────────────────────────────────────────────────────────────────

// The default parser's own markdown-it instance, with tables switched on.
// Reusing it (rather than constructing a second one) keeps a single markdown-it
// in the bundle and guarantees the two parsers can't disagree about the rest of
// the dialect.
//
// CAVEAT: .enable() MUTATES that shared instance, so defaultMarkdownParser now
// emits table tokens it has no handler for and would throw on a pipe table.
// Safe today because this module is the only importer of prosemirror-markdown
// in the tree — import the parser from HERE, never from the package.
const tokenizer = defaultMarkdownParser.tokenizer.enable("table");

// markdown-it emits align as an inline style on th/td; the schema doesn't carry
// alignment, so it is dropped on the way in and every column serialises left.
export const parser = new MarkdownParser(schema, tokenizer, {
  ...defaultMarkdownParser.tokens,
  table: { block: "table" },
  // thead/tbody have no counterpart — a header row is just the first row, told
  // apart by its cells being table_header.
  thead: { ignore: true },
  tbody: { ignore: true },
  tr: { block: "table_row" },
  th: { block: "table_header" },
  td: { block: "table_cell" },
});

// ── serializer ──────────────────────────────────────────────────────────────

/** Inline content of one cell, marks intact, pipes escaped so the row holds. */
function cellMarkdown(cell: PMNode): string {
  let out = "";
  cell.forEach((child) => {
    if (child.isText) {
      let text = child.text ?? "";
      const has = (name: string) => child.marks.some((m) => m.type.name === name);
      if (has("code")) return void (out += `\`${text}\``);
      if (has("strong")) text = `**${text}**`;
      if (has("em")) text = `*${text}*`;
      const link = child.marks.find((m) => m.type.name === "link");
      out += link ? `[${text}](${String(link.attrs.href ?? "")})` : text;
      return;
    }
    // Images and hard breaks are the only other inline nodes in this schema.
    if (child.type.name === "image") out += `![${String(child.attrs.alt ?? "")}](${String(child.attrs.src ?? "")})`;
    else out += " ";
  });
  // A literal pipe would end the cell; a newline would end the table.
  return out.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
}

export const serializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    table(state, node) {
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => cells.push(cellMarkdown(cell)));
        rows.push(cells);
      });
      if (!rows.length) return;
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
      const [head, ...body] = rows;
      state.write(`| ${pad(head).join(" | ")} |`);
      state.write("\n");
      state.write(`| ${Array(width).fill("---").join(" | ")} |`);
      for (const r of body) {
        state.write("\n");
        state.write(`| ${pad(r).join(" | ")} |`);
      }
      state.closeBlock(node);
    },
    // Reached only if a row or cell is serialised outside a table, which the
    // schema doesn't allow — present so the serializer can't throw on an
    // unknown node type.
    table_row() {},
    table_cell() {},
    table_header() {},
  },
  defaultMarkdownSerializer.marks,
);
