"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FormBuilder } from "@/components/forms/form-builder";
import { NoteSheet } from "@/components/notes/note-sheet";
import { TopBarActions } from "@/components/shell/topbar-slot";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { MenuItem } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { FilterChip } from "@/components/ui/filter-chip";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { LibraryCard } from "@/components/ui/library-card";
import { Modal } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Tag, type TagHue } from "@/components/ui/tag";
import { Textarea } from "@/components/ui/textarea";
import { Toolbar } from "@/components/ui/toolbar";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import type { Form, NoteTemplate, NoteTemplateKind } from "@/lib/types";

// Library gallery — A–Z section tabs over a shared LibraryCard grid, a persistent
// search/filter toolbar, and a per-section header (title + "+ New" left, teal count
// right). Notes/Forms are real data (note templates + forms CRUD); the rest are
// scaffold placeholders padded to a 12-card minimum. "Use template" drafts a note.

const KIND_TAG: Record<NoteTemplateKind, { label: string; hue: TagHue }> = {
  soap: { label: "SOAP", hue: "teal" },
  dap: { label: "DAP", hue: "blue" },
  progress: { label: "Progress", hue: "violet" },
  intake: { label: "Intake", hue: "orange" },
  free: { label: "Free note", hue: "grey" },
};

const KIND_OPTIONS = (Object.keys(KIND_TAG) as NoteTemplateKind[]).map((k) => ({
  value: k,
  label: KIND_TAG[k].label,
}));

// Rotating placeholder dates (no Date.now() in this module's render path).
const PLACEHOLDER_DATES = ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"];

// Lorem-ipsum placeholder cards for the collections we have no data for yet.
const LOREM_CARDS: Array<{ name: string; meta: string }> = [
  { name: "Lorem ipsum dolor sit", meta: "Consectetur adipiscing elit, sed do eiusmod tempor incididunt." },
  { name: "Ut enim ad minim veniam", meta: "Quis nostrud exercitation ullamco laboris nisi ut aliquip." },
  { name: "Duis aute irure dolor", meta: "In reprehenderit in voluptate velit esse cillum dolore eu." },
  { name: "Excepteur sint occaecat", meta: "Cupidatat non proident, sunt in culpa qui officia deserunt." },
  { name: "Sed ut perspiciatis unde", meta: "Omnis iste natus error sit voluptatem accusantium doloremque." },
  { name: "Nemo enim ipsam voluptatem", meta: "Quia voluptas sit aspernatur aut odit aut fugit consequuntur." },
  { name: "Neque porro quisquam est", meta: "Qui dolorem ipsum quia dolor sit amet consectetur." },
  { name: "Adipisci velit sed quia", meta: "Non numquam eius modi tempora incidunt ut labore." },
  { name: "Quis autem vel eum", meta: "Iure reprehenderit qui in ea voluptate velit esse." },
  { name: "At vero eos et accusamus", meta: "Iusto odio dignissimos ducimus qui blanditiis praesentium." },
  { name: "Et harum quidem rerum", meta: "Facilis est et expedita distinctio nam libero tempore." },
  { name: "Temporibus autem quibusdam", meta: "Et aut officiis debitis aut rerum necessitatibus saepe." },
];

// Scaffold placeholders (no data model yet) — fill the Community carousels.
const SCAFFOLD_PROMPTS: Array<{ name: string; meta: string }> = [
  { name: "Initial Psychiatric Evaluation", meta: "History · Mental status · Assessment · Plan" },
  { name: "Treatment Plan Review", meta: "Goals · Progress · Barriers · Next steps" },
  { name: "Medication Management", meta: "Current meds · Adherence · Side effects · Plan" },
  { name: "Crisis Assessment", meta: "Risk · Safety plan · Disposition" },
  { name: "Discharge Summary", meta: "Course · Outcomes · Aftercare" },
  { name: "Group Therapy Note", meta: "Theme · Participation · Response · Plan" },
  { name: "Family Session", meta: "Attendees · Dynamics · Interventions · Plan" },
  { name: "Telehealth Check-in", meta: "Presenting concern · Status · Plan" },
  { name: "Relapse Prevention Plan", meta: "Triggers · Coping skills · Supports" },
];

