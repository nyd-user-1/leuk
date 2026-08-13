"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CodeSwitcher, RateEdge, rateParts } from "@/components/orgs/org-map";
import { InsurerMark } from "@/components/rates/insurer-mark";
import { ALL_CPTS } from "@/components/rates/cpt";
import { Icon, type IconName } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";
import { providerDisplayName } from "@/lib/format";
import type { CanvasDoc, CanvasEdges, CanvasNodeKind } from "@/lib/canvas";

// The /maps builder — a blank canvas you drag entities onto; the rate corpus
// draws the edges. Drop an Organization / Insurer / Provider card from the
// palette, bind it via the inline finder, and every relationship the corpus
// attests among the bound entities appears automatically, with the org-map
// chip grammar (one published rate = the dollar fact; several = the count).
// You sketch the structure; the data fills in the money. Users never draw
// edges by hand (nodesConnectable stays false) — an edge here is a CLAIM, and
// only the corpus gets to make claims.
//
// One of the canvas files (@xyflow/react is imported only by org-map and
// components/maps/*); loaded via next/dynamic from maps-client so the
// library stays out of other bundles.

const TEAL = "#3F8290";
const DND_KIND = "application/leuk-canvas-kind";
const NODE_W = 260;

const KIND_META: Record<CanvasNodeKind, { label: string; icon: IconName; hint: string }> = {
  org: { label: "Organization", icon: "id-card", hint: "Group practice or platform (by name or EIN)" },
  payer: { label: "Insurer", icon: "credit-card", hint: "An insurance plan from the rate corpus" },
  provider: { label: "Provider", icon: "person-circle", hint: "An individual clinician (by name)" },
};

type BoundData = { kind: CanvasNodeKind; ref: string; label: string; sub?: string | null };
type PickerData = {
  kind: CanvasNodeKind;
  payers: string[];
  onBind: (nodeId: string, ref: string, label: string, sub?: string | null) => void;
  onCancel: (nodeId: string) => void;
};

const anchor = "!h-px !w-px !min-h-0 !min-w-0 !border-0 !bg-transparent";

// ── Bound node skins (the org-map cards, sized for a free canvas) ────────────

function BoundOrgNode(props: NodeProps) {
  const d = props.data as unknown as BoundData;
  return (
    <div className="rounded-card bg-[#1C2440] px-4 py-3 text-white shadow-card" style={{ width: NODE_W }}>
      <p className="truncate text-[14px] font-semibold leading-snug" title={d.label}>{d.label}</p>
      {d.sub && <p className="mt-0.5 truncate text-[12px] text-white/70">{d.sub}</p>}
      <Handle type="target" position={Position.Left} className={anchor} />
      <Handle type="source" position={Position.Right} className={anchor} />
    </div>
  );
}

function BoundPayerNode(props: NodeProps) {
  const d = props.data as unknown as BoundData;
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3 shadow-card" style={{ width: NODE_W }}>
      <span className="flex items-center gap-2.5">
        <InsurerMark payer={d.label} />
        <span className="block min-w-0 truncate text-[14px] font-semibold leading-snug text-text" title={d.label}>
          {d.label}
        </span>
      </span>
      <Handle type="target" position={Position.Left} className={anchor} />
      <Handle type="source" position={Position.Right} className={anchor} />
    </div>
  );
}

function BoundProviderNode(props: NodeProps) {
  const d = props.data as unknown as BoundData;
  return (
    <div className="rounded-field border border-border bg-surface px-3 py-2 shadow-card" style={{ width: NODE_W - 20 }}>
      <p className="truncate text-[13px] font-medium text-text" title={d.label}>{d.label}</p>
      {d.sub && <p className="truncate text-[11.5px] text-text-muted">{d.sub}</p>}
      <Handle type="target" position={Position.Left} className={anchor} />
      <Handle type="source" position={Position.Right} className={anchor} />
    </div>
  );
}

// ── The picker node: a dropped card is a finder until it binds ───────────────

