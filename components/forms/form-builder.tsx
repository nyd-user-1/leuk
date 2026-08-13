"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { SendFormModal } from "@/components/forms/send-form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import type { Form, FormBlock, FormBlockType } from "@/lib/types";

// Drag handle glyph — not in the foundation icon set → local inline SVG
// (FLAG), matching the convention already used for block-type glyphs below.
const GripIcon = () => (
  <svg viewBox="0 0 24 24" width={14} height={14} fill="currentColor" aria-hidden>
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

// Form builder (Carepatron Form UI): left BlockPalette · center QuestionCards
// (edit-in-place, teal accent bar on the active card, up/down reorder,
// info blocks render as SectionBlocks) · right settings panel with
// Save / Publish / Send to client.
//
// Block-type glyphs not in the foundation icon set (radio, checkbox, scale,
// signature, info) are local inline SVGs below — flagged for the icon owner.

const GLYPHS: Record<string, React.ReactNode> = {
  text: <path d="M4 7V5h16v2M12 5v14M9 19h6" />,
  textarea: <path d="M4 6h16M4 10h16M4 14h10" />,
  select: <path d="M4 5h16v6H4zM8 15l4 4 4-4" />,
  radio: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
    </>
  ),
  checkbox: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <polyline points="8.5 12.5 11 15 15.5 9.5" />
    </>
  ),
  date: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </>
  ),
  signature: <path d="M3 17c2-4 4-6 5-5s-1 5 1 5 3-7 5-7 0 7 2 7 2-2 5-2" />,
  scale: (
    <>
      <line x1="4" y1="12" x2="20" y2="12" />
      <circle cx="9" cy="12" r="2.5" fill="currentColor" stroke="none" />
      <line x1="4" y1="8" x2="4" y2="16" />
      <line x1="20" y1="8" x2="20" y2="16" />
    </>
  ),
  yesno: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3 a 9 9 0 0 0 0 18 Z" fill="currentColor" stroke="none" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="8" r="0.5" fill="currentColor" />
    </>
  ),
};

function Glyph({ type, className = "" }: { type: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {GLYPHS[type]}
    </svg>
  );
}

const PALETTE: Array<{ type: FormBlockType; title: string; subtitle: string }> = [
  { type: "text", title: "Short text", subtitle: "Single-line answer" },
  { type: "textarea", title: "Long text", subtitle: "Paragraph answer" },
  { type: "select", title: "Dropdown", subtitle: "Choose from a list" },
  { type: "radio", title: "Single choice", subtitle: "Pick one option" },
  { type: "checkbox", title: "Checkbox", subtitle: "Consent or multi-select" },
  { type: "yesno", title: "Yes / No", subtitle: "A simple yes or no" },
  { type: "date", title: "Date", subtitle: "Calendar picker" },
  { type: "scale", title: "Linear scale", subtitle: "0–3 rating (PHQ-9 style)" },
  { type: "signature", title: "Signature", subtitle: "Type-to-sign + consent" },
  { type: "info", title: "Section / info", subtitle: "Title text; starts a wizard step" },
];

// Palette blocks are colour-coded by input family: text (teal) · choice (blue) ·
// rating (violet) · date (green) · signature (amber) · section (neutral).
const BLOCK_HUE: Record<FormBlockType, string> = {
  text: "bg-teal-100 text-teal-700",
  textarea: "bg-teal-100 text-teal-700",
  select: "bg-[#DBEAFE] text-[#1E40AF]",
  radio: "bg-[#DBEAFE] text-[#1E40AF]",
  checkbox: "bg-[#DBEAFE] text-[#1E40AF]",
  yesno: "bg-[#DBEAFE] text-[#1E40AF]",
  scale: "bg-[#EDE9FE] text-[#5B21B6]",
  date: "bg-[#DCFCE7] text-[#166534]",
  signature: "bg-[#FFEDD5] text-[#9A3412]",
  info: "bg-canvas text-text-body",
};

const OPTION_TYPES: FormBlockType[] = ["select", "radio", "checkbox", "scale"];

// Native HTML5 drag payload for palette → canvas (same approach as the hq DnD).
const DND_BLOCK = "application/x-leuk-block";
// Separate payload for reordering blocks already committed to the canvas.
const DND_REORDER = "application/x-leuk-block-reorder";

