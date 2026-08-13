"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnPicker } from "@/components/ui/column-picker";
import { Icon } from "@/components/ui/icons";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { MenuItem } from "@/components/ui/dropdown-menu";
import { SortableHead, Table, Td, Tr, useSort } from "@/components/ui/table";
import { TabReveal } from "@/components/ui/tab-reveal";
import { DrillDownScaffold } from "@/components/shell/drill-down-scaffold";
import { SearchInput } from "@/components/ui/search-input";
import { Tooltip } from "@/components/ui/tooltip";
import { cptLabel } from "@/components/rates/cpt";
import { InsurerMark } from "@/components/rates/insurer-mark";
import { TableSkeleton } from "@/components/rates/table-skeleton";
import { prettyNetworkLabel } from "@/lib/format";
import type { NetworkMembershipRow, ProviderRateRow } from "@/lib/repos/rate-directory";

// The provider Overview pane's right side. Default view = NETWORKS: one row
// per insurer × network, both federal sources outer-joined (directory rows
// carry Accepting/Updated, price-file rows carry best per-session rates per
// scanned code; rows merge only on exact payer+network match — see
// listNetworkMemberships). "All rates" keeps the per-CPT table one click
// away. "Updated" = the payer's own last-published/effective date — it is
// NOT a row-creation date.

// Scanned CPT codes → short column labels. 90834 is FORTY-FIVE minutes —
// there is no 30-minute code (90832) in the scan set yet.
const RATE_COLS = [
  { key: "b90791", label: "Eval", tip: "90791 · Psychiatric diagnostic evaluation" },
  { key: "b90834", label: "45 Min", tip: "90834 · 45-minute psychotherapy" },
  { key: "b90837", label: "60 Min", tip: "90837 · 60-minute psychotherapy" },
  { key: "b90853", label: "Group", tip: "90853 · Group psychotherapy" },
  { key: "b99214", label: "Mgmt", tip: "99214 · Med management, established patient" },
] as const;
type RateColKey = (typeof RATE_COLS)[number]["key"];

const NETWORK_COLUMNS = [
  { key: "network", label: "Network" },
  { key: "accepting", label: "Accepting" },
  { key: "updated", label: "Updated" },
  ...RATE_COLS.map((c) => ({ key: c.key, label: c.label })),
];

type MemberCol = "insurer" | "network" | "accepting" | "updated" | RateColKey;

const RATE_FIELD: Record<RateColKey, keyof NetworkMembershipRow> = {
  b90791: "best90791",
  b90834: "best90834",
  b90837: "best90837",
  b90853: "best90853",
  b99214: "best99214",
};

