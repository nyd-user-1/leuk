"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Trigger-menu engine for ChatInput: "@" resolves a record, "/" picks a
// command. One hook drives both because the mechanics are identical — read the
// token under the caret, offer matches, replace the token on select.
//
// Why "@" exists at all: an agent asked "could you provide the 10-digit NPI?"
// because "are we still in Cigna?" names no subject. Rather than teach the
// model to guess, the clinician names the record and the NPI travels in the
// message text — no protocol, no new parameter, and the tool call resolves on
// the first turn.

export interface MenuItem {
  /** Stable key. */
  id: string;
  /** Bold line in the menu. */
  label: string;
  /** Muted second line. */
  hint?: string;
  /** Group heading this belongs under. */
  group?: string;
  /** What replaces the token. Falls back to `label`. */
  insert?: string;
}

export type Trigger = "@" | "/";

/** A "/" command. Skills will slot in here as they land. */
export interface Command {
  name: string;
  /** Human label. Falls back to `name`. */
  title?: string;
  description?: string;
  group?: string;
  /** Text placed in the composer when picked. Defaults to "/name". */
  prompt?: string;
}

/** The token under the caret, if it opens a menu. Requires the trigger to sit
 *  at a word boundary so an email address or a path doesn't open one. */
export function readTrigger(value: string, caret: number): { trigger: Trigger; query: string; start: number } | null {
  const upto = value.slice(0, caret);
  const m = /(^|\s)([@/])([\p{L}\p{N} .'’_-]{0,40})$/u.exec(upto);
  if (!m) return null;
  // "/" only opens at the very start of the message — mid-sentence slashes are
  // dates and fractions, not commands. "@" may appear anywhere.
  const start = caret - (m[2].length + m[3].length);
  if (m[2] === "/" && start !== 0) return null;
  return { trigger: m[2] as Trigger, query: m[3], start };
}

/** Replace the trigger token with `insert`, leaving the caret after it. */
export function applyInsert(value: string, start: number, caret: number, insert: string) {
  const next = `${value.slice(0, start)}${insert} ${value.slice(caret)}`;
  return { next, caret: start + insert.length + 1 };
}

type SearchGroup = { type: string; label: string; items: Array<{ id: string; title: string; subtitle?: string }> };

/** Records for "@". Providers carry their NPI into the inserted text so the
 *  agent can call get_provider without another round trip. */
async function searchRecords(q: string, signal: AbortSignal): Promise<MenuItem[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) return [];
  const { groups } = (await res.json()) as { groups: SearchGroup[] };
  const out: MenuItem[] = [];
  for (const g of groups) {
    for (const it of g.items) {
      const insert =
        g.type === "providers"
          ? `@${it.title} (NPI ${it.id})`
          : g.type === "orgs"
            ? `@${it.title} (TIN ${it.id})`
            : `@${it.title}`;
      out.push({ id: `${g.type}:${it.id}`, label: it.title, hint: it.subtitle, group: g.label, insert });
    }
  }
  return out;
}

/** Skills for "/" — fetched once per agent and cached, since the catalogue is
 *  reference data that doesn't change between keystrokes. */
const skillCache = new Map<string, Command[]>();

async function loadSkills(agentId: string): Promise<Command[]> {
  const hit = skillCache.get(agentId);
  if (hit) return hit;
  // Fetch the WHOLE catalogue, not just this agent's. Scoping the menu to the
  // open agent meant Bev's thread offered four of twenty-seven, which reads as
  // a bug rather than a boundary. This agent's skills sort first; the rest stay
  // reachable, prefixed with whose they are.
  const res = await fetch("/api/agent-skills");
  if (!res.ok) return [];
  const { skills } = (await res.json()) as {
    skills: Array<{ slug: string; agentId: string; group: string; title: string; description: string; prompt: string }>;
  };
  const own = skills.filter((s) => s.agentId === agentId);
  const rest = skills.filter((s) => s.agentId !== agentId);
  const out = [...own, ...rest].map((s) => ({
    name: s.slug,
    title: s.title,
    description: s.description,
    group: s.agentId === agentId ? s.group : `${s.group} · ${s.agentId}`,
    prompt: s.prompt,
  }));
  skillCache.set(agentId, out);
  return out;
}

export function useComposerMenu({
  value,
  caret,
  mentions,
  commands,
  agentId,
}: {
  value: string;
  caret: number;
  mentions?: boolean;
  commands?: Command[];
  /** When set, "/" is backed by that agent's skills from the database. */
  agentId?: string;
}) {
  const [skills, setSkills] = useState<Command[] | null>(null);
  useEffect(() => {
    if (!agentId) return;
    let live = true;
    void loadSkills(agentId).then((r) => { if (live) setSkills(r); });
    return () => { live = false; };
  }, [agentId]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const hit = readTrigger(value, caret);
  const slashList = skills ?? commands ?? [];
  const enabled = !!hit && ((hit.trigger === "@" && !!mentions) || (hit.trigger === "/" && slashList.length > 0));
  const query = hit?.query ?? "";
  const trigger = hit?.trigger;

  // `commands` is rebuilt by the caller on every render, so it must NEVER be a
  // dependency — that made the effect re-run forever (setActive → render → new
  // array → effect), which froze the whole app since the dock lives in
  // AppShell. Depend on a string key of the names; read the array off a ref.
  const commandsRef = useRef(slashList);
  commandsRef.current = slashList;
  const commandKey = slashList.map((c) => c.name).join("\u0000");

  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    setActive(0);
    if (!enabled) {
      // Functional form so an already-empty list doesn't schedule a render.
      setItems((prev) => (prev.length ? [] : prev));
      return;
    }
    if (trigger === "/") {
      const q = query.toLowerCase().trim();
      setItems(
        (commandsRef.current ?? [])
          .filter((c) =>
            !q ||
            c.name.toLowerCase().includes(q) ||
            (c.description ?? "").toLowerCase().includes(q) ||
            (c.group ?? "").toLowerCase().includes(q),
          )
          .slice(0, 60)
          .map((c) => ({
            id: c.name,
            label: c.title ?? c.name,
            hint: c.description,
            group: c.group,
            insert: c.prompt ?? `/${c.name}`,
          })),
      );
      return;
    }
    // "@" — two characters is the floor /api/search enforces anyway.
    if (query.trim().length < 2) {
      setItems((prev) => (prev.length ? [] : prev));
      return;
    }
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setLoading(true);
    const t = setTimeout(() => {
      searchRecords(query.trim(), ac.signal)
        .then((r) => {
          if (!ac.signal.aborted) setItems(r.slice(0, 10));
        })
        .catch(() => {
          /* aborted or offline — the menu just stays empty */
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    }, 160);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [enabled, trigger, query, commandKey]);

  const open = enabled && (items.length > 0 || loading);

  const move = useCallback(
    (delta: number) => setActive((a) => (items.length ? (a + delta + items.length) % items.length : 0)),
    [items.length],
  );

  return { open, items, active, setActive, move, loading, hit };
}
