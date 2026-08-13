import { Badge } from "@/components/ui/badge";
import { ObjectPanel, ObjectField } from "@/components/ui/object-panel";
import { ProviderRailMenu } from "@/components/providers/provider-rail-menu";
import { formatPhone, formatZip, providerDisplayName, shortProfession, stateFromZip, titleCase } from "@/lib/format";
import type { ProviderNetworkSummary } from "@/lib/repos/networks";
import type { DirectoryProvider } from "@/lib/types";

// Directory provider — the drill-down record's object panel (shared ObjectPanel
// anatomy). The Accepting status rides in the body as a field; the NPI copy and
// any actions live in the top-right kebab (ProviderRailMenu), matching the org
// and employer panels.

// Directory network labels arrive SHOUTING. Title-case only ALL-CAPS words of
// 4+ letters — short acronyms (EBH, UHC, PPO) stay caps, and already
// mixed-case labels pass through untouched.
function networkLabel(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.replace(/[A-Z]{4,}/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
}

export function ProviderOverview({
  provider,
  network,
}: {
  provider: DirectoryProvider;
  network: ProviderNetworkSummary | null;
}) {
  // City, ZIP-derived state, ZIP+4 — the directory stores no practice state,
  // and the license state is wrong for out-of-state telehealth rows.
  const cityLine = [
    provider.city ? titleCase(provider.city) : null,
    [stateFromZip(provider.zip), formatZip(provider.zip)].filter(Boolean).join(" ") || null,
  ]
    .filter(Boolean)
    .join(", ");

  const name = providerDisplayName(provider.name, provider.entityType);
  // Real NPPES credential ("PNP") beats the profession abbreviation.
  const roleShort = provider.credential ?? (provider.profession ? shortProfession(provider.profession) : null);
  const sourceLabel =
    provider.source === "nppes" ? "National NPI registry (NPPES)" : "NY Medicaid enrolled provider listing";

  return (
    <ObjectPanel
      title={name}
      subtitle={roleShort}
      menu={provider.npi ? <ProviderRailMenu npi={provider.npi} /> : undefined}
      footer={sourceLabel}
    >
      {network && (
        <ObjectField label="New patients">
          <Badge variant={network.accepting ? "success" : "neutral"}>
            {network.accepting ? "Accepting" : "Not accepting"}
          </Badge>
        </ObjectField>
      )}

      {(provider.address || cityLine) && (
        <ObjectField label="Address">
          {provider.address && <span className="block">{titleCase(provider.address)}</span>}
          {cityLine && <span className="block">{cityLine}</span>}
        </ObjectField>
      )}
      {provider.phone && (
        <ObjectField label="Phone">
          <a href={`tel:${provider.phone}`} className="text-primary hover:underline">
            {formatPhone(provider.phone)}
          </a>
        </ObjectField>
      )}

      {provider.npi && (
        <ObjectField label="NPI">
          <span className="tabular-nums">{provider.npi}</span>
        </ObjectField>
      )}
      {provider.profession && <ObjectField label="Specialty">{titleCase(provider.profession)}</ObjectField>}
      {provider.subspecialty && <ObjectField label="Sub-specialty">{provider.subspecialty}</ObjectField>}
      {provider.gender && (
        <ObjectField label="Gender">
          {provider.gender === "F" ? "Female" : provider.gender === "M" ? "Male" : provider.gender}
        </ObjectField>
      )}
      {(provider.isSoleProprietor || provider.parentOrg) && (
        <ObjectField label="Practice">
          {provider.isSoleProprietor ? "Solo practice" : titleCase(provider.parentOrg ?? "")}
        </ObjectField>
      )}
      {provider.enumerationDate && <ObjectField label="In practice since">{provider.enumerationDate.slice(0, 4)}</ObjectField>}
      {provider.credential && <ObjectField label="License type">{provider.credential}</ObjectField>}
      {provider.licenseNo && (
        <ObjectField label="License">
          {provider.licenseNo}
          {provider.licenseState ? ` · ${provider.licenseState}` : ""}
        </ObjectField>
      )}

      {network && network.payers.length > 0 && (
        <ObjectField label="In-network">{network.payers.join(", ")}</ObjectField>
      )}
      {network && network.networks.length > 0 && (
        <ObjectField label="Network">
          <div className="flex flex-col gap-1">
            {network.networks.map((n) => (
              <span key={n} className="block">
                {networkLabel(n)}
              </span>
            ))}
          </div>
        </ObjectField>
      )}
    </ObjectPanel>
  );
}
