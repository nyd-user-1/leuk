import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getOrgFhirNames, getOrgHeader, getOrgRates, getOrgRoster } from "@/lib/repos/orgs";
import { OrgRail } from "./org-rail";
import { OrgPanels } from "./org-panels";

// One organization's workspace — a full-width drill-down tab rail (index-page
// anatomy) resting above a w-80 identity rail + a content column whose active
// tab swaps a single scroll-owning table/map. Rail and table hang below the tab
// row, so they share a height; the table owns the scroll and the page never
// moves. OrgPanels owns the whole split (rail passed in) because the tab state
// must sit above both columns.

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({ params }: { params: Promise<{ tin: string }> }) {
  await requireRole("practitioner");
  const { tin: raw } = await params;
  const tin = decodeURIComponent(raw);

  const [header, rates, fhirNames, roster] = await Promise.all([
    getOrgHeader(tin),
    getOrgRates(tin),
    getOrgFhirNames(tin),
    getOrgRoster(tin, { limit: 50 }),
  ]);
  if (!header) notFound();

  // OrgPanels is the whole record (DrillDownScaffold): it holds the active-tab
  // state, so the identity rail rides in as the `rail` prop and the scaffold
  // owns the full-height flex-col root.
  return (
    <OrgPanels
      tin={tin}
      rates={rates}
      rosterInitial={roster.rows}
      rosterTotal={roster.total}
      rail={<OrgRail header={header} fhirNames={fhirNames} />}
    />
  );
}
