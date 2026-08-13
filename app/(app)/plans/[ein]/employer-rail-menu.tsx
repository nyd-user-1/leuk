"use client";

import { MenuItem } from "@/components/ui/dropdown-menu";
import { KebabMenu } from "@/components/ui/kebab-menu";

// Employer object-panel action menu — parity with OrgRailMenu. Copies the EIN
// (raw digits; the panel shows it formatted).
export function EmployerRailMenu({ ein }: { ein: string }) {
  const copy = () => {
    try {
      navigator.clipboard?.writeText(ein);
    } catch {
      /* clipboard blocked — no-op */
    }
  };
  return (
    <KebabMenu label="Employer actions">
      <MenuItem icon="copy" label="Copy EIN" onClick={copy} />
    </KebabMenu>
  );
}