function PickerNode(props: NodeProps) {
  const d = props.data as unknown as PickerData;
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Array<{ ref: string; label: string; sub?: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (d.kind === "payer") {
      const needle = q.trim().toLowerCase();
      const hits = needle ? d.payers.filter((p) => p.toLowerCase().includes(needle)) : d.payers;
      setItems(hits.slice(0, 6).map((p) => ({ ref: p, label: p })));
      return;
    }
    const needle = q.trim();
    if (needle.length < 2) {
      setItems([]);
      return;
    }
    let stale = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(needle)}`);
        const data = (await res.json()) as {
          groups?: Array<{ type: string; items: Array<{ id: string; title: string; subtitle?: string }> }>;
        };
        if (stale) return;
        const group = (data.groups ?? []).find((g) => g.type === (d.kind === "org" ? "orgs" : "providers"));
        setItems(
          (group?.items ?? []).map((it) => ({
            ref: it.id,
            label: d.kind === "provider" ? providerDisplayName(it.title) : it.title,
            sub: it.subtitle ?? null,
          })),
        );
      } catch {
        if (!stale) setItems([]);
      } finally {
        if (!stale) setBusy(false);
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q, d.kind, d.payers]);

  const meta = KIND_META[d.kind];
  return (
    <div
      className="rounded-card border border-dashed border-field-border bg-surface p-3 shadow-card"
      style={{ width: NODE_W + 20 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-text-muted">
          <Icon name={meta.icon} size={14} />
          {meta.label}
        </span>
        <button
          type="button"
          onClick={() => d.onCancel(props.id)}
          aria-label="Remove this card"
          className="nodrag flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-canvas hover:text-text"
        >
          <Icon name="x" size={13} />
        </button>
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={d.kind === "payer" ? "Find an insurer…" : `Find… (${meta.hint})`}
        aria-label={`Find ${meta.label}`}
        className="nodrag nopan mt-2 w-full rounded-field bg-canvas px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-text-muted focus:ring-2 focus:ring-primary/30"
      />
      <div className="nodrag mt-1.5 flex flex-col">
        {busy && (
          <div className="flex items-center gap-2 px-1 py-1.5 text-[12px] text-text-muted">
            <Spinner size={13} /> Searching…
          </div>
        )}
        {!busy &&
          items.map((it) => (
            <button
              key={it.ref}
              type="button"
              onClick={() => d.onBind(props.id, it.ref, it.label, it.sub)}
              className="rounded-field px-2 py-1.5 text-left transition-colors hover:bg-[rgba(0,0,0,0.05)]"
            >
              <span className="block truncate text-[13px] font-medium text-text">{it.label}</span>
              {it.sub && <span className="block truncate text-[11.5px] text-text-muted">{it.sub}</span>}
            </button>
          ))}
        {!busy && !items.length && q.trim().length >= 2 && (
          <p className="px-1 py-1.5 text-[12px] text-text-muted">No matches.</p>
        )}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  org: BoundOrgNode,
  payer: BoundPayerNode,
  provider: BoundProviderNode,
  picker: PickerNode,
};
const edgeTypes: EdgeTypes = { rate: RateEdge };

// ── doc ↔ canvas ─────────────────────────────────────────────────────────────

function fromDoc(doc: CanvasDoc | null): Node[] {
  return (doc?.nodes ?? [])
    .filter((n): n is typeof n & { ref: string } => n.ref !== null)
    .map((n) => ({
      id: n.id,
      type: n.kind,
      position: { x: n.x, y: n.y },
      data: { kind: n.kind, ref: n.ref, label: n.label, sub: n.sub ?? null } satisfies BoundData,
    }));
}

function toDoc(nodes: Node[], code: string): CanvasDoc {
  return {
    code,
    nodes: nodes
      .filter((n) => n.type !== "picker")
      .map((n) => {
        const d = n.data as unknown as BoundData;
        return {
          id: n.id,
          kind: d.kind,
          ref: d.ref,
          label: d.label,
          sub: d.sub ?? null,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        };
      }),
  };
}

// ── The builder ──────────────────────────────────────────────────────────────

const ALL_CODES = ALL_CPTS.map((c) => c.code);

function BuilderInner({
  payers,
  initialDoc,
  onDocChange,
}: {
  payers: string[];
  initialDoc: CanvasDoc | null;
  onDocChange: (doc: CanvasDoc) => void;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>(() => fromDoc(initialDoc));
  const [code, setCode] = useState(initialDoc?.code ?? "90837");
  const [corpus, setCorpus] = useState<CanvasEdges | null>(null);
  const [hydrating, setHydrating] = useState(false);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );

  const bindNode = useCallback((nodeId: string, ref: string, label: string, sub?: string | null) => {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const kind = (n.data as unknown as PickerData).kind;
        return { ...n, type: kind, data: { kind, ref, label, sub: sub ?? null } satisfies BoundData };
      }),
    );
  }, []);
  const cancelNode = useCallback((nodeId: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId));
  }, []);

  // Palette drop → a picker node at the release point.
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const kind = e.dataTransfer.getData(DND_KIND) as CanvasNodeKind;
      if (!KIND_META[kind]) return;
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setNodes((ns) => [
        ...ns,
        {
          id: crypto.randomUUID(),
          type: "picker",
          position,
          data: { kind, payers, onBind: bindNode, onCancel: cancelNode } satisfies PickerData,
        },
      ]);
    },
    [screenToFlowPosition, payers, bindNode, cancelNode],
  );

  // Corpus hydration: whenever the set of bound refs changes, ask the server
  // what it can attest among them. Signature-keyed so drags don't refetch.
  const refs = useMemo(() => {
    const out = { orgs: [] as string[], payers: [] as string[], providers: [] as string[] };
    for (const n of nodes) {
      if (n.type === "picker") continue;
      const d = n.data as unknown as BoundData;
      if (d.kind === "org") out.orgs.push(d.ref);
      else if (d.kind === "payer") out.payers.push(d.ref);
      else out.providers.push(d.ref);
    }
    out.orgs = [...new Set(out.orgs)].sort();
    out.payers = [...new Set(out.payers)].sort();
    out.providers = [...new Set(out.providers)].sort();
    return out;
  }, [nodes]);
  const sig = JSON.stringify(refs);
  useEffect(() => {
    const parsed = JSON.parse(sig) as typeof refs;
    const pairs =
      (parsed.orgs.length && parsed.payers.length) ||
      (parsed.orgs.length && parsed.providers.length) ||
      (parsed.providers.length && parsed.payers.length);
    if (!pairs) {
      setCorpus(null);
      return;
    }
    let stale = false;
    setHydrating(true);
    fetch("/api/maps/edges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: sig,
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data: CanvasEdges) => {
        if (!stale) setCorpus(data);
      })
      .catch(() => {
        if (!stale) setCorpus(null);
      })
      .finally(() => {
        if (!stale) setHydrating(false);
      });
    return () => {
      stale = true;
    };
  }, [sig]);

  // Report the serializable doc upward on every structural change.
  useEffect(() => {
    onDocChange(toDoc(nodes, code));
  }, [nodes, code, onDocChange]);

  // Corpus claims → edges between every matching node pair (the same entity
  // may sit on the canvas twice; each instance gets its edge).
  const edges = useMemo<Edge[]>(() => {
    if (!corpus) return [];
    const byRef = (kind: CanvasNodeKind, ref: string) =>
      nodes.filter((n) => n.type === kind && (n.data as unknown as BoundData).ref === ref);
    const out: Edge[] = [];
    for (const e of corpus.orgPayer) {
      for (const a of byRef("org", e.tin)) {
        for (const b of byRef("payer", e.payer)) {
          const rate = e.rates[code];
          out.push({
            id: `op:${a.id}:${b.id}`,
            source: a.id,
            target: b.id,
            type: "rate",
            data: { ...rateParts(rate), href: e.href },
            style: {
              stroke: TEAL,
              strokeOpacity: rate ? 0.85 : 0.35,
              strokeWidth: rate?.kind === "published" ? 2.5 : 1.5,
            },
          });
        }
      }
    }
    for (const e of corpus.providerOrg) {
      for (const a of byRef("provider", e.npi)) {
        for (const b of byRef("org", e.tin)) {
          out.push({
            id: `m:${a.id}:${b.id}`,
            source: a.id,
            target: b.id,
            style: { stroke: TEAL, strokeOpacity: 0.3, strokeWidth: 1 },
            interactionWidth: 0,
          });
        }
      }
    }
    for (const e of corpus.providerPayer) {
      for (const a of byRef("provider", e.npi)) {
        for (const b of byRef("payer", e.payer)) {
          const rate = e.rates[code];
          out.push({
            id: `pp:${a.id}:${b.id}`,
            source: a.id,
            target: b.id,
            type: "rate",
            data: { ...rateParts(rate), href: `/directory/providers/${e.npi}`, title: "Open provider profile" },
            style: {
              stroke: TEAL,
              strokeOpacity: rate ? 0.7 : 0.3,
              strokeWidth: rate?.kind === "published" ? 2 : 1.25,
            },
          });
        }
      }
    }
    return out;
  }, [corpus, nodes, code]);

  return (
    <div
      className="min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-[#FAFAFA]"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        {/* The palette: drag a card onto the canvas, then bind it. */}
        <Panel position="top-left" className="flex flex-col gap-1.5">
          {(Object.keys(KIND_META) as CanvasNodeKind[]).map((kind) => (
            <div
              key={kind}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DND_KIND, kind);
                e.dataTransfer.effectAllowed = "move";
              }}
              title={KIND_META[kind].hint}
              className="flex w-40 cursor-grab items-center gap-2 rounded-field border border-border bg-surface px-3 py-2 text-[13px] font-medium text-text-body shadow-card transition-colors hover:border-primary hover:text-primary active:cursor-grabbing"
            >
              <Icon name={KIND_META[kind].icon} size={15} className="text-text-muted" />
              {KIND_META[kind].label}
            </div>
          ))}
          <p className="mt-0.5 w-44 text-[11.5px] leading-snug text-text-muted">
            Drag onto the canvas. Edges draw themselves from published rates.
          </p>
          {hydrating && <Spinner size={15} className="text-text-muted" />}
        </Panel>
        <Panel position="top-right">
          <CodeSwitcher codes={ALL_CODES} code={code} onChange={setCode} />
        </Panel>
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.25} color="#D4D4D4" bgColor="#FAFAFA" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}

export function BuilderCanvas(props: {
  payers: string[];
  initialDoc: CanvasDoc | null;
  onDocChange: (doc: CanvasDoc) => void;
}) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}
