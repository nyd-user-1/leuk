"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ColumnPicker } from "@/components/ui/column-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icons";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { MenuItem } from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/search-input";
import { SidePanel } from "@/components/ui/side-panel";
import { Spinner } from "@/components/ui/spinner";
import { LoadMoreRow, SortableHead, Table, Td, Tr, useSentinel, useSort } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { TextLink } from "@/components/ui/text-link";
import { Toolbar } from "@/components/ui/toolbar";
import { useToast } from "@/components/ui/toast";
import { IndexHeader } from "@/components/ui/index-header";
import { AgentButton } from "@/components/agents/agent-button";
import { ReferModal } from "@/components/providers/refer-modal";
import { formatDate, formatPhone, providerDisplayName, shortProfession, stateFromZip } from "@/lib/format";
import type { ProviderNetworkSummary } from "@/lib/repos/networks";
import type { DirectoryProgram, DirectoryProvider } from "@/lib/types";
import { ProviderView } from "./provider-view";


export type ClientOption = { id: string; name: string };
type Facets = { cities?: string[]; counties: string[]; professions?: string[]; subspecialties?: string[]; types?: string[] };

// Prescribing is an attribute of a specialty, not a category of its own — these
// specialties can prescribe medication (shown as an "Rx" marker in the dropdown).
const PRESCRIBER_SPECIALTIES = new Set(["Psychiatrist", "Psychiatric Nurse Practitioner"]);

