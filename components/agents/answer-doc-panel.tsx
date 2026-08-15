"use client";

import { useEffect, useRef, useState } from "react";
import { NotesEditor, type NotesEditorHandle } from "@/components/notes-editor";
import { AppPanel } from "@/components/ui/app-panel";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/components/ui/dropdown-menu";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { useToast } from "@/components/ui/toast";
import { buildAnswerDoc } from "@/lib/agents/answer-doc";
import { exportDocument } from "@/lib/agents/export-doc";
import type { OrgGraph } from "@/lib/org-graph";

// "Edit this answer as a document" — the pencil in the answer footer opens the
// SAME ProseMirror markdown editor the clinical notes use, seeded with the turn
// that produced it. An answer is a thing you act on: quote it in a memo, mark
// it up before sending it to a payer. Re-typing it into a document is the step
// worth deleting.
//
// AppPanel, not SidePanel: a draft is something you work in WHILE reading the
// answer, so the page narrows beside it rather than disappearing under a scrim.
//
// Drafts are held in module memory, keyed by message id, so closing the panel
// and reopening it returns your edits rather than the pristine answer. They do
// NOT survive a reload — persistence is deliberately out of scope for now, and
// the footer says so rather than implying a save that isn't happening.

const drafts = new Map<string, string>();

export function AnswerDocPanel({
  open,
  onClose,
  messageId,
  markdown,
  graphs,
  source,
}: {
  open: boolean;
  onClose: () => void;
  /** Draft key — same answer reopens to the same draft. */
  messageId: string;
  markdown: string;
  graphs: OrgGraph[];
  /** Agent whose answer this is. Gates off-platform sharing — the server
   *  refuses PHI-capable sources independently, this just avoids offering it. */
  source?: string;
}) {
  const toast = useToast();
  const editorRef = useRef<NotesEditorHandle>(null);
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);

  // Seed on OPEN, not on mount: the answer can still be streaming when the
  // component first renders, and a draft in progress must never be clobbered
  // by a re-seed.
  useEffect(() => {
    if (!open) return;
    setBody(drafts.get(messageId) ?? buildAnswerDoc({ markdown, graphs }));
    setDirty(false);
    // markdown/graphs deliberately absent: re-seeding a panel that is already
    // open would throw away what the user has typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messageId]);

  const save = () => {
    drafts.set(messageId, body);
    setDirty(false);
    toast("Draft kept for this session.", "success");
  };

  const title = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  // Slack and Discord sit outside our BAA, so a clinical draft never gets the
  // option. Friday is chart-derived by construction; the directory agents are
  // public reference data.
  const clinical = source === "friday";
  const share = async (target: "slack" | "discord") => {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, title, markdown: body, source }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.ok) toast(`Shared to ${target === "slack" ? "Slack" : "Discord"}.`, "success");
    else toast(json.error ?? "Could not share the draft.", "danger");
  };

  return (
    <AppPanel
      open={open}
      onClose={onClose}
      title="Edit as document"
      icon="edit"
      headerActions={
        <KebabMenu>
          <MenuItem
            icon="download"
            label="Export as Word"
            onClick={() => exportDocument(body, { format: "doc", title })}
          />
          <MenuItem
            icon="file-text"
            label="Export as PDF"
            onClick={() => exportDocument(body, { format: "pdf", title })}
          />
          {!clinical && (
            <MenuItem icon="send" label="Share to Slack" onClick={() => void share("slack")} />
          )}
          {!clinical && (
            <MenuItem icon="message-circle" label="Share to Discord" onClick={() => void share("discord")} />
          )}
          <MenuItem
            icon="copy"
            label="Copy as Markdown"
            onClick={() => {
              void navigator.clipboard?.writeText(body);
              toast("Copied markdown", "success");
            }}
          />
          <MenuItem
            icon="refresh-cw"
            label="Reset to the original answer"
            onClick={() => {
              drafts.delete(messageId);
              setBody(buildAnswerDoc({ markdown, graphs }));
              setDirty(false);
            }}
          />
        </KebabMenu>
      }
      footer={
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-[13px] text-text-muted">
            {dirty ? "Unsaved" : "No changes"} · {words.toLocaleString()} {words === 1 ? "word" : "words"}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" onClick={save} disabled={!dirty}>
              Save draft
            </Button>
          </span>
        </div>
      }
      bodyClass="px-5 py-4"
    >
      <NotesEditor
        ref={editorRef}
        value={body}
        onChange={(md) => {
          setBody(md);
          setDirty(true);
        }}
        onSave={save}
        autoFocus
      />
    </AppPanel>
  );
}
