"use client";

import { Button } from "@/components/ui/button";
import { openAgentPanel, toggleAgentPanel, useAgentPanel, type AgentContext } from "@/lib/agents/panel-store";

// The affordance that opens the agent dock. Drop it wherever the page's own
// actions live — `TopBarActions` on a detail page, the tab rail on an index —
// and hand it the context the page is showing so the agent's first turn is
// grounded on what the user is looking at.
//
//   <TopBarActions><AgentButton context={{ label: org.name, detail: `TIN ${tin}` }} /></TopBarActions>
//
// Re-clicking closes the dock; switching pages with it open re-seeds the
// context but keeps the transcript (the dock is mounted by AppShell, not here).

export function AgentButton({
  context,
  agentId,
  label = "Ask",
  size = "sm",
}: {
  context?: AgentContext;
  /** Force a specific agent; otherwise the dock keeps whichever was last used. */
  agentId?: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const { open } = useAgentPanel();
  return (
    <Button
      // Always secondary: this sits beside the rail's teal "+ New", and two
      // solid teal buttons in one row read as two primary actions. The open
      // panel is its own state indicator.
      size={size}
      variant="secondary"
      leftIcon="sparkle"
      onClick={() => {
        // Open-with-new-context rather than toggle when the dock is already
        // showing a different page's context — clicking Ask on a record you
        // just navigated to should re-aim it, not close it.
        if (open && context) openAgentPanel({ agentId, context });
        else toggleAgentPanel({ agentId, context: context ?? null });
      }}
    >
      {label}
    </Button>
  );
}
