import { notFound, redirect } from "next/navigation";
import { PrintActions } from "@/components/billing/print-actions";
import { Logo } from "@/components/ui/logo";
import { logEvent } from "@/lib/audit";
import { getUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { authorNames, clientNames, getNote } from "@/lib/repos/notes";

// Print-ready clinical note — mirrors app/billing/[id]/print. Deliberately
// OUTSIDE the (app) route group so the workspace shell never renders around
// the document. On screen: a paper-style sheet + a Print toolbar; in print:
// just the branded document (@media print hides the toolbar and flattens
// the sheet).

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  signed: "Signed",
  locked: "Locked",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMd(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
}

/** Compact renderer for the note editor's markdown subset: #/##/### headings,
 * paragraphs, **bold**, *em*, "- " bullets, "1. " ordered lists. Escapes
 * HTML first, then transforms line-by-line into block-level HTML. */
function renderNoteBody(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inlineMd(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((i) => `<li>${inlineMd(i)}</li>`).join("");
      out.push(`<${list.type}>${items}</${list.type}>`);
    }
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const tag = heading[1].length === 1 ? "h1" : heading[1].length === 2 ? "h2" : "h3";
      out.push(`<${tag}>${inlineMd(heading[2])}</${tag}>`);
      continue;
    }
    const bullet = line.match(/^-\s+(.*)$/);
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }
    if (ordered) {
      flushPara();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(ordered[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return out.join("\n");
}

export default async function NotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  if (user.role === "client") redirect("/portal");

  const { id } = await params;
  const note = await getNote(id);
  if (!note) notFound();

  const [authors, clients] = await Promise.all([authorNames([note.authorId]), clientNames([note.clientId])]);
  await logEvent({ actorId: user.id, action: "note.print", entity: "note", entityId: id });

  const author = authors[note.authorId] ?? "Practitioner";
  const client = clients[note.clientId] ?? "Client";

  return (
    <div className="print-page min-h-screen bg-canvas py-8">
      <style>{`
        @media print {
          .print-hide { display: none !important; }
          .print-page { background: white !important; padding: 0 !important; }
          .print-sheet { box-shadow: none !important; border: none !important; border-radius: 0 !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
          @page { margin: 18mm; }
        }
      `}</style>

      <PrintActions />

      <div className="print-sheet mx-auto max-w-[820px] rounded-card border border-border bg-surface p-10 shadow-card">
        {/* Letterhead */}
        <div className="flex items-start justify-between">
          <div>
            <Logo size="md" />
            <p className="mt-3 text-sm leading-relaxed text-text-muted">
              Leuk Psychiatry
              <br />
              hello@leuk.demo · (555) 010-3010
            </p>
          </div>
          <div className="text-right">
            <p className="text-[22px] font-bold tracking-wide text-text">CLINICAL NOTE</p>
            <p className="mt-1 text-sm text-text-muted">{STATUS_LABEL[note.status] ?? note.status}</p>
          </div>
        </div>

        {/* Note meta */}
        <div className="mt-8">
          <p className="text-[13px] font-medium uppercase tracking-wide text-text-muted">{client}</p>
          <h1 className="mt-1 text-[20px] font-semibold text-text">{note.title}</h1>
          <p className="mt-2 text-[15px] text-text-muted">
            {author} · {formatDateTime(note.createdAt)}
          </p>
          {note.signedAt && (
            <p className="mt-1 text-[13px] text-text-muted">
              Signed by {author} · {formatDateTime(note.signedAt)}
            </p>
          )}
        </div>

        <div className="my-8 h-px bg-border" />

        <div
          className="text-[15px] leading-relaxed text-text-body [&>*:first-child]:mt-0 [&_h1]:mb-1.5 [&_h1]:mt-5 [&_h1]:text-[18px] [&_h1]:font-semibold [&_h1]:text-text [&_h2]:mb-1.5 [&_h2]:mt-5 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-text [&_h3]:mb-1.5 [&_h3]:mt-5 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-text [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1"
          dangerouslySetInnerHTML={{ __html: renderNoteBody(note.bodyMd) }}
        />
      </div>
    </div>
  );
}
