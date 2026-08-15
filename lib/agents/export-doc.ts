import { DOMSerializer } from "prosemirror-model";
import { parser, schema } from "@/lib/markdown/editor-schema";

// Export a draft as Word or PDF, with no export library and no server round
// trip. Both formats are HTML underneath:
//
//   • Word opens an .doc HTML file natively and keeps headings, bold, links
//     and tables. A real .docx would need a generator dependency to produce a
//     zip of OOXML parts, and buys nothing a memo needs.
//   • PDF is the browser's own print-to-PDF. Rendering one in JS means shipping
//     a PDF engine and re-solving pagination, fonts and page breaks — all of
//     which the print dialog already does correctly.
//
// The HTML comes from the EDITOR'S OWN schema via DOMSerializer, not from a
// second markdown renderer, so an export can't disagree with what's on screen.

const PRINT_CSS = `
  body { font-family: -apple-system, "Segoe UI", Inter, system-ui, sans-serif; font-size: 11pt;
         line-height: 1.55; color: #1f2430; margin: 0; padding: 48px 56px; }
  h1 { font-size: 20pt; margin: 0 0 12px; color: #212A47; }
  h2 { font-size: 14pt; margin: 22px 0 6px; color: #212A47; }
  h3 { font-size: 12pt; margin: 18px 0 4px; color: #212A47; }
  p, li { margin: 6px 0; }
  a { color: #2f6b77; }
  blockquote { border-left: 3px solid #B7D8DD; margin: 10px 0; padding-left: 14px; color: #55606f; }
  code { background: #f3f4f6; border-radius: 3px; padding: 1px 4px; font-size: 10pt; }
  pre { background: #f3f4f6; padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
  hr { border: none; border-top: 1px solid #e6e7eb; margin: 20px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; }
  th, td { border: 1px solid #d8dbe0; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f6f7; font-weight: 600; }
  /* A row split across a page break is the classic printed-table defect. */
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
`;

/** Markdown → HTML through the editor's schema. */
export function markdownToHtml(md: string): string {
  const doc = parser.parse(md);
  if (!doc) return "";
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(doc.content);
  const host = document.createElement("div");
  host.appendChild(fragment);
  return host.innerHTML;
}

function page(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Kebab-cased, punctuation-free, and never empty. */
function fileName(title: string, ext: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "leuk-draft";
  return `${slug}.${ext}`;
}

export function exportDocument(
  markdown: string,
  { format, title = "Leuk draft" }: { format: "doc" | "pdf"; title?: string },
) {
  const html = page(title, markdownToHtml(markdown));

  if (format === "doc") {
    // The Office namespaces are what make Word treat the file as a document
    // rather than offering to import it as a web page.
    const withNs = html.replace(
      "<html>",
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">',
    );
    const blob = new Blob(["﻿", withNs], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(title, "doc");
    a.click();
    // Revoking synchronously can cancel the download in Safari.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  // PDF — hand the page to the print dialog from a hidden iframe. A popup
  // window would be blocked whenever the click isn't the browser's idea of a
  // user gesture, and would also flash a second tab.
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Give the document a tick to lay out, or the print preview can come up blank.
  win.setTimeout(() => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 1000);
  }, 60);
}
