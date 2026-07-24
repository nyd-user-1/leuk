"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { TopBarActions } from "@/components/shell/topbar-slot";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { forkFromLiveSchema, type SchemaDraftDoc, type SchemaDraftMeta } from "@/lib/schema-draft";
import type { SchemaGraph } from "@/lib/repos/schema-map";
import type { SchemaTableMeta } from "@/components/maps/schema-canvas";

// The Data dictionary's "Draft" tab shell — owns which saved draft is open,
// its name, and the save/load/delete/fork loop against /api/schema-drafts.
// Mirrors app/(app)/maps/maps-client.tsx exactly: the canvas owns nodes/
// edges, this owns the DOCUMENT, and remounts the canvas (key) whenever a
// different doc loads so React Flow state never leaks between drafts.

const SchemaDraftCanvas = dynamic(
  () => import("@/components/maps/schema-draft-canvas").then((m) => m.SchemaDraftCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner size={22} className="text-text-muted" />
      </div>
    ),
  },
);

export function SchemaDraftClient({
  schema,
  meta,
  initialDrafts,
}: {
  schema: SchemaGraph;
  meta: Record<string, SchemaTableMeta>;
  initialDrafts: SchemaDraftMeta[];
}) {
  const [drafts, setDrafts] = useState<SchemaDraftMeta[]>(initialDrafts);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [loadedDoc, setLoadedDoc] = useState<SchemaDraftDoc | null>(null);
  const [canvasKey, setCanvasKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const docRef = useRef<SchemaDraftDoc | null>(null);
  const onDocChange = useCallback((doc: SchemaDraftDoc) => {
    docRef.current = doc;
  }, []);

  const save = async () => {
    const doc = docRef.current ?? { tables: [], edges: [] };
    const finalName = name.trim() || "Untitled draft";
    setSaving(true);
    try {
      if (currentId) {
        const res = await fetch(`/api/schema-drafts/${currentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: finalName, doc }),
        });
        if (res.ok) {
          setName(finalName);
          setDrafts((ds) =>
            ds
              .map((m) => (m.id === currentId ? { ...m, name: finalName, updatedAt: new Date().toISOString() } : m))
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
        }
      } else {
        const res = await fetch("/api/schema-drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: finalName, doc }),
        });
        const data = (await res.json()) as { draft?: SchemaDraftMeta };
        if (data.draft) {
          setCurrentId(data.draft.id);
          setName(data.draft.name);
          setDrafts((ds) => [data.draft!, ...ds]);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const load = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/schema-drafts/${id}`);
      if (!res.ok) return;
      const data = (await res.json()) as { meta: SchemaDraftMeta; doc: SchemaDraftDoc };
      setCurrentId(data.meta.id);
      setName(data.meta.name);
      setLoadedDoc(data.doc);
      docRef.current = data.doc;
      setCanvasKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  const newDraft = () => {
    setCurrentId(null);
    setName("");
    setLoadedDoc(null);
    docRef.current = null;
    setCanvasKey((k) => k + 1);
  };

  const forkDraft = () => {
    const groupOf: Record<string, string> = {};
    for (const [table, m] of Object.entries(meta)) groupOf[table] = m.group;
    const doc = forkFromLiveSchema(schema, groupOf);
    setCurrentId(null);
    setName("Fork of live schema");
    setLoadedDoc(doc);
    docRef.current = doc;
    setCanvasKey((k) => k + 1);
  };

  const del = async () => {
    if (!currentId) return;
    if (!window.confirm(`Delete "${name.trim() || "Untitled draft"}"? This can't be undone.`)) return;
    const res = await fetch(`/api/schema-drafts/${currentId}`, { method: "DELETE" });
    if (res.ok) {
      setDrafts((ds) => ds.filter((m) => m.id !== currentId));
      newDraft();
    }
  };

  return (
    <div className="flex h-[72vh] min-h-[480px] flex-col">
      <TopBarActions>
        <DraftsMenu
          drafts={drafts}
          currentId={currentId}
          onLoad={(id) => void load(id)}
          onNew={newDraft}
          onFork={forkDraft}
          onDelete={currentId ? () => void del() : undefined}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Untitled draft"
          aria-label="Draft name"
          className="h-9 w-44 rounded-field bg-black/[0.04] px-3 text-[14px] text-text outline-none placeholder:text-text-muted focus:ring-2 focus:ring-primary/30"
        />
        <Button size="sm" onClick={() => void save()} disabled={saving || loading}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </TopBarActions>
      <SchemaDraftCanvas key={canvasKey} initialDoc={loadedDoc} onDocChange={onDocChange} />
    </div>
  );
}

// The saved-drafts switcher — same ContextSwitcher-pill pattern as /maps'
// "My maps" menu, plus a "Fork from live schema" starting point.
function DraftsMenu({
  drafts,
  currentId,
  onLoad,
  onNew,
  onFork,
  onDelete,
}: {
  drafts: SchemaDraftMeta[];
  currentId: string | null;
  onLoad: (id: string) => void;
  onNew: () => void;
  onFork: () => void;
  onDelete?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = drafts.find((m) => m.id === currentId);
  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-9 items-center gap-1.5 rounded-field bg-black/[0.04] pl-3 pr-2 text-[14px] transition-colors ${
          open ? "text-primary" : "text-text-body hover:text-primary"
        }`}
      >
        <span className="max-w-[160px] truncate font-medium">{current ? current.name : "My drafts"}</span>
        <span className="ml-0.5 flex shrink-0 flex-col text-text-muted" aria-hidden>
          <Icon name="chevron-up" size={12} className="-mb-[3px]" />
          <Icon name="chevron-down" size={12} className="-mt-[3px]" />
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-card border border-border bg-surface shadow-menu"
        >
          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(onNew)}
              className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[14px] font-medium text-text-body transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-text"
            >
              <Icon name="plus" size={16} className="text-text-muted" />
              New draft
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => pick(onFork)}
              className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[14px] font-medium text-text-body transition-colors hover:bg-[rgba(0,0,0,0.05)] hover:text-text"
            >
              <Icon name="copy" size={16} className="text-text-muted" />
              Fork from live schema
            </button>
          </div>
          {drafts.length > 0 && (
            <div className="max-h-72 overflow-y-auto border-t border-border p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {drafts.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitem"
                  onClick={() => pick(() => onLoad(m.id))}
                  className={`flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[14px] transition-colors ${
                    m.id === currentId
                      ? "bg-[rgba(0,0,0,0.05)] text-text"
                      : "text-text-body hover:bg-[rgba(0,0,0,0.05)] hover:text-text"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                  <span className="text-[12px] text-text-muted">{m.updatedAt.slice(0, 10)}</span>
                </button>
              ))}
            </div>
          )}
          {onDelete && (
            <div className="border-t border-border p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => pick(onDelete)}
                className="flex w-full items-center gap-2.5 rounded-field px-2.5 py-2 text-left text-[14px] text-danger transition-colors hover:bg-danger-tint"
              >
                <Icon name="x" size={15} />
                Delete this draft
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
