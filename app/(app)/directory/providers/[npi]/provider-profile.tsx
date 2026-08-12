"use client";

import { useEffect, useState } from "react";
import { TopBarActions } from "@/components/shell/topbar-slot";
import { AgentButton } from "@/components/agents/agent-button";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ReferModal } from "@/components/providers/refer-modal";
import { providerDisplayName } from "@/lib/format";
import type { ProviderNetworkSummary } from "@/lib/repos/networks";
import type { DirectoryProvider } from "@/lib/types";
import { ProviderView } from "../../provider-view";

// Standalone deep-link page for one provider (/directory/providers/[npi]).
// The Directory itself opens providers as closable in-page tabs
// (directory-client.tsx); this page serves direct links. Identity lives in
// the Overview rail's fixed header — no breadcrumb, no page-level entity
// header.

export function ProviderProfile({
  provider,
  network,
  clients,
  openRefer,
}: {
  provider: DirectoryProvider;
  network: ProviderNetworkSummary | null;
  clients: Array<{ id: string; name: string }>;
  openRefer?: boolean;
}) {
  const toast = useToast();
  // Starts closed on both the server and the client's first render (Modal
  // renders null under typeof document === "undefined") — opening from
  // ?refer=1 happens in an effect, after hydration, to avoid a mismatch.
  const [referOpen, setReferOpen] = useState(false);
  useEffect(() => {
    if (openRefer) setReferOpen(true);
  }, [openRefer]);

  const name = providerDisplayName(provider.name, provider.entityType);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBarActions>
        <AgentButton context={{ label: name, detail: `Provider NPI ${provider.npi}` }} agentId="directory" />
        <Button size="sm" leftIcon="send" onClick={() => setReferOpen(true)}>
          Refer a client
        </Button>
      </TopBarActions>

      <div className="min-h-0 flex-1">
        <ProviderView provider={provider} network={network} />
      </div>

      <ReferModal
        open={referOpen}
        onClose={() => setReferOpen(false)}
        clients={clients}
        target={provider}
        isProvider
        onSuccess={() => {
          setReferOpen(false);
          toast(
            <>
              Referral sent for <b>{name}</b>.
            </>,
            "success",
          );
        }}
      />
    </div>
  );
}