const SCAFFOLD_ASSESSMENTS: Array<{ name: string; meta: string }> = [
  { name: "GAD-7 Anxiety", meta: "7 items · Auto-scored 0–21" },
  { name: "PHQ-9 Depression", meta: "9 items · Auto-scored 0–27" },
  { name: "PCL-5 (PTSD)", meta: "20 items · Auto-scored" },
  { name: "AUDIT (Alcohol Use)", meta: "10 items · Auto-scored" },
  { name: "Adult ADHD Self-Report", meta: "18 items · Auto-scored" },
  { name: "Columbia Suicide Severity", meta: "Risk screen · Auto-scored" },
  { name: "Edinburgh Postnatal", meta: "10 items · Auto-scored" },
  { name: "MDQ (Bipolar Screen)", meta: "13 items · Auto-scored" },
  { name: "DASS-21", meta: "21 items · Depression / Anxiety / Stress" },
  { name: "Y-BOCS (OCD)", meta: "10 items · Auto-scored" },
  { name: "PSC-17 (Pediatric)", meta: "17 items · Auto-scored" },
  { name: "WHODAS 2.0", meta: "12 items · Auto-scored" },
];

/** "## Subjective\n…## Plan" → "Subjective · Objective · … " section preview. */
function sectionPreview(bodyMd: string): string {
  const heads = [...bodyMd.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) => m[1].trim());
  if (heads.length > 0) return heads.join(" · ");
  const text = bodyMd.replace(/[#>*`_-]/g, "").trim();
  return text ? text.slice(0, 120) : "Blank canvas — free-form note.";
}

type ClientOption = { id: string; name: string };

interface EditorState {
  id: string | null; // null = create
  name: string;
  template: NoteTemplateKind;
  bodyMd: string;
  isBuiltin: boolean;
}

// FilterChip + attached popover — same pattern as the Clients/Directory index toolbars.
function ChipMenu({
  label,
  value,
  options,
  onSelect,
  onClear,
}: {
  label: string;
  value?: string;
  options: string[];
  onSelect: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);
  const searchable = options.length > 6;
  const shown = searchable && term ? options.filter((o) => o.toLowerCase().includes(term.toLowerCase())) : options;
  return (
    <span ref={ref} className="relative">
      <FilterChip label={label} value={value} onClick={() => setOpen((o) => !o)} onClear={onClear} />
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-56 rounded-card border border-border bg-surface p-2 shadow-menu">
          {searchable && (
            <SearchInput
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={`Filter ${label.toLowerCase()}…`}
              className="mb-1.5 w-full"
            />
          )}
          <div className="max-h-64 overflow-y-auto">
            {shown.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  onSelect(o);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-[15px] transition-colors hover:bg-[#F3F4F6] ${
                  o === value ? "font-semibold text-primary" : "text-text"
                }`}
              >
                <span className="flex-1">{o}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

export function TemplatesIndex({ isAdmin = false }: { isAdmin?: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const [status, setStatus] = useState<string | undefined>();
  const [templates, setTemplates] = useState<NoteTemplate[] | null>(null);
  const [forms, setForms] = useState<Array<Form & { responseCount: number }> | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [useTarget, setUseTarget] = useState<NoteTemplate | null>(null);
  const [useClient, setUseClient] = useState("");
  const [using, setUsing] = useState(false);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<(Form & { responseCount: number }) | null>(null);
  // Operations → SignNow action modal ("sign" = in-app signing session, "send"
  // = email a signature invite).
  const [actionDoc, setActionDoc] = useState<{ slug: string; title: string; mode: "send" | "sign" } | null>(null);
  const [sendEmail, setSendEmail] = useState("");
  const [sendName, setSendName] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch("/api/templates")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load templates");
        setTemplates(json.templates);
        setClients(json.clients ?? []);
      })
      .catch((e) => {
        toast(e instanceof Error ? e.message : "Failed to load templates", "danger");
        setTemplates([]);
      });
  }, [toast]);

  useEffect(() => {
    fetch("/api/forms")
      .then((r) => (r.ok ? r.json() : { forms: [] }))
      .then((d) => setForms(d.forms ?? []))
      .catch(() => setForms([]));
  }, []);

  // ← / → move between the content tabs (A–Z sections). Ignored while typing in
  // a field or when a modal/dialog is open.
  useEffect(() => {
    const order = ["all", "assessments", "forms", "notes", "prompts"];
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      setTab((cur) => {
        const i = order.indexOf(cur);
        if (i === -1) return cur;
        const next = e.key === "ArrowRight" ? Math.min(order.length - 1, i + 1) : Math.max(0, i - 1);
        return order[next];
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function saveEditor() {
    if (!editor || !editor.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(editor.id ? `/api/templates/${editor.id}` : "/api/templates", {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editor.id
            ? { name: editor.name, bodyMd: editor.bodyMd }
            : { name: editor.name, template: editor.template, bodyMd: editor.bodyMd },
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setTemplates((ts) =>
        editor.id
          ? (ts ?? []).map((t) => (t.id === editor.id ? json.template : t))
          : [...(ts ?? []), json.template],
      );
      toast(editor.id ? "Template updated" : "Template created", "success");
      setEditor(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "danger");
    } finally {
      setSaving(false);
    }
  }

  async function useTemplate() {
    if (!useTarget || !useClient) return;
    setUsing(true);
    try {
      const d = new Date();
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: useClient,
          template: useTarget.template,
          title: `${useTarget.name} ${d.getMonth() + 1}/${d.getDate()}`,
          bodyMd: useTarget.bodyMd,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create note");
      setUseTarget(null);
      setOpenNoteId(json.note.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create note", "danger");
    } finally {
      setUsing(false);
    }
  }

  // ── form actions (create / duplicate / delete) ──────────────────────────────
  const refreshForms = async () => {
    const d = await fetch("/api/forms").then((r) => r.json()).catch(() => null);
    if (d) setForms(d.forms ?? []);
  };

  // Opening a form replaces the grid in place (below the Tabs) rather than
  // navigating to a separate page; closing it refreshes the grid so any
  // title/status edits made in the builder show up on the card.
  const closeForm = () => {
    setOpenForm(null);
    refreshForms();
  };

  const createForm = async () => {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled form", schema: [] }),
    });
    if (!res.ok) return toast("Could not create the form.", "danger");
    const form = await res.json();
    const withCount = { ...form, responseCount: 0 };
    setForms((fs) => [...(fs ?? []), withCount]);
    setOpenForm(withCount);
  };
  const duplicateForm = async (f: Form) => {
    const res = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Copy of ${f.title}`, description: f.description, schema: f.schema }),
    });
    if (!res.ok) return toast("Could not duplicate the form.", "danger");
    toast(`Duplicated "${f.title}".`, "success");
    const d = await fetch("/api/forms").then((r) => r.json()).catch(() => null);
    if (d) setForms(d.forms ?? []);
  };
  const deleteForm = async (f: Form) => {
    if (!window.confirm(`Delete "${f.title}"? This also removes its responses and can't be undone.`)) return;
    const res = await fetch(`/api/forms/${f.id}`, { method: "DELETE" });
    if (!res.ok) return toast("Could not delete the form.", "danger");
    toast(`Deleted "${f.title}".`, "success");
    setForms((fs) => (fs ?? []).filter((x) => x.id !== f.id));
  };

  const cardGrid = (children: ReactNode) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
  );

  const comingSoon = () => toast("Coming soon.", "info");

  // Operations doc → SignNow: "sign" opens an in-app signing session in a new
  // tab; "send" emails the signer an invite.
  const submitAction = async () => {
    if (!actionDoc || !sendEmail.trim()) return;
    setSending(true);
    try {
      const endpoint = actionDoc.mode === "sign" ? "sign" : "send";
      const res = await fetch(`/api/library/operations/${actionDoc.slug}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: sendEmail.trim(), name: sendName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      if (actionDoc.mode === "sign") {
        window.open(json.link, "_blank", "noopener,noreferrer");
        toast(`Opening the signing session for "${actionDoc.title}".`, "success");
      } else {
        toast(`Sent "${actionDoc.title}" to ${sendEmail.trim()} for signature.`, "success");
      }
      setActionDoc(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong.", "danger");
    } finally {
      setSending(false);
    }
  };

  // Kebab shared by every card. Rename shows only on cards you created (duplicate
  // a built-in, then rename the copy — the Figma "duplicate to rename" scheme).
  const cardMenu = (
    label: string,
    o: { canRename?: boolean; onDuplicate?: () => void; onRename?: () => void; onDelete?: () => void },
  ) => (
    <KebabMenu label={label}>
      <MenuItem icon="star" label="Favorite" onClick={comingSoon} />
      <MenuItem icon="copy" label="Duplicate" onClick={o.onDuplicate ?? comingSoon} />
      {o.canRename && <MenuItem icon="edit" label="Rename" onClick={o.onRename ?? comingSoon} />}
      <MenuItem icon="send" label="Share" onClick={comingSoon} />
      <MenuItem icon="trash" label="Delete" danger onClick={o.onDelete ?? comingSoon} />
    </KebabMenu>
  );

  // Per-category tag hue — the category tag is the first tag on every card.
  const CAT_HUE: Record<string, TagHue> = {
    Assessments: "orange",
    Forms: "yellow",
    Guidelines: "cyan",
    Notes: "pink",
    "Plans & reports": "green",
    Prompts: "violet",
    Worksheets: "teal",
    Handouts: "blue",
    Operations: "red",
  };

  // Each card: a category tag (first) + one secondary tag, bottom-left. `statusLabel`
  // is the secondary tag's plain-text value, kept alongside the rendered `tag` node
  // so the Status filter can match against it.
  type LibItem = { id: string; title: string; description: string; date: string; category: string; statusLabel: string; tag: ReactNode; onOpen: () => void; menu: ReactNode };

  const noteItem = (t: NoteTemplate, category: string): LibItem => {
    const kind = KIND_TAG[t.template];
    return {
      id: t.id,
      title: t.name,
      description: sectionPreview(t.bodyMd),
      date: formatDate(t.updatedAt),
      category,
      statusLabel: kind.label,
      tag: <Tag hue={kind.hue}>{kind.label}</Tag>,
      onOpen: () => {
        setUseClient(clients[0]?.id ?? "");
        setUseTarget(t);
      },
      menu: cardMenu(`Actions for ${t.name}`, {
        canRename: !t.isBuiltin,
        onDuplicate: () => setEditor({ id: null, name: `${t.name} (copy)`, template: t.template, bodyMd: t.bodyMd, isBuiltin: false }),
        onRename: () => setEditor({ id: t.id, name: t.name, template: t.template, bodyMd: t.bodyMd, isBuiltin: t.isBuiltin }),
      }),
    };
  };

  const formItem = (f: Form & { responseCount: number }, category: string): LibItem => ({
    id: f.id,
    title: f.title,
    description:
      f.description ??
      `${f.schema.length} question${f.schema.length === 1 ? "" : "s"} · ${f.responseCount} response${f.responseCount === 1 ? "" : "s"}`,
    date: formatDate(f.updatedAt),
    category,
    statusLabel: f.status === "published" ? "Published" : "Draft",
    tag: <Badge variant={f.status === "published" ? "success" : "warning"}>{f.status === "published" ? "Published" : "Draft"}</Badge>,
    onOpen: () => setOpenForm(f),
    menu: cardMenu(`Actions for ${f.title}`, {
      canRename: true,
      onDuplicate: () => duplicateForm(f),
      onRename: () => setOpenForm(f),
      onDelete: () => deleteForm(f),
    }),
  });

  const scaffoldItem = (id: string, title: string, meta: string, badge: string, date: string, category: string): LibItem => ({
    id,
    title,
    description: meta,
    date,
    category,
    statusLabel: badge,
    tag: <Badge variant="neutral">{badge}</Badge>,
    onOpen: comingSoon,
    menu: cardMenu(`Actions for ${title}`, { canRename: true, onDuplicate: comingSoon, onRename: comingSoon, onDelete: comingSoon }),
  });

  // Operations documents (admin-only) — real PDFs served off disk via the
  // admin-gated /api/library/operations route; open inline in a new tab.
  const opsDoc = (slug: string, title: string, description: string): LibItem => ({
    id: `ops-${slug}`,
    title,
    description,
    date: "Jul 2026",
    category: "Operations",
    statusLabel: "PDF",
    tag: <Tag hue="grey">PDF</Tag>,
    onOpen: () => {
      setSendName("");
      setSendEmail("");
      setActionDoc({ slug, title, mode: "sign" });
    },
    menu: (
      <KebabMenu label={`Actions for ${title}`}>
        <MenuItem
          icon="edit"
          label="Open & sign"
          onClick={() => {
            setSendName("");
            setSendEmail("");
            setActionDoc({ slug, title, mode: "sign" });
          }}
        />
        <MenuItem
          icon="send"
          label="Send for signature"
          onClick={() => {
            setSendName("");
            setSendEmail("");
            setActionDoc({ slug, title, mode: "send" });
          }}
        />
        <MenuItem
          icon="note"
          label="View PDF"
          onClick={() => window.open(`/api/library/operations/${slug}`, "_blank", "noopener,noreferrer")}
        />
      </KebabMenu>
    ),
  });

  const dateFor = (i: number) => PLACEHOLDER_DATES[i % PLACEHOLDER_DATES.length];
  const loremItems = (category: string) =>
    LOREM_CARDS.map((l, i) => scaffoldItem(l.name, l.name, l.meta, "Placeholder", dateFor(i), category));
  // Pad a real section up to a minimum of 12 cards with lorem placeholders.
  const padTo12 = (items: LibItem[], category: string): LibItem[] => {
    const out = [...items];
    for (let i = 0; out.length < 12; i++) {
      const l = LOREM_CARDS[i % LOREM_CARDS.length];
      const name = `${l.name} · ${category} ${i + 1}`;
      out.push(scaffoldItem(name, name, l.meta, "Placeholder", dateFor(i), category));
    }
    return out;
  };

  const sortAZ = (items: LibItem[]) => [...items].sort((a, b) => a.title.localeCompare(b.title));
  const newNote = () => setEditor({ id: null, name: "", template: "progress", bodyMd: "", isBuiltin: false });
  const notes = templates ?? [];
  const formList = forms ?? [];

  // A–Z sorted sections; cards within each section are also sorted A–Z.
  const SECTIONS: Array<{ key: string; title: string; onNew: () => void; items: LibItem[] }> = [
    { key: "assessments", title: "Assessments", onNew: comingSoon, items: sortAZ(SCAFFOLD_ASSESSMENTS.map((a, i) => scaffoldItem(a.name, a.name, a.meta, "Auto-scored", dateFor(i), "Assessments"))) },
    { key: "forms", title: "Forms", onNew: createForm, items: sortAZ(formList.map((f) => formItem(f, "Forms"))) },
    { key: "guidelines", title: "Guidelines", onNew: comingSoon, items: sortAZ(loremItems("Guidelines")) },
    { key: "notes", title: "Notes", onNew: newNote, items: sortAZ(padTo12(notes.map((t) => noteItem(t, "Notes")), "Notes")) },
    { key: "plans", title: "Plans & reports", onNew: comingSoon, items: sortAZ(loremItems("Plans & reports")) },
    { key: "prompts", title: "Prompts", onNew: newNote, items: sortAZ(padTo12([...notes.map((t) => noteItem(t, "Prompts")), ...SCAFFOLD_PROMPTS.map((p, i) => scaffoldItem(p.name, p.name, p.meta, "Community", dateFor(i), "Prompts"))], "Prompts")) },
    { key: "worksheets", title: "Worksheets", onNew: comingSoon, items: sortAZ(loremItems("Worksheets")) },
    { key: "handouts", title: "Handouts", onNew: comingSoon, items: sortAZ(loremItems("Handouts")) },
  ].sort((a, b) => a.title.localeCompare(b.title));

  // Operations — admin-only governance docs. Appended AFTER the A–Z sort so it
  // sits last (deliberately last, not alphabetical), and only for the admin.
  if (isAdmin) {
    SECTIONS.push({
      key: "operations",
      title: "Operations",
      onNew: comingSoon,
      items: [
        opsDoc("hipaa-policy", "HIPAA Compliance Policy", "Practice HIPAA policies & procedures."),
      ],
    });
  }

  const allCategories = SECTIONS.map((s) => s.title);
  const allStatuses = [...new Set(SECTIONS.flatMap((s) => s.items.map((it) => it.statusLabel)))].sort();

  const q = search.trim().toLowerCase();
  const matches = (it: LibItem) => {
    if (category && it.category !== category) return false;
    if (status && it.statusLabel !== status) return false;
    if (q && !it.title.toLowerCase().includes(q)) return false;
    return true;
  };
  const card = (it: LibItem) => (
    <LibraryCard
      key={it.id}
      title={it.title}
      description={it.description}
      date={it.date}
      tags={
        <>
          <Tag hue={CAT_HUE[it.category] ?? "grey"}>{it.category}</Tag>
          {it.tag}
        </>
      }
      menu={it.menu}
      onOpen={it.onOpen}
    />
  );

  // On the All view each section shows a heading + two rows + "View more". On a
  // section tab the heading is dropped (redundant with the tab) and all cards show.
  const renderSection = (s: (typeof SECTIONS)[number], full: boolean) => {
    const items = s.items.filter(matches);
    const shown = full ? items : items.slice(0, 6);
    return (
      <section key={s.key}>
        {!full && (
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-[19px] font-bold text-text">{s.title}</h2>
            <span className="ml-auto text-[15px] font-semibold text-text-body">{items.length}</span>
          </div>
        )}
        {cardGrid(shown.map(card))}
        {!full && items.length > 6 && (
          <div className="mt-4">
            <Button variant="ghost" size="sm" onClick={() => setTab(s.key)}>
              View more
            </Button>
          </div>
        )}
      </section>
    );
  };

  const activeSection = SECTIONS.find((s) => s.key === tab);
  const newAction = activeSection ? activeSection.onNew : newNote;

  // Visible tabs: All + these four; the rest live behind a "View More" dropdown.
  const PRIMARY_TABS = ["assessments", "forms", "notes", "prompts"];
  const primaryTabItems = [
    { key: "all", label: "All" },
    ...SECTIONS.filter((s) => PRIMARY_TABS.includes(s.key)).map((s) => ({ key: s.key, label: s.title })),
  ];
  const overflowTabItems = SECTIONS.filter((s) => !PRIMARY_TABS.includes(s.key)).map((s) => ({ key: s.key, label: s.title }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Page primary action lives in the TopBar, right after the H1. */}
      {!openForm && (
        <TopBarActions>
          <Button leftIcon="plus" size="sm" onClick={newAction}>
            New template
          </Button>
        </TopBarActions>
      )}

      <Tabs
        className="mt-4 mb-4 shrink-0"
        active={tab}
        onChange={setTab}
        items={primaryTabItems}
        overflow={overflowTabItems}
        overflowLabel="View More"
      />

      {/* Persistent search + filters across every tab view */}
      <Toolbar className="mb-4 shrink-0 flex-wrap">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the library…"
          className="max-w-md flex-1"
        />
        <ChipMenu label="Status" value={status} options={allStatuses} onSelect={setStatus} onClear={() => setStatus(undefined)} />
        <ChipMenu label="Tags" value={category} options={allCategories} onSelect={setCategory} onClear={() => setCategory(undefined)} />
      </Toolbar>

      {/* Opening a form takes the place of the card grid, below the toolbar,
          instead of navigating away; the breadcrumb toggles back to the grid. */}
      {openForm ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Breadcrumb
            className="mb-4 shrink-0"
            items={[{ label: "Library", onClick: closeForm }, { label: openForm.title || "Untitled form" }]}
          />
          <FormBuilder form={openForm} clients={clients} onBack={closeForm} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "all" ? (
            <div className="space-y-16">{SECTIONS.map((s) => renderSection(s, false))}</div>
          ) : activeSection ? (
            renderSection(activeSection, true)
          ) : null}
        </div>
      )}

      {/* create / edit template — centered Modal (scrim overlay) suits this form better than a slide-over */}
      <Modal
        open={editor !== null}
        onClose={() => setEditor(null)}
        title={editor?.id ? "Edit template" : "New template"}
        icon="note"
        width="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button onClick={saveEditor} loading={saving} disabled={!editor?.name.trim()}>
              {editor?.id ? "Save changes" : "Create template"}
            </Button>
          </>
        }
      >
        {editor && (
          <div className="flex flex-col gap-5">
            <Field
              label="Template name"
              required
              value={editor.name}
              onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              placeholder="e.g. Initial psychiatric evaluation"
            />
            {editor.id ? (
              <div>
                <p className="mb-1.5 text-sm font-medium text-text-body">Note type</p>
                <Tag hue={KIND_TAG[editor.template].hue}>{KIND_TAG[editor.template].label}</Tag>
              </div>
            ) : (
              <Select
                label="Note type"
                options={KIND_OPTIONS}
                value={editor.template}
                onValueChange={(v) => setEditor({ ...editor, template: v as NoteTemplateKind })}
              />
            )}
            <Textarea
              label="Structure (markdown)"
              rows={14}
              value={editor.bodyMd}
              onChange={(e) => setEditor({ ...editor, bodyMd: e.target.value })}
              placeholder={"## Subjective\n\n## Objective\n\n## Assessment\n\n## Plan"}
              hint="Sections become the pre-filled skeleton of every note started from this template."
              className="[&_textarea]:font-mono [&_textarea]:text-sm"
            />
          </div>
        )}
      </Modal>

      {/* use template → pick client → draft note */}
      {useTarget && (
        <Modal
          open
          onClose={() => setUseTarget(null)}
          title={`Use "${useTarget.name}"`}
          icon="note"
          footer={
            <>
              <Button variant="secondary" onClick={() => setUseTarget(null)}>
                Cancel
              </Button>
              <Button onClick={useTemplate} loading={using} disabled={!useClient}>
                Create note
              </Button>
            </>
          }
        >
          <p className="mb-4 text-[15px] text-text-body">
            Start a {KIND_TAG[useTarget.template].label} note pre-filled with this template&apos;s
            sections.
          </p>
          <Select
            label="Client"
            required
            searchable
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            value={useClient}
            onValueChange={setUseClient}
            placeholder="Choose a client…"
          />
        </Modal>
      )}

      {openNoteId && <NoteSheet noteId={openNoteId} onClose={() => setOpenNoteId(null)} defaultBig />}

      {/* Operations → open an in-app signing session, or email a signature invite */}
      {actionDoc && (
        <Modal
          open
          onClose={() => setActionDoc(null)}
          title={actionDoc.mode === "sign" ? `Sign "${actionDoc.title}"` : `Send "${actionDoc.title}" for signature`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setActionDoc(null)}>
                Cancel
              </Button>
              <Button onClick={submitAction} loading={sending} disabled={!sendEmail.trim()}>
                {actionDoc.mode === "sign" ? "Open signing session" : "Send via SignNow"}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <p className="text-[15px] text-text-body">
              {actionDoc.mode === "sign" ? (
                <>
                  Opens a secure SignNow signing session for{" "}
                  <span className="font-semibold text-text">{actionDoc.title}</span> in a new tab — the
                  signer signs in the browser and the completed PDF returns to your SignNow account.
                  The signer can&apos;t be the SignNow account owner.
                </>
              ) : (
                <>
                  SignNow emails the signer a secure link to review and sign{" "}
                  <span className="font-semibold text-text">{actionDoc.title}</span>. The completed,
                  countersigned PDF returns to your SignNow account.
                </>
              )}
            </p>
            <Field
              label="Signer name"
              value={sendName}
              onChange={(e) => setSendName(e.target.value)}
              placeholder="e.g. Jordan Rivera"
            />
            <Field
              label="Signer email"
              required
              value={sendEmail}
              onChange={(e) => setSendEmail(e.target.value)}
              placeholder="signer@example.com"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
