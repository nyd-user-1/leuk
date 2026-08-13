"use client";

import { MenuItem } from "@/components/ui/dropdown-menu";
import { KebabMenu } from "@/components/ui/kebab-menu";

// Provider object-panel action menu — parity with OrgRailMenu. Copies the NPI
// (the copy affordance moved off the NPI field into the panel's kebab, like the
// org rail's Copy EIN).
export function ProviderRailMenu({ npi }: { npi: string }) {
  const copy = () => {
    try {
      navigator.clipboard?.writeText(npi);
    } catch {
      /* clipboard blocked — no-op */
    }
  };
  return (
    <KebabMenu label="Provider actions">
      <MenuItem icon="copy" label="Copy NPI" onClick={copy} />
    </KebabMenu>
  );
}
