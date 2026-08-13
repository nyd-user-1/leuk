import { NextResponse, type NextRequest } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { listClients } from "@/lib/repos/clients";
import { searchProviders } from "@/lib/repos/directory";
import { normalizeOrgName, providerDisplayName } from "@/lib/format";
import { listOrgs } from "@/lib/repos/orgs";
import { searchEmployers } from "@/lib/repos/plans";

export const dynamic = "force-dynamic";

// Unified workspace search — the data behind the ⌘K command palette (TASK-SEARCH
// task 4a). One query fans out across the entity searches that already exist,
// each backed by a trigram index (sql/005/022/060), so the whole thing answers in
// one indexed round-trip per corpus, all in parallel. This route REUSES the
// domain repos rather than re-implementing search — the palette is a new surface
// over the same reads the index pages use.
//
// Names come out of NPPES as "PADGETT SHELLEY" / "HEADWAY MICHIGAN BEHAVIORAL
// HEALTH SERVICES, P.C." — normalize HERE rather than at each call site, so the
// palette, the composer's "@" menu and anything else built on this route all
// read the same way.
//
// PHI note: client name search is practitioner-gated (requireRole). We do NOT
// logEvent the keystrokes — that would flood the audit log with partial-name
// probes; the audit boundary is opening a record (/clients/[id] logs its own
// read), not searching for one.

export type SearchItem = { id: string; title: string; subtitle?: string; href: string };
export type SearchGroup = { type: string; label: string; icon: string; items: SearchItem[] };

const CAP = 6; // per group — the palette is a launcher, not a results page

export async function GET(req: NextRequest) {
  try {
    await requireRole("practitioner");
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    // 2 chars is the floor the directory uses (trigram needs 3, prefix covers 2);
    // below that a palette query is noise and would scan.
    if (q.length < 2) return NextResponse.json({ groups: [] as SearchGroup[] });

    const [clients, providers, orgs, employers] = await Promise.all([
      listClients({ q }).catch(() => []),
      searchProviders({ q, pageSize: CAP }).catch(() => ({ items: [] })),
      listOrgs({ q, limit: CAP }).then((r) => r.rows).catch(() => []),
      searchEmployers(q, CAP).catch(() => []),
    ]);

    const groups: SearchGroup[] = [];

    const cl: SearchItem[] = clients.slice(0, CAP).map((c) => ({
      id: c.id,
      title: `${c.firstName} ${c.lastName}`,
      subtitle: c.status,
      href: `/clients/${c.id}`,
    }));
    if (cl.length) groups.push({ type: "clients", label: "Clients", icon: "users", items: cl });

    const pr: SearchItem[] = providers.items
      .filter((p) => p.npi)
      .slice(0, CAP)
      .map((p) => ({
        id: p.npi!,
        title: providerDisplayName(p.name, p.entityType),
        subtitle: [p.profession, p.city].filter(Boolean).join(" · ") || undefined,
        href: `/directory/providers/${p.npi}`,
      }));
    if (pr.length) groups.push({ type: "providers", label: "Providers", icon: "globe", items: pr });

    const og: SearchItem[] = orgs.slice(0, CAP).map((o) => ({
      id: o.tin,
      title: normalizeOrgName(o.label),
      subtitle: `${o.npis.toLocaleString("en-US")} clinician${o.npis === 1 ? "" : "s"}`,
      href: `/orgs/${encodeURIComponent(o.tin)}`,
    }));
    if (og.length) groups.push({ type: "orgs", label: "Organizations", icon: "id-card", items: og });

    const em: SearchItem[] = employers.slice(0, CAP).map((e) => ({
      id: e.ein,
      title: e.name,
      subtitle: `${e.planCount} plan${e.planCount === 1 ? "" : "s"}`,
      href: `/plans/${e.ein}`,
    }));
    if (em.length) groups.push({ type: "plans", label: "Plans & employers", icon: "credit-card", items: em });

    return NextResponse.json({ groups });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
