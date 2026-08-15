"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import { TextLink } from "@/components/ui/text-link";

// Tiny read-only markdown renderer for agent answers: headings, bold, bullets,
// links, and tables (hover a table for click-to-copy — copies TSV so it pastes
// straight into a spreadsheet). No markdown dependency exists in the app, and
// the notes editor is an editor, not a viewer — so this carries what it needs.
//
// Links are APP-RELATIVE ONLY: the agent links entity names to their record
// pages (/orgs/…, /directory/providers/…) using hrefs its tools returned. A
// href that doesn't start with "/" renders as plain text — model output never
// becomes an external or javascript: link.

const strip = (s: string) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("[")) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const label = strip(lm?.[1] ?? tok);
      const href = lm?.[2] ?? "";
      if (href.startsWith("/")) {
        out.push(
          <TextLink key={k++} href={href} className="!text-[length:inherit]">
            {label}
          </TextLink>,
        );
      } else {
        out.push(label);
      }
    } else if (tok.startsWith("**")) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) {
      out.push(
        <code key={k++} className="rounded bg-canvas px-1 py-0.5 text-[12px]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else out.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function cells(row: string): string[] {
  return row.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function TableBlock({ header, rows }: { header: string[]; rows: string[][] }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const tsv = [header, ...rows].map((r) => r.map(strip).join("\t")).join("\n");
    void navigator.clipboard.writeText(tsv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="group relative my-6">
      <button
        type="button"
        onClick={copy}
        aria-label="Copy table"
        className={`absolute top-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-text-body shadow-card transition-opacity hover:text-text ${
          copied ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        }`}
      >
        <Icon name={copied ? "check" : "copy"} size={13} className={copied ? "text-success" : undefined} />
      </button>
      {/* Scrolls in BOTH axes at a fixed 390px, with the header row stuck to
          the top — a long answer table shouldn't push the prose that explains
          it off the screen. Short tables keep their natural height; only the
          ones that would run past 390px start scrolling. */}
      <div className="max-h-[390px] overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[360px] border-collapse text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-canvas">
              {header.map((h, j) => (
                <th key={j} className="border-b border-border bg-canvas px-2 py-1.5 text-left font-semibold">
                  {inline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, j) => (
                  <td key={j} className="border-b border-border/60 px-2 py-1.5 align-top">
                    {inline(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Markdown({ md }: { md: string }) {
  const lines = md.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // table: | a | b | followed by |---|---|
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|?[\s:-]+\|[\s|:-]*$/)) {
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i++;
      }
      blocks.push(<TableBlock key={k++} header={header} rows={rows} />);
      continue;
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(
        <p key={k++} className={`mt-3 mb-1 font-semibold ${h[1].length <= 2 ? "text-[15px]" : "text-[13.5px]"}`}>
          {inline(h[2])}
        </p>,
      );
      i++;
      continue;
    }

    // bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={k++} className="my-1.5 list-disc space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{inline(it)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // paragraph (greedy until blank/structural line)
    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(\s*[-*]\s+|#{1,4}\s|\|)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={k++} className="my-1.5 leading-relaxed">
        {inline(para.join(" "))}
      </p>,
    );
  }
  return <div className="text-[13.5px] text-text">{blocks}</div>;
}
