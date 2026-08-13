"use client";

import { ProviderOverview } from "@/components/providers/provider-overview";
import { ProviderRates } from "@/components/providers/provider-rates";
import type { ProviderNetworkSummary } from "@/lib/repos/networks";
import type { DirectoryProvider } from "@/lib/types";

// One provider's workspace — the drill-down record standard (DrillDownScaffold):
// a full-width tab rail over the object panel (identity card) + the rates/
// networks table, matching heights. Rendered inside a Directory provider tab
// (directory-client) and by the standalone deep-link page
// (/directory/providers/[npi]). ProviderRates holds the active-tab state, so
// the object panel rides in as a prop.

export function ProviderView({
  provider,
  network,
}: {
  provider: DirectoryProvider;
  network: ProviderNetworkSummary | null;
  /** Accepted for caller compatibility; the jump-search that used it is gone. */
  onJump?: (p: DirectoryProvider) => void;
}) {
  return <ProviderRates npi={provider.npi} object={<ProviderOverview provider={provider} network={network} />} />;
}
