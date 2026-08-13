import type { Employer, EmployerRegistry } from "@/lib/repos/plans";
import { Badge } from "@/components/ui/badge";
import { ObjectPanel, ObjectField } from "@/components/ui/object-panel";
import { EmployerRailMenu } from "./employer-rail-menu";

// Employer object panel — the shared ObjectPanel anatomy. The funding status
// (Self-funded / Insured) rides in the body as a field; actions live in the
// top-right kebab. The DOL/EFAST2 "Federal registry" block is a composed
// section beneath the flat fields.

export function EmployerRail({ employer, registry }: { employer: Employer; registry: EmployerRegistry | null }) {
  const name = titleCase(employer.name);

  return (
    <ObjectPanel title={name} menu={<EmployerRailMenu ein={employer.ein} />}>
      <ObjectField label="EIN">{formatEin(employer.ein)}</ObjectField>
      <ObjectField label="Funding">
        {employer.selfFunded ? (
          <Badge variant="info">Self-funded</Badge>
        ) : (
          <Badge variant="neutral">Insured</Badge>
        )}
      </ObjectField>
      <ObjectField label="Market type">{employer.marketType ? cap(employer.marketType) : "—"}</ObjectField>
      <ObjectField label="Plans">{employer.planCount.toLocaleString()}</ObjectField>
      <ObjectField label="State">{employer.state ?? "—"}</ObjectField>

      {registry && (
        // The DOL/EFAST2 record behind the ToC-derived employer — the named
        // carriers it actually files with, and (via stop-loss) the federal
        // confirmation of self-funding the ToC only implied. Public data, no PHI.
        <section className="border-t border-border pt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-semibold text-text">Federal registry</h2>
            <Badge variant="neutral">Form 5500 · {registry.planYear}</Badge>
          </div>
          <div className="flex flex-col gap-4">
            {registry.selfFundedTell && <Badge variant="info">Stop-loss on file — self-funded</Badge>}
            {registry.participants != null && (
              <ObjectField label="Participants">{registry.participants.toLocaleString()}</ObjectField>
            )}
            <ObjectField label={registry.carrierCount === 1 ? "Named carrier" : `Named carriers (${registry.carrierCount})`}>
              <ul className="space-y-2">
                {registry.carriers.map((c) => (
                  <li key={c.name} className="flex flex-col">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="min-w-0 break-words">{c.name}</span>
                      {c.health && <Badge variant="success">Health</Badge>}
                      {c.stopLoss && <Badge variant="warning">Stop-loss</Badge>}
                    </span>
                    {c.coveredLives != null && (
                      <span className="text-sm text-text-muted">{c.coveredLives.toLocaleString()} covered lives</span>
                    )}
                  </li>
                ))}
                {registry.carrierCount > registry.carriers.length && (
                  <li className="text-sm text-text-muted">
                    +{(registry.carrierCount - registry.carriers.length).toLocaleString()} more
                  </li>
                )}
              </ul>
            </ObjectField>
          </div>
        </section>
      )}
    </ObjectPanel>
  );
}

function formatEin(ein: string): string {
  const m = ein.match(/^(\d{2})(\d{7})$/);
  return m ? `${m[1]}-${m[2]}` : ein;
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function titleCase(s: string): string {
  return s
    .replace(/\b([A-Z])([A-Z']+)\b/g, (_, a, b) => a + b.toLowerCase())
    .replace(/\bLlc\b/i, "LLC")
    .replace(/\bInc\b/i, "Inc")
    .replace(/\bPc\b/i, "PC")
    .replace(/\bUsa\b/i, "USA")
    .replace(/\bNy\b/i, "NY")
    .replace(/\bMta\b/i, "MTA");
}