function newBlock(type: FormBlockType): FormBlock {
  const id = `b_${Math.random().toString(36).slice(2, 9)}`;
  const base: FormBlock = { id, type, label: type === "info" ? "Section title" : "Untitled question", required: false };
  if (type === "yesno") return { ...base, options: ["Yes", "No"] };
  if (type === "scale") return { ...base, options: ["0", "1", "2", "3"] };
  if (OPTION_TYPES.includes(type)) return { ...base, options: ["Option 1", "Option 2"] };
  return base;
}

/** Read-only preview of a block's answer control (committed QuestionCard). */
function BlockPreview({ block }: { block: FormBlock }) {
  const ghost = "rounded-field border border-dashed border-field-border px-3 py-2 text-sm text-text-muted";
  switch (block.type) {
    case "text":
      return <div className={ghost}>Short answer</div>;
    case "textarea":
      return <div className={`${ghost} h-16`}>Long answer</div>;
    case "date":
      return <div className={`${ghost} w-44`}>mm/dd/yyyy</div>;
    case "signature":
      return <div className={`${ghost} italic`}>Type full name to sign</div>;
    case "select":
      return <div className={`${ghost} flex w-56 items-center justify-between`}>Choose… <span>▾</span></div>;
    case "scale":
      return (
        <div className="flex gap-2">
          {(block.options ?? []).map((o) => (
            <span key={o} className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-field-border px-2 text-sm text-text-body">
              {o}
            </span>
          ))}
        </div>
      );
    case "yesno":
    case "radio":
    case "checkbox":
      return (
        <div className="space-y-1.5">
          {(block.options ?? ["Yes"]).map((o) => (
            <div key={o} className="flex items-center gap-2 text-sm text-text-body">
              <span className={`h-4 w-4 border-[1.5px] border-field-border ${block.type === "checkbox" ? "rounded-[4px]" : "rounded-full"}`} />
              {o}
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export function FormBuilder({
  form,
  clients,
  onBack,
}: {
  form: Form;
  clients: Array<{ id: string; name: string }>;
  /** Back-arrow handler. Defaults to navigating to /library (standalone route). */
  onBack?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [title, setTitle] = useState(form.title);
  // Description is preserved on save but no longer edited from the builder UI.
  const [description] = useState(form.description ?? "");
  const [blocks, setBlocks] = useState<FormBlock[]>(form.schema);
  const [status, setStatus] = useState(form.status);
  // Blocks default open (all expanded); click a card's type row to collapse it.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(form.schema.map((b) => b.id)));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Palette → canvas drag-and-drop (native HTML5, hq pattern).
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleBack = () => (onBack ? onBack() : router.push("/library"));

  const mutate = (next: FormBlock[]) => {
    setBlocks(next);
    setDirty(true);
  };

  const expandBlock = (id: string) => setExpanded((prev) => new Set(prev).add(id));
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasBlockPayload = (e: React.DragEvent) => e.dataTransfer.types.includes(DND_BLOCK);
  const hasReorderPayload = (e: React.DragEvent) => e.dataTransfer.types.includes(DND_REORDER);
  const hasAnyPayload = (e: React.DragEvent) => hasBlockPayload(e) || hasReorderPayload(e);

  // Insertion index from the pointer's Y against each committed card's midpoint.
  const dropIndexAt = (clientY: number): number => {
    const cards = canvasRef.current?.querySelectorAll<HTMLElement>("[data-block-card]");
    if (!cards || cards.length === 0) return blocks.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return cards.length;
  };

  const onCanvasDrop = (e: React.DragEvent) => {
    if (hasReorderPayload(e)) {
      e.preventDefault();
      dragDepth.current = 0;
      setDropActive(false);
      const id = e.dataTransfer.getData(DND_REORDER);
      const from = blocks.findIndex((b) => b.id === id);
      setDraggingId(null);
      if (from === -1) return;
      const to = dropIndexAt(e.clientY);
      const insertAt = from < to ? to - 1 : to;
      if (insertAt === from) return;
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      next.splice(insertAt, 0, moved);
      mutate(next);
      return;
    }
    if (!hasBlockPayload(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    const type = e.dataTransfer.getData(DND_BLOCK) as FormBlockType;
    if (!type) return;
    const b = newBlock(type);
    const at = blocks.length === 0 ? 0 : dropIndexAt(e.clientY);
    mutate([...blocks.slice(0, at), b, ...blocks.slice(at)]);
    expandBlock(b.id);
  };

  const patchBlock = (id: string, patch: Partial<FormBlock>) =>
    mutate(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next);
  };

  const save = async (nextStatus?: "draft" | "published") => {
    setBusy(true);
    const res = await fetch(`/api/forms/${form.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        schema: blocks,
        status: nextStatus ?? status,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Could not save the form.", "danger");
      return;
    }
    if (nextStatus) setStatus(nextStatus);
    setDirty(false);
    toast(nextStatus === "published" ? "Form published." : "Form saved.", "success");
  };

  return (
    <>
      {/* Entity header — back arrow + title sized/styled like the Library
          section header (PageHeader), with the live status tag alongside. */}
      <div className="mb-6 flex items-center gap-3">
        <IconButton icon="arrow-left" label="Back to Library" onClick={handleBack} />
        <Icon name="clipboard" size={26} className="shrink-0 text-text-body" />
        <h1 className="truncate text-[22px] font-bold text-text md:text-[28px]">{title}</h1>
        <Badge variant={status === "published" ? "success" : "warning"}>
          {status === "published" ? "Published" : "Draft"}
        </Badge>
      </div>

      <div className="flex min-h-0 flex-1 gap-5">
      {/* Left rail — Form settings (fixed, top) + Add-a-block palette (scrolls),
          mirroring the /calendar rail (mini-month on top, agenda list beneath). */}
      <aside className="flex min-h-0 w-80 shrink-0 flex-col rounded-card border border-border bg-surface shadow-card">
        {/* Settings — fixed */}
        <div className="space-y-4 p-4">
          <Field label="Title" value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => save()} loading={busy}>
              {busy ? "Saving" : dirty ? "Save changes" : "Saved"}
            </Button>
            {status === "draft" ? (
              <Button className="flex-1" variant="secondary" onClick={() => save("published")} disabled={busy}>
                Publish
              </Button>
            ) : (
              <Button className="flex-1" variant="secondary" leftIcon="send" onClick={() => setSendOpen(true)} disabled={busy || dirty}>
                Email
              </Button>
            )}
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Add a block — scrolls */}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <h2 className="px-1.5 pb-2 text-sm font-semibold text-text">Add a block</h2>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {PALETTE.map((p) => (
            <button
              key={p.type}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_BLOCK, p.type);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => {
                const b = newBlock(p.type);
                mutate([...blocks, b]);
                expandBlock(b.id);
              }}
              className="flex w-full cursor-grab items-center gap-2.5 rounded-field px-1.5 py-2 text-left transition-colors hover:bg-canvas active:cursor-grabbing"
            >
              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-field ${BLOCK_HUE[p.type]}`}>
                <Glyph type={p.type} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text">{p.title}</span>
                <span className="block truncate text-[13px] text-text-muted">{p.subtitle}</span>
              </span>
            </button>
          ))}
          </div>
        </div>
      </aside>

      {/* Canvas — fills height; scrolls when populated; palette blocks drop here */}
      <div
        ref={canvasRef}
        onDragEnter={(e) => { if (!hasAnyPayload(e)) return; e.preventDefault(); dragDepth.current += 1; setDropActive(true); }}
        onDragOver={(e) => { if (!hasAnyPayload(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = hasReorderPayload(e) ? "move" : "copy"; }}
        onDragLeave={(e) => { if (!hasAnyPayload(e)) return; dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDropActive(false); } }}
        onDrop={onCanvasDrop}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {blocks.length === 0 ? (
          <div className={`flex flex-1 items-center justify-center rounded-card border border-dashed px-6 text-center text-[15px] transition-colors ${dropActive ? "border-primary bg-teal-100/40 text-primary" : "border-field-border bg-surface text-text-muted"}`}>
            {dropActive ? "Drop to add this block" : "Start by adding blocks — click or drag one in from the palette."}
          </div>
        ) : (
          <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto rounded-card pr-1 transition-[outline] ${dropActive ? "outline-dashed outline-2 outline-offset-2 outline-primary/50" : ""}`}>
        {blocks.map((block, i) => {
          const isExpanded = expanded.has(block.id);
          const isSection = block.type === "info";
          return (
            <div
              key={block.id}
              data-block-card
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_REORDER, block.id);
                e.dataTransfer.effectAllowed = "move";
                setDraggingId(block.id);
              }}
              onDragEnd={() => setDraggingId(null)}
              className={`group relative overflow-hidden rounded-card border bg-surface shadow-card transition-colors ${
                isExpanded ? "border-primary" : "border-border hover:border-primary-weak"
              } ${draggingId === block.id ? "opacity-40" : ""}`}
            >
              {/* drag handle — reorder blocks already on the canvas */}
              <span
                aria-hidden
                className="absolute left-1 top-1/2 z-10 flex h-6 w-4 -translate-y-1/2 cursor-grab items-center justify-center text-text-muted/0 transition-colors group-hover:text-text-muted/60 active:cursor-grabbing"
              >
                <GripIcon />
              </span>
              {/* teal accent bar (Form UI: violet in Carepatron, teal here) */}
              <span className={`absolute inset-y-0 left-0 w-1 ${isExpanded ? "bg-primary" : isSection ? "bg-teal-200" : "bg-transparent"}`} />
              <div className={`px-5 ${isSection ? "py-4" : "py-4"}`}>
                {isExpanded ? (
                  <div className="space-y-3">
                    <div
                      onClick={() => toggleExpanded(block.id)}
                      className="-m-1 flex cursor-pointer items-center gap-2 rounded-field p-1"
                    >
                      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-field ${BLOCK_HUE[block.type]}`}>
                        <Glyph type={block.type} />
                      </span>
                      <span className="text-[13px] font-medium uppercase tracking-wide text-text-muted">
                        {PALETTE.find((p) => p.type === block.type)?.title ?? block.type}
                      </span>
                      <span className="ml-auto flex items-center gap-1">
                        <IconButton icon="chevron-up" label="Move up" disabled={i === 0} onClick={(e) => { e.stopPropagation(); move(i, -1); }} />
                        <IconButton icon="chevron-down" label="Move down" disabled={i === blocks.length - 1} onClick={(e) => { e.stopPropagation(); move(i, 1); }} />
                        <IconButton
                          icon="copy"
                          label="Duplicate"
                          onClick={(e) => {
                            e.stopPropagation();
                            const copy = { ...block, id: newBlock(block.type).id };
                            mutate([...blocks.slice(0, i + 1), copy, ...blocks.slice(i + 1)]);
                            expandBlock(copy.id);
                          }}
                        />
                        <IconButton icon="trash" label="Delete" variant="danger" onClick={(e) => { e.stopPropagation(); mutate(blocks.filter((b) => b.id !== block.id)); }} />
                      </span>
                    </div>
                    <div>
                      <FieldLabel>{isSection ? "Section title / info text" : "Question label"}</FieldLabel>
                      <Input value={block.label} onChange={(e) => patchBlock(block.id, { label: e.target.value })} />
                    </div>
                    {OPTION_TYPES.includes(block.type) && (
                      <div>
                        <FieldLabel>Options</FieldLabel>
                        <div className="space-y-2">
                          {(block.options ?? []).map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <Input
                                value={opt}
                                onChange={(e) => {
                                  const options = [...(block.options ?? [])];
                                  options[oi] = e.target.value;
                                  patchBlock(block.id, { options });
                                }}
                              />
                              <IconButton
                                icon="x"
                                label="Remove option"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  patchBlock(block.id, { options: (block.options ?? []).filter((_, x) => x !== oi) });
                                }}
                              />
                            </div>
                          ))}
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon="plus"
                            onClick={(e) => {
                              e.stopPropagation();
                              patchBlock(block.id, { options: [...(block.options ?? []), `Option ${(block.options?.length ?? 0) + 1}`] });
                            }}
                          >
                            Add option
                          </Button>
                        </div>
                      </div>
                    )}
                    {!isSection && (
                      <Toggle
                        checked={!!block.required}
                        onChange={(v) => patchBlock(block.id, { required: v })}
                        label={<span className="text-sm text-text-body">Required</span>}
                      />
                    )}
                  </div>
                ) : isSection ? (
                  <p className="cursor-pointer text-[17px] font-bold text-text" onClick={() => toggleExpanded(block.id)}>
                    {block.label}
                  </p>
                ) : (
                  <div className="cursor-pointer space-y-2.5" onClick={() => toggleExpanded(block.id)}>
                    <p className="text-[15px] font-semibold text-text">
                      {block.label}
                      {block.required && <span className="ml-0.5 text-danger">*</span>}
                    </p>
                    <BlockPreview block={block} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
          </div>
        )}
      </div>

      <SendFormModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        formId={form.id}
        formTitle={title}
        clients={clients}
      />
      </div>
    </>
  );
}