// Optional provider columns (the Columns picker). Provider name, checkbox and
// the kebab always render.
const PROVIDER_COLUMNS = [
  { key: "npi", label: "NPI" },
  { key: "specialty", label: "Specialty" },
  { key: "subspecialty", label: "Sub-specialty" },
  { key: "type", label: "Type" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
  { key: "phone", label: "Phone" },
  { key: "license", label: "License" },
  { key: "accepting", label: "Accepting" },
  { key: "network", label: "Network" },
  { key: "payers", label: "Payers" },
  { key: "rate", label: "Rate" },
  { key: "source", label: "Source" },
];
const DEFAULT_HIDDEN_COLUMNS = new Set(["subspecialty"]);


// FilterChip + attached popover — same pattern as the Clients index toolbar.
export function ChipMenu({
  label,
  value,
  options,
  onSelect,
  onClear,
  annotate,
}: {
  label: string;
  value?: string;
  options: string[];
  onSelect: (v: string) => void;
  onClear: () => void;
  annotate?: (option: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);
  // Every non-trivial list is a searchable dropdown — reuses the SearchInput primitive.
  const searchable = options.length > 6;
  const shown = searchable && term ? options.filter((o) => o.toLowerCase().includes(term.toLowerCase())) : options;
  return (
    <span ref={ref} className="relative">
      <FilterChip label={label} value={value} onClick={() => setOpen((o) => !o)} onClear={onClear} />
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-64 rounded-card border border-border bg-surface p-2 shadow-menu">
          {searchable && (
            <SearchInput
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={`Filter ${label.toLowerCase()}…`}
              className="mb-1.5 w-full"
            />
          )}
          <div className="max-h-64 overflow-y-auto">
            {shown.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  onSelect(o);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-[15px] transition-colors hover:bg-[#F3F4F6] ${
                  o === value ? "font-semibold text-primary" : "text-text"
                }`}
              >
                <span className="flex-1">{titleCase(o)}</span>
                {annotate?.(o)}
              </button>
            ))}
          </div>
        </div>
      )}
    </span>
  );
}

export function DirectoryClient({
  providerFacets,
  clients,
}: {
  providerFacets: Facets;
  clients: ClientOption[];
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [need, setNeed] = useState<string | undefined>(); // profession | program type
  const [subspecialty, setSubspecialty] = useState<string | undefined>();

  // Server-paginated, lazy-appended: `items` accumulates across pages as the
  // sentinel scrolls into view (see the load effect + sentinel below) — no
  // client slicing, no <Pagination>.
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Array<DirectoryProvider | DirectoryProgram>>([]);
  const [networks, setNetworks] = useState<Record<string, ProviderNetworkSummary>>({});
  const [rateMap, setRateMap] = useState<Record<string, { best90837: number | null; payerCount: number }>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selected, setSelected] = useState<DirectoryProvider | DirectoryProgram | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Browser-tab model: each opened provider is a closable tab after
  // Providers/Programs; `view` is "list" or the open provider's row id. The
  // network summary is captured at open time — `networks` is replaced on
  // every list reload, so the map may no longer hold this NPI later.
  const [openTabs, setOpenTabs] = useState<Array<{ provider: DirectoryProvider; network: ProviderNetworkSummary | null }>>([]);
  const [view, setView] = useState<string>("list");
  // Cursor position of a header right-click; null = column menu closed.
  const [colMenu, setColMenu] = useState<{ x: number; y: number } | null>(null);

  // Pin/favorite (row kebab) — device-local, hydrated after mount so the
  // server render never touches localStorage. Pins store the WHOLE row, not
  // just the id: the directory is server-paginated, so a pinned provider is
  // usually not in the loaded pages and must be prepended from storage.
  const [pinnedRows, setPinnedRows] = useState<DirectoryProvider[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const rows = JSON.parse(localStorage.getItem("directory.pinned") ?? "[]");
      setPinnedRows(Array.isArray(rows) ? rows.filter((r) => r && typeof r === "object" && r.id) : []);
      setFavorites(new Set(JSON.parse(localStorage.getItem("directory.favorites") ?? "[]")));
    } catch {
      /* corrupt storage — start clean */
    }
  }, []);
  const pinnedIds = useMemo(() => new Set(pinnedRows.map((r) => r.id)), [pinnedRows]);

  // Column visibility (Columns picker) — device-local, same hydration rule.
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    new Set(PROVIDER_COLUMNS.map((c) => c.key).filter((k) => !DEFAULT_HIDDEN_COLUMNS.has(k))),
  );
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("directory.columns") ?? "null");
      if (Array.isArray(saved)) setVisibleCols(new Set(saved));
    } catch {
      /* corrupt storage — keep defaults */
    }
  }, []);
  function toggleCol(key: string) {
    setVisibleCols((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem("directory.columns", JSON.stringify([...next]));
      return next;
    });
  }
  const vis = (k: string) => visibleCols.has(k);
  const providerColSpan = 3 + PROVIDER_COLUMNS.filter((c) => vis(c.key)).length;
  function togglePin(r: DirectoryProvider) {
    setPinnedRows((rows) => {
      const next = rows.some((p) => p.id === r.id) ? rows.filter((p) => p.id !== r.id) : [...rows, r];
      localStorage.setItem("directory.pinned", JSON.stringify(next));
      return next;
    });
  }
  function toggleFavorite(id: string) {
    setFavorites((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("directory.favorites", JSON.stringify([...next]));
      return next;
    });
  }
  const [providerSort, toggleProviderSort] = useSort<"name" | "specialty" | "city" | "accepting" | "network">({ col: "name", dir: "asc" });

  const allLoadedChecked = items.length > 0 && items.every((r) => checked.has(r.id));
  function toggleChecked(id: string) {
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllLoaded() {
    setChecked((s) => {
      const next = new Set(s);
      if (allLoadedChecked) items.forEach((r) => next.delete(r.id));
      else items.forEach((r) => next.add(r.id));
      return next;
    });
  }

  const facets = providerFacets;
  const needOptions = facets.professions ?? [];

  // Only accepting/network sort server-side; other columns reorder loaded
  // rows without a refetch, so the load callback must not depend on them.
  const serverSort =
    providerSort.col === "accepting" || providerSort.col === "network"
      ? `${providerSort.col}:${providerSort.dir}`
      : "";

  // Responses must apply newest-request-wins: a short query ("k") scans far
  // more rows than the longer one typed after it ("kise"), so it can resolve
  // LAST and clobber the right results. Every load takes a ticket; a response
  // whose ticket is no longer current is discarded.
  const loadSeq = useRef(0);

  const load = useCallback(
    async (pageToLoad: number, replace: boolean) => {
      const seq = ++loadSeq.current;
      if (replace) setLoading(true);
      else setLoadingMore(true);
      const params = new URLSearchParams();
      // The one search box handles text and ZIP: a purely-numeric term is a ZIP.
      const term = q.trim();
      if (term) params.set(/^\d{3,5}$/.test(term) ? "zip" : "q", term);
      if (subspecialty) params.set("subspecialty", subspecialty);
      if (need) params.set("profession", need);
      // Accepting/network sorts are global (server-side over the
      // participation aggregate); other columns sort loaded rows client-side.
      if (serverSort) params.set("sort", serverSort);
      params.set("page", String(pageToLoad));
      try {
        const res = await fetch(`/api/directory/providers?${params.toString()}`);
        const data = await res.json();
        if (seq !== loadSeq.current) return; // superseded while in flight
        setItems((prev) => (replace ? (data.items ?? []) : [...prev, ...(data.items ?? [])]));
        setNetworks((prev) => (replace ? (data.networks ?? {}) : { ...prev, ...(data.networks ?? {}) }));
        setRateMap((prev) => (replace ? (data.rates ?? {}) : { ...prev, ...(data.rates ?? {}) }));
        setTotal(data.total ?? 0);
        setPage(pageToLoad);
      } finally {
        // Only the current request may clear the flags — clear both so a
        // replace that superseded an in-flight append can't strand loadingMore.
        if (seq === loadSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [q, need, subspecialty, serverSort],
  );

  // Filters/tab changed — reload from page 1, replacing the accumulated set.
  // Debounced so each keystroke doesn't fire its own directory-wide scan;
  // Enter in the search box still loads immediately.
  useEffect(() => {
    // 150ms (was 250): sql/060 + the trigram indexes make the server search fast
    // enough that a tighter debounce no longer risks a scan storm, and the
    // client-side pre-filter in sortedProviders covers the gap instantly anyway.
    const t = setTimeout(() => load(1, true), 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const hasMore = items.length < total;
  const sentinelRef = useSentinel(() => load(page + 1, false), hasMore && !loading && !loadingMore);

  function resetFilters() {
    setQ("");
    setNeed(undefined);
    setSubspecialty(undefined);
  }

  const hasFilters = !!(q || need || subspecialty);

  // A provider row opens as a closable tab in the page's tab row (no
  // navigation, no breadcrumb). "Refer a client" still goes through the
  // SidePanel, which carries the Refer action.
  function openProvider(r: DirectoryProvider, opts: { refer?: boolean } = {}) {
    if (opts.refer) {
      setSelected(r);
      return;
    }
    setOpenTabs((tabs) =>
      tabs.some((t) => t.provider.id === r.id)
        ? tabs
        : [...tabs, { provider: r, network: r.npi ? (networks[r.npi] ?? null) : null }],
    );
    setView(r.id);
  }

  // Close a provider tab; if it was the active one, fall back to its left
  // neighbor (another open provider, else the list).
  function closeTab(id: string) {
    const idx = openTabs.findIndex((t) => t.provider.id === id);
    setOpenTabs((tabs) => tabs.filter((t) => t.provider.id !== id));
    if (view === id) setView(openTabs[idx - 1]?.provider.id ?? "list");
  }

  // Sort client-side over the rows loaded so far. The directory API has no
  // sort param, so a sort only reorders what's already paged in — scrolling
  // further still loads in the server's default order, then re-sorts.
  // `items` holds whichever tab's rows are loaded — each memo must only sort
  // its own row shape, so the inactive tab's memo returns [].
  const sortedProviders = useMemo(() => {
    const dir = providerSort.dir === "asc" ? 1 : -1;
    // Accepting/network sort values come from the per-page networks map:
    // accepting 2 > not-accepting 1 > no data 0; network = count, no data -1.
    const acceptingRank = (p: DirectoryProvider) => {
      const s = p.npi ? networks[p.npi] : undefined;
      return s ? (s.accepting ? 2 : 1) : 0;
    };
    const networkCount = (p: DirectoryProvider) => {
      const s = p.npi ? networks[p.npi] : undefined;
      return s ? s.networks.length : -1;
    };
    // Instant client-side reduction (TASK-SEARCH, the "sports feel"): while the
    // 150ms debounced server search is in flight, narrow the already-loaded rows
    // the moment a key lands. Mirrors the server ILIKE (name/city/profession/
    // subspecialty on the raw fields), so once the server answers for this q it
    // is idempotent — safe to apply unconditionally. Below 2 chars we match the
    // server, which returns the unfiltered default listing.
    const qn = q.trim().toLowerCase();
    const base =
      qn.length >= 2
        ? (items as DirectoryProvider[]).filter(
            (p) =>
              p.name.toLowerCase().includes(qn) ||
              (p.city ?? "").toLowerCase().includes(qn) ||
              (p.profession ?? "").toLowerCase().includes(qn) ||
              (p.subspecialty ?? "").toLowerCase().includes(qn),
          )
        : (items as DirectoryProvider[]);
    const sorted = [...base].sort((a, b) => {
      if (providerSort.col === "specialty") return (a.profession ?? "").localeCompare(b.profession ?? "") * dir;
      if (providerSort.col === "city") return (a.city ?? "").localeCompare(b.city ?? "") * dir;
      if (providerSort.col === "accepting") return (acceptingRank(a) - acceptingRank(b)) * dir;
      if (providerSort.col === "network") return (networkCount(a) - networkCount(b)) * dir;
      return providerDisplayName(a.name, a.entityType).localeCompare(providerDisplayName(b.name, b.entityType)) * dir;
    });
    // Pinned rows float above the sort, keeping their relative order.
    const pinnedFirst = [...sorted.filter((p) => pinnedIds.has(p.id)), ...sorted.filter((p) => !pinnedIds.has(p.id))];
    // On the UNFILTERED list, pinned providers belong at the top even when
    // they're not in the loaded pages (server pagination) — prepend from
    // storage. Under a search/filter we can't evaluate the match client-side,
    // so only loaded matches float.
    if (q.trim() || need || subspecialty) return pinnedFirst;
    const loaded = new Set(sorted.map((p) => p.id));
    return [...pinnedRows.filter((p) => !loaded.has(p.id)), ...pinnedFirst];
  }, [items, providerSort, pinnedIds, pinnedRows, q, need, subspecialty, networks]);

  // The in-chrome toolbar (search + chips left, utilities kebab right) and the
  // standard footer.
  const tableToolbar = (
    <>
      <SearchInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && load(1, true)}
        placeholder="Search by name, city, specialty or ZIP"
        className="w-full sm:w-[380px]"
      />
      <ChipMenu
        label="Specialty"
        value={need ? titleCase(need) : undefined}
        options={needOptions}
        annotate={(o) => (PRESCRIBER_SPECIALTIES.has(o) ? <Badge variant="info">Rx</Badge> : null)}
        onSelect={(v) => setNeed(v)}
        onClear={() => setNeed(undefined)}
      />
      {(facets.subspecialties?.length ?? 0) > 0 && (
        <ChipMenu
          label="Sub-specialty"
          value={subspecialty}
          options={facets.subspecialties ?? []}
          onSelect={(v) => setSubspecialty(v)}
          onClear={() => setSubspecialty(undefined)}
        />
      )}
      {hasFilters && <TextLink onClick={resetFilters}>Reset</TextLink>}
      <span className="ml-auto">
        <KebabMenu label="Table options" icon="dots-horizontal">
          <MenuItem
            icon="columns-3"
            label="Columns"
            onClick={() => {
              const r = document.getElementById("directory-utils")?.getBoundingClientRect();
              setColMenu(r ? { x: r.right, y: r.bottom + 4 } : { x: 24, y: 120 });
            }}
          />
          <MenuItem icon="download" label="Export" onClick={() => toast("Export isn’t wired up yet.", "info")} />
          <MenuItem icon="refresh-cw" label="Refresh" onClick={() => load(1, true)} />
        </KebabMenu>
      </span>
      <span id="directory-utils" aria-hidden />
    </>
  );
  const tableFooter = (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px] text-text-muted">
      <span className="min-w-0 truncate tabular-nums">{total.toLocaleString("en-US")} records</span>
      <span className="shrink-0">Data set by NYSgpt</span>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <IndexHeader
        actions={<AgentButton context={{ label: "Provider directory" }} agentId="directory" />}
        newLabel="New provider"
        onNew={() => toast("New provider isn\u2019t wired up yet.", "info")}
        slideActive={false}
        active={view === "list" ? "providers" : view}
        onChange={(k) => {
          if (k === "providers") setView("list");
          else setView(k);
        }}
        onClose={closeTab}
        tabs={[
          { key: "providers", label: "Providers" },
          ...openTabs.map((t) => ({
            key: t.provider.id,
            label: providerDisplayName(t.provider.name, t.provider.entityType),
            closable: true,
          })),
        ]}
      />

      <div className="flex min-h-0 flex-1 flex-col" hidden={view !== "list"}>
      {/* The toolbar lives INSIDE the table chrome, atop the header row (the
          stacked standard, 2026-07-23): search + filter chips left, utilities
          folded into one kebab right. Shared by both tabs' tables below. */}

      {/* Right-click any header for the column menu — same gesture the standard
          DataTable ships; cursor-anchored + fixed, so the Table cannot clip it. */}
      {(
        <ColumnPicker
          at={colMenu}
          onDismiss={() => setColMenu(null)}
          options={PROVIDER_COLUMNS}
          visible={visibleCols}
          onToggle={toggleCol}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center rounded-card border border-border bg-surface py-24 shadow-card">
          <Spinner size={24} />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-card border border-border bg-surface shadow-card">
          <EmptyState
            icon="globe"
            title="No matches"
            subtext="Try a broader search or clear the filters."
            actions={hasFilters ? <Button variant="secondary" onClick={resetFilters}>Clear filters</Button> : undefined}
          />
        </div>
      ) : (
        <Table
          className="min-h-0 flex-1"
          stickyHeader
          toolbar={tableToolbar}
          footer={tableFooter}
          onHeaderContextMenu={(e) => {
            e.preventDefault();
            setColMenu({ x: e.clientX, y: e.clientY });
          }}
          head={[
            <Checkbox key="all" aria-label="Select all loaded" checked={allLoadedChecked} onChange={toggleAllLoaded} />,
            <SortableHead key="name" label="Provider" col="name" sort={providerSort} onSort={toggleProviderSort} />,
            ...(vis("npi") ? ["NPI"] : []),
            ...(vis("specialty")
              ? [<SortableHead key="specialty" label="Specialty" col="specialty" sort={providerSort} onSort={toggleProviderSort} />]
              : []),
            ...(vis("subspecialty") ? ["Sub-specialty"] : []),
            ...(vis("type") ? ["Type"] : []),
            ...(vis("address") ? ["Address"] : []),
            ...(vis("city")
              ? [<SortableHead key="city" label="City" col="city" sort={providerSort} onSort={toggleProviderSort} />]
              : []),
            ...(vis("state") ? ["State"] : []),
            ...(vis("zip") ? ["Zip"] : []),
            ...(vis("phone") ? ["Phone"] : []),
            ...(vis("license") ? ["License"] : []),
            ...(vis("accepting")
              ? [<SortableHead key="accepting" label="Accepting" col="accepting" sort={providerSort} onSort={toggleProviderSort} />]
              : []),
            ...(vis("network")
              ? [
                  <Tooltip key="network" label="Number of insurance networks on file — open the provider for the full list.">
                    <SortableHead label="Network" col="network" sort={providerSort} onSort={toggleProviderSort} />
                  </Tooltip>,
                ]
              : []),
            ...(vis("payers") ? ["Payers"] : []),
            ...(vis("rate")
              ? [
                  <Tooltip key="rate" label="Best 60-minute therapy rate (90837) on file across payer books.">
                    <span className="inline-flex cursor-help items-center gap-1">
                      Rate <Icon name="info" size={13} className="text-text-muted" />
                    </span>
                  </Tooltip>,
                ]
              : []),
            ...(vis("source") ? ["Source"] : []),
            "",
          ]}
        >
          {sortedProviders.map((r) => {
            const name = providerDisplayName(r.name, r.entityType);
            const specialty = r.profession ? shortProfession(r.profession) : "–";
            const address = r.address ? titleCase(r.address) : "–";
            const city = r.city ? titleCase(r.city) : "–";
            const summary = r.npi ? networks[r.npi] : undefined;
            const rate = r.npi ? rateMap[r.npi] : undefined;
            const payers = summary?.payers ?? [];
            return (
              <Tr key={r.id} onClick={() => openProvider(r)}>
                <Td className="w-10" onClick={(e) => e.stopPropagation()}>
                  <Checkbox aria-label={`Select ${name}`} checked={checked.has(r.id)} onChange={() => toggleChecked(r.id)} />
                </Td>
                <Td className="max-w-56">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <TextLink variant="name" className="min-w-0 truncate" title={name} onClick={(e) => { e.stopPropagation(); openProvider(r); }}>
                      {name}
                    </TextLink>
                    {pinnedIds.has(r.id) && <Icon name="pin" size={13} className="shrink-0 fill-primary-wash text-text" />}
                    {favorites.has(r.id) && <Icon name="star" size={13} className="shrink-0 text-accent-ink" />}
                  </span>
                </Td>
                {vis("npi") && <Td className="whitespace-nowrap tabular-nums text-text-muted">{r.npi ?? "–"}</Td>}
                {vis("specialty") && (
                  <Td className="max-w-40 truncate" title={r.profession ? titleCase(r.profession) : undefined}>{specialty}</Td>
                )}
                {vis("subspecialty") && (
                  <Td className="max-w-40 truncate" title={r.subspecialty ?? undefined}>{r.subspecialty ?? "–"}</Td>
                )}
                {vis("type") && (
                  <Td className="whitespace-nowrap">{r.entityType === "2" ? "Org" : r.entityType === "1" ? "Person" : "–"}</Td>
                )}
                {vis("address") && <Td className="max-w-56 truncate" title={address}>{address}</Td>}
                {vis("city") && <Td className="max-w-32 truncate" title={city}>{city}</Td>}
                {vis("state") && <Td className="whitespace-nowrap">{stateFromZip(r.zip) ?? "–"}</Td>}
                {vis("zip") && (
                  <Td className="whitespace-nowrap tabular-nums">{(r.zip ?? "").replace(/[^0-9]/g, "").slice(0, 5) || "–"}</Td>
                )}
                {vis("phone") && <Td className="whitespace-nowrap tabular-nums">{r.phone ? formatPhone(r.phone) : "–"}</Td>}
                {vis("license") && (
                  <Td className="whitespace-nowrap">{[r.credential, r.licenseNo].filter(Boolean).join(" · ") || "–"}</Td>
                )}
                {vis("accepting") && (
                  <Td className="whitespace-nowrap">
                    {summary ? (
                      <Badge variant={summary.accepting ? "success" : "neutral"}>
                        {summary.accepting ? "Accepting" : "Not accepting"}
                      </Badge>
                    ) : (
                      "–"
                    )}
                  </Td>
                )}
                {vis("network") && <Td className="whitespace-nowrap tabular-nums">{summary ? summary.networks.length : "–"}</Td>}
                {vis("payers") && (
                  <Td className="max-w-44 truncate whitespace-nowrap" title={payers.join(", ") || undefined}>
                    {payers.length ? payers.slice(0, 2).join(", ") + (payers.length > 2 ? ` +${payers.length - 2}` : "") : "–"}
                  </Td>
                )}
                {vis("rate") && (
                  <Td className="whitespace-nowrap tabular-nums">
                    {rate?.best90837 != null ? `$${rate.best90837.toFixed(2)}` : "–"}
                  </Td>
                )}
                {vis("source") && (
                  <Td className="whitespace-nowrap text-text-muted">{r.source === "nppes" ? "NPPES" : "Medicaid"}</Td>
                )}
                <Td className="w-12" onClick={(e) => e.stopPropagation()}>
                  <KebabMenu label={`Actions for ${name}`}>
                    <MenuItem icon="person-circle" label="View details" onClick={() => openProvider(r)} />
                    <MenuItem icon="send" label="Refer a client" onClick={() => openProvider(r, { refer: true })} />
                    <MenuItem icon="pin" label={pinnedIds.has(r.id) ? "Unpin" : "Pin to top"} onClick={() => togglePin(r)} />
                    <MenuItem icon="star" label={favorites.has(r.id) ? "Unfavorite" : "Favorite"} onClick={() => toggleFavorite(r.id)} />
                  </KebabMenu>
                </Td>
              </Tr>
            );
          })}
          {hasMore && <LoadMoreRow sentinelRef={sentinelRef} colSpan={providerColSpan} />}
        </Table>
      )}
      </div>

      {openTabs.map((t) => (
        <div key={t.provider.id} className="min-h-0 flex-1" hidden={view !== t.provider.id}>
          <ProviderView provider={t.provider} network={t.network} onJump={(p) => openProvider(p)} />
        </div>
      ))}

      <DetailPanel
        item={selected}
        network={selected && isProvider(selected) ? networks[selected.npi ?? ""] ?? null : null}
        onClose={() => setSelected(null)}
        clients={clients}
        onReferred={() => toast("Referral sent.", "success")}
      />
    </div>
  );
}

// ── detail side panel + refer modal ──────────────────────────────────────────

function isProvider(item: DirectoryProvider | DirectoryProgram): item is DirectoryProvider {
  return (item as DirectoryProvider).npi !== undefined && "profession" in item;
}

function LabeledRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-2">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-[15px] text-text">{children}</dd>
    </div>
  );
}

type NpiState = { loading: boolean; result?: { found: boolean; status?: string; taxonomy?: string | null } };

export function DetailPanel({
  item,
  network,
  onClose,
  clients,
  onReferred,
}: {
  item: DirectoryProvider | DirectoryProgram | null;
  network?: ProviderNetworkSummary | null;
  onClose: () => void;
  clients: ClientOption[];
  onReferred: () => void;
}) {
  const [referOpen, setReferOpen] = useState(false);
  const [npi, setNpi] = useState<NpiState>({ loading: false });

  useEffect(() => {
    setNpi({ loading: false });
  }, [item?.id]);

  if (!item) return null;
  const provider = isProvider(item);

  async function verifyNpi(number: string) {
    setNpi({ loading: true });
    try {
      const res = await fetch(`/api/directory/npi?number=${number}`);
      const data = await res.json();
      setNpi({ loading: false, result: data });
    } catch {
      setNpi({ loading: false, result: { found: false } });
    }
  }

  const p = item as DirectoryProvider;
  const pr = item as DirectoryProgram;
  const address = [
    provider ? p.address : pr.address,
    provider ? p.city : pr.city,
    provider ? p.county : pr.county,
    provider ? p.zip : pr.zip,
  ]
    .filter(Boolean)
    .map((s) => titleCase(String(s)))
    .join(", ");

  return (
    <>
      <SidePanel
        open={!!item}
        onClose={onClose}
        icon={provider ? "person-circle" : "globe"}
        title={provider ? providerDisplayName(p.name, p.entityType) : pr.programName}
        footer={
          <div className="flex justify-end">
            <Button leftIcon="send" onClick={() => setReferOpen(true)}>
              Refer a client
            </Button>
          </div>
        }
      >
        <dl className="divide-y divide-border">
          {provider ? (
            <>
              <LabeledRow label="Specialty">{p.profession ? titleCase(p.profession) : null}</LabeledRow>
              <LabeledRow label="Sub-specialty">{p.subspecialty ?? null}</LabeledRow>
              {network && (
                <LabeledRow label="Insurance">
                  <span className="flex flex-col gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant={network.accepting ? "success" : "neutral"}>
                        {network.accepting ? "Accepting new patients" : "Not accepting new patients"}
                      </Badge>
                      {network.asOf && (
                        <span className="text-[13px] text-text-muted">as of {formatDate(network.asOf)}</span>
                      )}
                    </span>
                    <span className="text-[15px] text-text">{network.payers.join(", ")}</span>
                    {network.networks.length > 0 && (
                      <span className="text-[13px] text-text-muted">
                        {network.networks.length} network{network.networks.length === 1 ? "" : "s"}:{" "}
                        {network.networks.join(", ")}
                      </span>
                    )}
                  </span>
                </LabeledRow>
              )}
              <LabeledRow label="Credential">{p.credential ?? null}</LabeledRow>
              <LabeledRow label="Gender">{p.gender === "F" ? "Female" : p.gender === "M" ? "Male" : null}</LabeledRow>
              <LabeledRow label="Address">{address || null}</LabeledRow>
              <LabeledRow label="Phone">
                {p.phone ? (
                  <a href={`tel:${p.phone}`} className="text-primary hover:underline">
                    {p.phone}
                  </a>
                ) : null}
              </LabeledRow>
              <LabeledRow label="License">
                {p.licenseNo ? `${p.licenseNo}${p.licenseState ? ` · ${p.licenseState}` : ""}` : null}
              </LabeledRow>
              <LabeledRow label="Practice">
                {p.isSoleProprietor ? "Solo practice" : p.parentOrg ? titleCase(p.parentOrg) : null}
              </LabeledRow>
              <LabeledRow label="In practice since">{p.enumerationDate ? p.enumerationDate.slice(0, 4) : null}</LabeledRow>
              <LabeledRow label="NPI">
                {p.npi ? (
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{p.npi}</span>
                    {npi.result?.found ? (
                      <Badge variant="success">
                        <Icon name="check" size={12} /> {npi.result.status ?? "Verified"}
                      </Badge>
                    ) : npi.result && !npi.result.found ? (
                      <Badge variant="warning">Not found</Badge>
                    ) : npi.loading ? (
                      <Spinner size={14} />
                    ) : (
                      <TextLink onClick={() => verifyNpi(p.npi!)}>Verify</TextLink>
                    )}
                  </span>
                ) : null}
              </LabeledRow>
              {npi.result?.taxonomy && <LabeledRow label="NPPES taxonomy">{npi.result.taxonomy}</LabeledRow>}
              <LabeledRow label="Source">
                {p.source === "nppes" ? "National NPI registry (NPPES)" : "NY Medicaid enrolled provider listing"}
              </LabeledRow>
            </>
          ) : (
            <>
              <LabeledRow label="Agency">{pr.agency}</LabeledRow>
              <LabeledRow label="Facility">{pr.facility}</LabeledRow>
              <LabeledRow label="Program type">{pr.programType}</LabeledRow>
              <LabeledRow label="Populations">{pr.populations}</LabeledRow>
              <LabeledRow label="Address">{address || null}</LabeledRow>
              <LabeledRow label="Phone">
                {pr.phone ? (
                  <a href={`tel:${pr.phone}`} className="text-primary hover:underline">
                    {pr.phone}
                  </a>
                ) : null}
              </LabeledRow>
              <LabeledRow label="Source">NYS OMH mental-health program directory</LabeledRow>
            </>
          )}
        </dl>
      </SidePanel>

      <ReferModal
        open={referOpen}
        onClose={() => setReferOpen(false)}
        clients={clients}
        target={item}
        isProvider={provider}
        onSuccess={() => {
          setReferOpen(false);
          onClose();
          onReferred();
        }}
      />
    </>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMhotrs\b/, "MHOTRS")
    .replace(/\bSro\b/, "SRO")
    .replace(/\bAct\b/, "ACT");
}
