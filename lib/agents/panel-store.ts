"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_AGENT_ID } from "@/lib/agents/registry";

// Module-level store for the agent dock. It lives OUTSIDE React's tree on
// purpose: the dock is mounted once by AppShell, and every affordance that
// opens it (an index page's toolbar, a detail page's header) lives in a
// different, remounting route subtree. A context provider would work too; a
// module store means a page can open the dock without threading a provider
// through, and — the reason 44b does the same for its Ask panel — the seeded
// context survives navigation instead of resetting on every route change.
//
// The transcript itself lives in the dock's own `useChat`, which stays mounted
// for the same reason, so drilling from an index into a record keeps the
// conversation. Nothing here is persisted; a full page load starts fresh.

/** What the page the user opened the dock from was showing. Seeds the agent's
 *  first turn so "summarize this" has a referent. */
export interface AgentContext {
  /** Short human label, rendered as a chip in the dock header. */
  label: string;
  /** Free-text grounding handed to the model with the first message. */
  detail?: string;
}

interface State {
  open: boolean;
  agentId: string;
  context: AgentContext | null;
}

let state: State = { open: false, agentId: DEFAULT_AGENT_ID, context: null };

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
}

export function openAgentPanel(opts?: { agentId?: string; context?: AgentContext | null }) {
  set({
    open: true,
    ...(opts?.agentId ? { agentId: opts.agentId } : {}),
    ...(opts?.context !== undefined ? { context: opts.context } : {}),
  });
}

export function closeAgentPanel() {
  set({ open: false });
}

export function toggleAgentPanel(opts?: { agentId?: string; context?: AgentContext | null }) {
  if (state.open) closeAgentPanel();
  else openAgentPanel(opts);
}

export function setAgentId(agentId: string) {
  set({ agentId });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const serverSnapshot: State = { open: false, agentId: DEFAULT_AGENT_ID, context: null };

export function useAgentPanel(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverSnapshot,
  );
}