export function ProviderRates({ npi, object }: { npi: string | null; object: ReactNode }) {
  const router = useRouter();
  // Standard anatomy: select column (nothing consumes the selection yet).
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggleSel = (k: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (!next.delete(k)) next.add(k);
      return next;
    });
  const publishedRatesHref = (payer: string) =>
    `/published-rates?payer=${encodeURIComponent(payer)}${npi ? `&q=${npi}` : ""}`;
  const stdFooter = (n: number) => (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px] text-text-muted">
      <span className="min-w-0 truncate tabular-nums">{n.toLocaleString("en-US")} records</span>
      <span className="shrink-0">Data set by NYSgpt</span>
    </div>
  );
  const [rates, setRates] = useState<ProviderRateRow[] | null>(null);
  const [memberships, setMemberships] = useState<NetworkMembershipRow[] | null>(null);
  const [view, setView] = useState<"networks" | "rates">("rates");
  const [sort, toggleSort] = useSort<MemberCol>({ col: "insurer", dir: "asc" });

  // Column state is an ORDERED array, not a set: hiding removes; re-adding
  // APPENDS, so a user can reorder columns without drag-and-drop (hide it,
  // add it back → it's now last). Storage format (string[]) is unchanged.
  const [colOrder, setColOrder] = useState<string[]>(NETWORK_COLUMNS.map((c) => c.key));
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("provider.rates.columns") ?? "null");
      if (Array.isArray(saved)) setColOrder(saved.filter((k) => NETWORK_COLUMNS.some((c) => c.key === k)));
    } catch {
      /* corrupt storage — keep defaults */
    }
  }, []);
  function toggleCol(key: string) {
    setColOrder((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem("provider.rates.columns", JSON.stringify(next));
      return next;
    });
  }
  const visibleCols = useMemo(() => new Set(colOrder), [colOrder]);

  useEffect(() => {
    if (!npi) {
      setRates([]);
      setMemberships([]);
      return;
    }
    let stale = false;
    fetch(`/api/directory/provider-rates?npi=${npi}`)
      .then((res) => res.json())
      .then((data) => {
        if (stale) return;
        setRates(data.rates ?? []);
        setMemberships(data.memberships ?? []);
      })
      .catch(() => {
        if (stale) return;
        setRates([]);
        setMemberships([]);
      });
    return () => {
      stale = true;
    };
  }, [npi]);

  // In-chrome search (the table standard): one box filters whichever view is
  // active — payer/network/code text over rows that are all loaded client-side.
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const sortedMembers = useMemo(() => {
    if (!memberships) return [];
    const dir = sort.dir === "asc" ? 1 : -1;
    const money = (v: string | null) => (v == null ? -Infinity : Number(v.slice(1)));
    const accRank = (m: NetworkMembershipRow) =>
      m.accepting === "accepting" ? 2 : m.accepting === "not_accepting" ? 1 : 0;
    return [...memberships]
      .filter((m) => !needle || `${m.payer} ${m.network}`.toLowerCase().includes(needle))
      .sort((a, b) => {
      let cmp = 0;
      if (sort.col === "network") cmp = a.network.localeCompare(b.network);
      else if (sort.col === "accepting") cmp = accRank(a) - accRank(b);
      else if (sort.col === "updated") cmp = (a.asOf ?? "").localeCompare(b.asOf ?? "");
      else if (sort.col in RATE_FIELD)
        cmp = money(a[RATE_FIELD[sort.col as RateColKey]] as string | null) - money(b[RATE_FIELD[sort.col as RateColKey]] as string | null);
      else cmp = a.payer.localeCompare(b.payer);
      return cmp * dir || a.payer.localeCompare(b.payer) || a.network.localeCompare(b.network);
    });
  }, [memberships, sort, needle]);

  const shownRates = useMemo(
    () =>
      (rates ?? []).filter(
        (r) => !needle || `${r.payer} ${r.network} ${r.billingCode}`.toLowerCase().includes(needle),
      ),
    [rates, needle],
  );

  const loading = rates === null || memberships === null;
  const empty = !loading && memberships.length === 0;

  // The in-chrome toolbar both views share: search left, utilities right
  // (the Networks view's column picker rides here).
  const tableToolbar = (
    <>
      <SearchInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by insurer, network or code"
        className="w-full sm:w-[320px]"
      />
      <span className="ml-auto">
        {view === "networks" && <ColumnPicker options={NETWORK_COLUMNS} visible={visibleCols} onToggle={toggleCol} />}
      </span>
    </>
  );

  // The scaffold always renders — the object panel and tab rail stay put while
  // the table below cycles through loading / empty / data.
  return (
    <DrillDownScaffold
      object={object}
      active={view}
      onChange={(k) => setView(k as "networks" | "rates")}
      tabs={[
        { key: "rates", label: "All rates" },
        { key: "networks", label: "Networks" },
      ]}
    >
      {loading ? (
        <TableSkeleton head={["Insurer", "Network", "Accepting", "Updated", ...RATE_COLS.map((c) => c.label)]} />
      ) : empty ? (
        <Banner variant="info">
          No network listings or published rate rows for this provider — which is{" "}
          <span className="font-semibold">not</span> the same as not being in-network. Some payers block
          rate-file pulls, and clinicians with out-of-state practice addresses are missing from NY files.
        </Banner>
      ) : (
        <TabReveal id={view} className="flex min-h-0 flex-1 flex-col">
      {view === "networks" ? (
        <Table
          className="min-h-0 flex-1"
          stickyHeader
          toolbar={tableToolbar}
          footer={stdFooter(sortedMembers.length)}
          head={[
            <span key="__sel" aria-hidden />,
            <SortableHead key="insurer" label="Insurer" col="insurer" sort={sort} onSort={toggleSort} />,
            // Headers render in colOrder — hide + re-add moves a column last.
            ...colOrder.map((k) => {
              if (k === "network") return <SortableHead key="network" label="Network" col="network" sort={sort} onSort={toggleSort} />;
              if (k === "accepting") return <SortableHead key="accepting" label="Accepting" col="accepting" sort={sort} onSort={toggleSort} />;
              if (k === "updated") return <SortableHead key="updated" label="Updated" col="updated" sort={sort} onSort={toggleSort} />;
              const rc = RATE_COLS.find((c) => c.key === k);
              return rc ? (
                <Tooltip key={rc.key} label={rc.tip}>
                  <SortableHead label={rc.label} col={rc.key} sort={sort} onSort={toggleSort} />
                </Tooltip>
              ) : null;
            }),
            "",
          ]}
        >
          {sortedMembers.map((m, i) => (
            <Tr key={`${m.payer}|${m.network}|${i}`}>
              <Td className="w-10" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  aria-label="Select row"
                  checked={sel.has(`n|${m.payer}|${m.network}|${i}`)}
                  onChange={() => toggleSel(`n|${m.payer}|${m.network}|${i}`)}
                />
              </Td>
              <Td className="whitespace-nowrap">
                <span className="flex items-center gap-2.5">
                  <InsurerMark payer={m.payer} />
                  {/* max-w-40 on both name columns keeps all 9 columns inside
                      the container — the page must never scroll horizontally;
                      full values live in the hover title. */}
                  <span className="max-w-40 truncate font-medium text-text" title={m.payer}>
                    {m.payer}
                  </span>
                </span>
              </Td>
              {colOrder.map((k) => {
                if (k === "network")
                  return (
                    <Td key={k}>
                      <span className="block max-w-40 truncate" title={m.network || undefined}>
                        {m.network ? prettyNetworkLabel(m.network) : <span className="text-text-muted">Listed (no network detail)</span>}
                      </span>
                    </Td>
                  );
                if (k === "accepting")
                  return (
                    <Td key={k} className="whitespace-nowrap">
                      {m.accepting === "accepting" ? (
                        <Badge variant="success">Accepting</Badge>
                      ) : m.accepting === "not_accepting" ? (
                        <Badge variant="neutral">Not accepting</Badge>
                      ) : (
                        "—"
                      )}
                    </Td>
                  );
                if (k === "updated")
                  return (
                    <Td key={k} className="whitespace-nowrap text-text-muted">
                      {m.asOf ?? "—"}
                    </Td>
                  );
                const rc = RATE_COLS.find((c) => c.key === k);
                return rc ? (
                  <Td
                    key={k}
                    className={`whitespace-nowrap tabular-nums ${rc.key === "b90837" ? "font-medium text-text" : "text-text-body"}`}
                  >
                    {(m[RATE_FIELD[rc.key]] as string | null) ?? "—"}
                  </Td>
                ) : null;
              })}
              <Td className="w-12" onClick={(e) => e.stopPropagation()}>
                <KebabMenu label={`Actions for ${m.payer}`}>
                  <MenuItem
                    icon="dollar"
                    label="Open insurer in Published rates"
                    onClick={() => router.push(publishedRatesHref(m.payer))}
                  />
                </KebabMenu>
              </Td>
            </Tr>
          ))}
        </Table>
      ) : (
        <Table
          className="min-h-0 flex-1"
          stickyHeader
          toolbar={tableToolbar}
          footer={stdFooter(shownRates.length)}
          head={[
            <span key="__sel" aria-hidden />,
            "Insurer",
            "Network",
            "Code",
            <Tooltip key="rate" label="In-Network rate as published by the payer.">
              <span className="inline-flex cursor-help items-center gap-1">
                In Ntwk <Icon name="info" size={13} className="text-text-muted" />
              </span>
            </Tooltip>,
            "Schedule",
            "Updated",
            "",
          ]}
        >
          {shownRates.map((r, i) => (
            <Tr key={`${r.payer}|${r.network}|${r.billingCode}|${r.figure}|${i}`}>
              <Td className="w-10" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  aria-label="Select row"
                  checked={sel.has(`r|${r.payer}|${r.network}|${r.billingCode}|${i}`)}
                  onChange={() => toggleSel(`r|${r.payer}|${r.network}|${r.billingCode}|${i}`)}
                />
              </Td>
              <Td className="whitespace-nowrap">
                <span className="flex items-center gap-2.5">
                  <InsurerMark payer={r.payer} />
                  <span className="max-w-48 truncate font-medium text-text" title={r.payer}>
                    {r.payer}
                  </span>
                </span>
              </Td>
              <Td>
                <span className="block max-w-56 truncate" title={r.network}>
                  {prettyNetworkLabel(r.network)}
                </span>
              </Td>
              <Td className="whitespace-nowrap" title={cptLabel(r.billingCode)}>
                {r.billingCode}
              </Td>
              <Td className="whitespace-nowrap font-medium text-text">{r.figure}</Td>
              <Td className="whitespace-nowrap">
                <Badge variant={r.basis === "Negotiated" ? "info" : "neutral"} className="!font-normal">
                  {r.basis}
                </Badge>
              </Td>
              <Td className="whitespace-nowrap text-text-muted">{r.asOf ?? "—"}</Td>
              <Td className="w-12" onClick={(e) => e.stopPropagation()}>
                <KebabMenu label={`Actions for ${r.payer}`}>
                  <MenuItem
                    icon="dollar"
                    label="Open insurer in Published rates"
                    onClick={() => router.push(publishedRatesHref(r.payer))}
                  />
                </KebabMenu>
              </Td>
            </Tr>
          ))}
        </Table>
      )}
        </TabReveal>
      )}
    </DrillDownScaffold>
  );
}
