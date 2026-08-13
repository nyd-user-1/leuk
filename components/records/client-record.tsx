"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BoardGrid, type BoardItem } from "@/components/board/board-grid";
import { BoardCard } from "@/components/board/board-card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, MenuItem } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tag } from "@/components/ui/tag";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { IdentityCard } from "@/components/records/identity-card";
import { RECORD_RAIL_W } from "@/components/records/record-layout";
import { ClientStatusBadge, formatDob, tagHue } from "@/app/(app)/clients/ui";
import { ContactMenu } from "@/app/(app)/clients/[id]/contact-menu";
import { InsuranceTab } from "@/app/(app)/clients/[id]/insurance-tab";
import { FilesTab } from "@/app/(app)/clients/[id]/files-tab";
import { PersonalTab } from "@/app/(app)/clients/[id]/personal-tab";
import {
  BillingSummary,
  ReferralsSection,
  UpcomingAppointments,
} from "@/app/(app)/clients/[id]/overview-tab";
import { ClientNotes } from "@/components/notes/client-notes";
import { ClientInvoices } from "@/components/billing/client-invoices";
import { PrescriptionsTable } from "@/components/tables/prescriptions-table";
import { OrdersTable } from "@/components/tables/orders-table";
import { PrescribePanel } from "@/components/photon/prescribe-panel";
import { CardLibraryPanel, CARD_DRAG_TYPE, type LibraryCard } from "@/components/records/card-library-panel";
import { useLazyRows } from "@/components/tables/use-lazy-rows";
import { inScope } from "@/components/tables/scope";
import type { PrescriptionRow } from "@/components/tables/prescriptions-table";
import { formatCents, formatDateTime } from "@/lib/format";
import type { ServiceOption } from "@/components/billing/new-invoice-panel";
import type { InvoiceListItem } from "@/lib/repos/invoices";
import type { PolicyWithPayer } from "@/lib/repos/policies";
import type { PractitionerOption } from "@/lib/repos/clients";
import type { FileAccess } from "@/lib/repos/files";
import type { Appointment, Client, ClientStatus, FileRecord, Payer, Referral } from "@/lib/types";

// A client record IS a board: the same dashboard the practice gets, scoped to
// one person. The rail on the left says who they are and stays put; the cards
// on the right are the record's sections, and the practitioner owns which ones
// are on the board, in what order, at what size.
//
// Nothing here re-implements a section: each card MOUNTS the component the old
// tab used (and, for the object lists, the same components/tables/* the rail
// and the standalone routes mount, scoped to this client). This file is
// composition — placement, sizes, persistence — exactly as /analytics is.

/** Everything a client record renders, in one payload — see the API twin at
 *  app/api/clients/[id]/record. Server-fetched by the deep-link route, loaded
 *  through the twin when the rail opens a tab. */
export interface ClientRecordBundle {
  client: Client;
  practitioners: PractitionerOption[];
  practitionerName: string | null;
  policies: PolicyWithPayer[];
  payers: Payer[];
  files: FileRecord[];
  /** fileId → download history, for the Documents card's "Last downloaded"
   *  column. Both producers of this bundle must fill it, or the column appears
   *  on the deep-link path and vanishes on the rail path. */
  fileAccess: Record<string, FileAccess>;
  appointments: Appointment[];
  /** InvoiceListItem extends Invoice, so ONE read feeds both the Billing
   *  summary card (which wants Invoice) and the Billing card (which wants the
   *  list item). */
  invoices: InvoiceListItem[];
  referrals: Referral[];
  /** What ClientBilling's server half used to fetch — the Billing card mounts
   *  its interactive half (ClientInvoices) directly, so the data comes here. */
  billingSummary: { balanceCents: number; lastPaymentCents: number | null; lastPaymentAt: string | null };
  services: ServiceOption[];
  /** Photon wiring for the Rx card; empty orgId = Photon unconfigured. */
  orgId: string;
  photonClientId: string;
  photonEnv: string;
}

// The client board's card footprints, in grid units (12 cols × 24px rows).
// These cards hold tables and forms, not stat tiles: a third of the board
// beside the rail, half, or the full width — and free-form from there, the
// corner handle resizes in live grid steps. A card carrying a DataTable (Rx,
// Orders, Billing) defaults to full width: its toolbar alone wants ~700px.
const SIZE_DIMS = {
  sm: { w: 4, h: 13, minW: 3, minH: 8 },
  md: { w: 8, h: 18, minW: 4, minH: 10 },
  lg: { w: 12, h: 22, minW: 6, minH: 10 },
} as const;
type CardSizeKey = keyof typeof SIZE_DIMS;

const STATUSES: Array<{ value: ClientStatus; label: string }> = [
  { value: "lead", label: "Lead" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

/** One card the board can hold. `count` becomes the badge the old tab line wore;
 *  `action` is the section's own New/primary button, lifted into the card's
 *  header — the old tab drew it inside itself, the card draws it as chrome.
 *  `category`/`icon`/`blurb` are what the card library lists it by. */
interface CardDef extends Omit<LibraryCard, "key" | "title"> {
  key: string;
  title: string;
  size: CardSizeKey;
  count?: (r: ClientRecordBundle) => number | undefined;
  action?: (r: ClientRecordBundle) => React.ReactNode;
  render: (r: ClientRecordBundle) => React.ReactNode;
}

// The board's layout is per USER per RECORD TYPE — one layout for every client,
// not one per client (a practitioner arranges their working view once). Card
// KEYS only: no client data ever reaches localStorage.
const BOARD_KEY = "leuk-record:client:board";

/** The board a client opens with — a working view, not everything there is.
 *  The rest of the catalog waits in the Add-card library. */
const DEFAULT_KEYS = ["appointments", "billing-summary", "rx", "insurance", "files"];

/** Pre-designed boards, the /analytics views pattern: a named set of cards for
 *  a mode of work. The switcher is in the rail's kebab — the record already has
 *  one menu, and a second control for three items would be a toolbar. */
const VIEWS: Array<{ name: string; ids: string[] }> = [
  { name: "Care", ids: ["snapshot", "appointments", "rx", "orders", "referrals"] },
  { name: "Money", ids: ["snapshot", "billing-summary", "billing", "insurance"] },
  { name: "Records", ids: ["snapshot", "personal", "documentation", "files"] },
];

const GENDERS = ["Female", "Male", "Non-binary", "Prefer to self-describe", "Prefer not to say"];

interface BoardState {
  ids: string[];
}

function readBoard(): BoardState | null {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    return raw ? (JSON.parse(raw) as BoardState) : null;
  } catch {
    return null;
  }
}
function writeBoard(state: BoardState) {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(state));
  } catch {
    /* storage disabled — the board still works, it just won't persist */
  }
}

/** The aggregate card: one line per section, each the headline number that
 *  section exists to answer, and each a jump to that card when it's on the
 *  board. A line for a card you've removed stays as plain text — it reports the
 *  fact without pretending to a destination that isn't there. */
function SnapshotCard({
  record,
  placed,
  onJump,
}: {
  record: ClientRecordBundle;
  placed: string[];
  onJump: (key: string) => void;
}) {
  // The Rx list has no per-client count endpoint — the table fetches the book
  // and scopes it client-side, so the snapshot does the same, and only once the
  // client actually has a Photon record to count.
  const lazy = useLazyRows<PrescriptionRow>(
    "/api/photon/prescriptions/all",
    "prescriptions",
    !!record.client.photonPatientId,
  );
  const next = useMemo(
    () =>
      record.appointments
        .filter((a) => new Date(a.startsAt).getTime() >= Date.now() && a.status !== "cancelled")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0],
    [record.appointments],
  );
  const rx = !record.client.photonPatientId
    ? "Not synced"
    : lazy.rows === null
      ? "…"
      : lazy.rows.filter((r) => inScope({ clientId: record.client.id }, r) && r.state === "ACTIVE").length;

  const rows: Array<{ key: string; label: string; value: React.ReactNode }> = [
    { key: "appointments", label: "Next appointment", value: next ? formatDateTime(next.startsAt) : "None scheduled" },
    { key: "billing-summary", label: "Balance outstanding", value: formatCents(record.billingSummary.balanceCents) },
    { key: "rx", label: "Active prescriptions", value: rx },
    { key: "insurance", label: "Policies on file", value: record.policies.length },
    { key: "files", label: "Files", value: record.files.length },
  ];

  return (
    <div className="flex min-h-0 flex-col">
      {rows.map((r) => {
        const on = placed.includes(r.key);
        const line = (
          <>
            <span className="truncate text-[15px] text-text-muted">{r.label}</span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-text">{r.value}</span>
          </>
        );
        return on ? (
          <button
            key={r.key}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onJump(r.key)}
            title={`Go to ${CARD_TITLES[r.key] ?? r.key}`}
            className="-mx-1 flex items-center justify-between gap-3 rounded-field px-1 py-1.5 text-left transition-colors hover:bg-canvas"
          >
            {line}
          </button>
        ) : (
          <span key={r.key} className="-mx-1 flex items-center justify-between gap-3 px-1 py-1.5">
            {line}
          </span>
        );
      })}
    </div>
  );
}

/** Titles for the snapshot's jump tooltips — the CARDS list is built per render
 *  inside the component, so the plain-text names live here. */
const CARD_TITLES: Record<string, string> = {
  appointments: "Upcoming appointments",
  "billing-summary": "Billing summary",
  rx: "Rx",
  insurance: "Insurance",
  files: "Files",
};

export function ClientRecord({
  record,
  initialCard,
  onReload,
}: {
  record: ClientRecordBundle;
  /** A deep link's ?tab= value. Card keys ARE the old tab keys, so every
   *  ?tab=rx reference in the app still lands on the thing it named. */
  initialCard?: string;
  onReload?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const { client } = record;
  const name = `${client.firstName} ${client.lastName}`;

  // Each section's create flow keeps its panel inside the section; the board
  // only owns the trigger, the same handshake the object tables use.
  const [newPolicyOpen, setNewPolicyOpen] = useState(false);
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [prescribeOpen, setPrescribeOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dropHint, setDropHint] = useState(false);

  // The Rx card is the one section with no single component behind it: the LIST
  // is the same portable table /prescriptions and the rail mount (scoped to this
  // client), while the WRITE half — prescribe, and the sync that has to happen
  // before you can — came off the old Rx tab. M2M cannot write prescriptions, so
  // PrescribePanel still goes through the provider's own Photon login.
  const patientId = client.photonPatientId;
  const canPrescribe = !!record.photonClientId && !!record.orgId;

  // The snapshot needs the CURRENT placement to know which of its lines lead
  // anywhere, but the catalog must not rebuild every time a card moves on or
  // off the board — a ref keeps the snapshot's render fresh without making
  // CARDS depend on the board state it is itself a member of.
  const placedRef = useRef<string[]>([]);
  const jumpToCard = useCallback((key: string) => {
    document
      .querySelector(`[data-board-card="${CSS.escape(key)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const syncToPhoton = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/photon/sync-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json?.error ?? "Could not sync this client to Photon.", "danger");
        return;
      }
      toast("Synced to Photon.", "success");
      onReload?.();
    } finally {
      setSyncing(false);
    }
  }, [client.id, toast, onReload]);

  const CARDS: CardDef[] = useMemo(
    () => [
      {
        key: "appointments",
        title: "Upcoming appointments",
        size: "md",
        category: "Care",
        icon: "calendar",
        blurb: "What’s next on the calendar",
        render: (r) => <UpcomingAppointments appointments={r.appointments} bare />,
      },
      {
        key: "billing-summary",
        title: "Billing summary",
        size: "sm",
        category: "Money",
        icon: "dollar",
        blurb: "Outstanding, paid to date, recent invoices",
        render: (r) => <BillingSummary invoices={r.invoices} bare />,
      },
      {
        key: "rx",
        title: "Rx",
        size: "lg",
        category: "Care",
        icon: "pill-bottle",
        blurb: "Prescriptions written through Photon",
        action: (r) =>
          r.client.photonPatientId ? (
            <Button
              size="sm"
              variant="secondary"
              leftIcon="plus"
              disabled={!canPrescribe}
              title={canPrescribe ? undefined : "Photon is not configured on this server."}
              onClick={() => setPrescribeOpen(true)}
            >
              Create prescription
            </Button>
          ) : null,
        render: (r) =>
          r.client.photonPatientId ? (
            <PrescriptionsTable scope={{ clientId: r.client.id }} />
          ) : (
            <EmptyState
              icon="pill-bottle"
              title="Not synced to Photon"
              subtext="This client needs a Photon patient record before prescriptions can be read or written."
              actions={
                <Button leftIcon="file-up" onClick={syncToPhoton} disabled={syncing}>
                  {syncing ? "Syncing…" : "Sync to Photon"}
                </Button>
              }
            />
          ),
      },
      {
        key: "insurance",
        title: "Insurance",
        size: "md",
        category: "Money",
        icon: "shield-plus",
        blurb: "Policies on file and their verification",
        count: (r) => r.policies.length,
        action: () => (
          <Button size="sm" variant="secondary" leftIcon="plus" onClick={() => setNewPolicyOpen(true)}>
            New policy
          </Button>
        ),
        render: (r) => (
          <InsuranceTab
            clientId={r.client.id}
            policies={r.policies}
            payers={r.payers}
            files={r.files}
            bare
            newOpen={newPolicyOpen}
            onNewOpenChange={setNewPolicyOpen}
          />
        ),
      },
      {
        key: "files",
        title: "Documents",
        // Carries a DataTable now, so it takes the full-width default the other
        // table cards use — six columns do not fit in a half-width card.
        size: "lg",
        category: "Records",
        icon: "file-text",
        blurb: "Uploads, form PDFs and superbills",
        count: (r) => r.files.length,
        render: (r) => (
          <FilesTab
            clientId={r.client.id}
            files={r.files}
            // The bundle already names everyone who can have uploaded: the
            // practice's practitioners, plus the client's own portal login.
            uploaderNames={{
              ...Object.fromEntries(r.practitioners.map((p) => [p.id, p.name])),
              ...(r.client.userId ? { [r.client.userId]: `${r.client.firstName} ${r.client.lastName}` } : {}),
            }}
            access={r.fileAccess}
            bare
          />
        ),
      },
      // Everything below is off the default board and lives in the library.
      {
        key: "snapshot",
        title: "Snapshot",
        size: "sm",
        category: "Records",
        icon: "activity",
        blurb: "The record at a glance — each line jumps to its card",
        render: (r) => <SnapshotCard record={r} placed={placedRef.current} onJump={jumpToCard} />,
      },
      {
        key: "personal",
        title: "Personal",
        size: "md",
        category: "Records",
        icon: "person-circle",
        blurb: "Demographics, editable",
        render: (r) => <PersonalTab client={r.client} practitioners={r.practitioners} bare />,
      },
      {
        key: "documentation",
        title: "Documentation",
        size: "md",
        category: "Records",
        icon: "note",
        blurb: "Clinical notes, drafts and signed",
        render: (r) => <ClientNotes clientId={r.client.id} bare />,
      },
      {
        key: "billing",
        title: "Billing",
        size: "lg",
        category: "Money",
        icon: "credit-card",
        blurb: "Invoices, payments and the balance",
        action: () => (
          <Button size="sm" variant="secondary" leftIcon="plus" onClick={() => setNewInvoiceOpen(true)}>
            New invoice
          </Button>
        ),
        render: (r) => (
          <ClientInvoices
            clientId={r.client.id}
            invoices={r.invoices}
            summary={r.billingSummary}
            services={r.services}
            bare
            newOpen={newInvoiceOpen}
            onNewOpenChange={setNewInvoiceOpen}
          />
        ),
      },
      {
        key: "orders",
        title: "Orders",
        size: "lg",
        category: "Care",
        icon: "send",
        blurb: "Pharmacy orders and their fills",
        render: (r) =>
          r.client.photonPatientId ? (
            <OrdersTable scope={{ clientId: r.client.id }} />
          ) : (
            <EmptyState icon="send" title="Not synced to Photon" subtext="This client has no Photon patient record yet." />
          ),
      },
      {
        key: "referrals",
        title: "Referrals",
        size: "sm",
        category: "Care",
        icon: "globe",
        blurb: "Providers and programs this client was sent to",
        count: (r) => r.referrals.length,
        render: (r) => <ReferralsSection referrals={r.referrals} bare />,
      },
    ],
    [newPolicyOpen, newInvoiceOpen, canPrescribe, syncing, syncToPhoton],
  );
  const CARD_BY_KEY = useMemo(() => Object.fromEntries(CARDS.map((c) => [c.key, c])), [CARDS]);
  const DEFAULT_IDS = useMemo(() => DEFAULT_KEYS.filter((k) => CARDS.some((c) => c.key === k)), [CARDS]);

  const [board, setBoard] = useState<BoardState>(() => ({ ids: DEFAULT_IDS }));
  // Bumping this rebuilds the grid's arrangement from defaults — Reset.
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const [ready, setReady] = useState(false);

  // Server render has no localStorage, so first paint is the default board;
  // then adopt whatever this browser saved. Keys that no longer exist are
  // dropped rather than rendered as holes.
  useEffect(() => {
    const saved = readBoard();
    const ids = (saved?.ids ?? DEFAULT_IDS).filter((id) => CARD_BY_KEY[id]);
    // A deep link names a card: put it on the board if this browser had removed
    // it, so ?tab=rx can never land on a record that doesn't show prescriptions.
    if (initialCard && CARD_BY_KEY[initialCard] && !ids.includes(initialCard)) ids.push(initialCard);
    setBoard({ ids });
    setReady(true);
  }, [DEFAULT_IDS, CARD_BY_KEY, initialCard]);

  // …and scroll to it, once it has actually rendered.
  useEffect(() => {
    if (!ready || !initialCard) return;
    const el = document.querySelector(`[data-board-card="${CSS.escape(initialCard)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [ready, initialCard]);

  const commit = useCallback(
    (next: BoardState) => {
      setBoard(next);
      if (ready) writeBoard(next);
    },
    [ready],
  );


  const removeCard = useCallback(
    (key: string) => commit({ ...board, ids: board.ids.filter((k) => k !== key) }),
    [board, commit],
  );




  const addCard = useCallback(
    (key: string) => {
      if (!CARD_BY_KEY[key] || board.ids.includes(key)) return;
      commit({ ...board, ids: [...board.ids, key] });
    },
    [board, commit, CARD_BY_KEY],
  );

  /** Apply a pre-designed view: swap the card set, keep each card's saved box.
   *  The grid overlays what it has and shelf-packs the rest, so switching to a
   *  view and back finds your arrangement where you left it. */
  const applyView = useCallback(
    (ids: string[]) => commit({ ids: ids.filter((id) => CARD_BY_KEY[id]) }),
    [commit, CARD_BY_KEY],
  );

  const resetBoard = useCallback(() => {
    commit({ ids: DEFAULT_IDS });
    // The arrangement lives with the grid — clear it and rebuild from defaults.
    try {
      localStorage.removeItem(`${BOARD_KEY}:layout`);
    } catch {
      /* ignore */
    }
    setLayoutEpoch((e) => e + 1);
  }, [commit, DEFAULT_IDS]);

  /** One field, straight to the record's existing write path. Throws so the
   *  identity card keeps the editor open on failure — the practitioner's typing
   *  is not thrown away because the server said no. */
  const saveField = useCallback(
    async (patch: Record<string, unknown>) => {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast(data?.error ?? "Could not save that change.", "danger");
        throw new Error("save failed");
      }
      if (onReload) onReload();
      else router.refresh();
    },
    [client.id, toast, onReload, router],
  );

  async function setStatus(status: ClientStatus) {
    if (status === client.status) return;
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast("Could not update status.", "danger");
      return;
    }
    toast(
      <>
        <b>{name}</b> marked {STATUSES.find((s) => s.value === status)?.label.toLowerCase()}
      </>,
      "success",
    );
    // The record is the rail's, not the route's — reload the bundle when the
    // host gave us a way to; fall back to the route when it didn't.
    if (onReload) onReload();
    else router.refresh();
  }

  const placed = board.ids.filter((id) => CARD_BY_KEY[id]);
  const boardItems: BoardItem[] = placed.map((key) => ({ id: key, ...SIZE_DIMS[CARD_BY_KEY[key].size] }));
  // Read by the snapshot's lines as they render, just below.
  placedRef.current = placed;

  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      {/* The rail: narrow, full height of the column, and it does not move.
          The board beside it scrolls under the tab line and away. */}
      <aside className={`shrink-0 lg:h-full ${RECORD_RAIL_W}`}>
        <IdentityCard
          name={name}
          subtitle={client.id}
          actions={
            <ContactMenu
              clientId={client.id}
              email={client.email}
              phone={client.phone}
              board={{
                onAddCard: () => setLibraryOpen(true),
                onReset: resetBoard,
                views: VIEWS.map((v) => ({ name: v.name, apply: () => applyView(v.ids) })),
              }}
            />
          }
          // Every value is double-click-to-edit, and each editor is the control
          // the Personal tab uses for that field — same semantics, same PATCH,
          // no second set of rules to keep in step.
          fields={[
            {
              label: "Email",
              value: client.email,
              edit: { kind: "email", value: client.email ?? "", onSave: (v) => saveField({ email: v || null }) },
            },
            {
              label: "Phone",
              value: client.phone,
              edit: { kind: "tel", value: client.phone ?? "", onSave: (v) => saveField({ phone: v || null }) },
            },
            {
              label: "Address",
              value: client.address,
              edit: {
                kind: "text",
                value: client.address ?? "",
                placeholder: "Street, city, state, zip",
                onSave: (v) => saveField({ address: v || null }),
              },
            },
            {
              label: "Date of birth",
              value: client.dob ? formatDob(client.dob) : null,
              edit: { kind: "date", value: client.dob ?? "", onSave: (v) => saveField({ dob: v || null }) },
            },
            {
              label: "Gender",
              value: client.gender,
              edit: {
                kind: "select",
                value: client.gender ?? "",
                options: GENDERS.map((g) => ({ value: g, label: g })),
                onSave: (v) => saveField({ gender: v || null }),
              },
            },
            {
              label: "Pronouns",
              value: client.pronouns,
              edit: {
                kind: "text",
                value: client.pronouns ?? "",
                placeholder: "they/them",
                onSave: (v) => saveField({ pronouns: v || null }),
              },
            },
            {
              label: "Primary practitioner",
              value: record.practitionerName,
              edit: {
                kind: "select",
                value: client.primaryPractitionerId ?? "",
                options: record.practitioners.map((p) => ({ value: p.id, label: p.name })),
                onSave: (v) => saveField({ primaryPractitionerId: v || null }),
              },
            },
            {
              label: "Tags",
              value:
                client.tags.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {client.tags.map((t) => (
                      <Tag key={t} hue={tagHue(t)}>
                        {t}
                      </Tag>
                    ))}
                  </span>
                ) : null,
              // Comma-separated, exactly as the Personal tab takes them.
              edit: {
                kind: "text",
                value: client.tags.join(", "),
                placeholder: "Comma separated",
                onSave: (v) =>
                  saveField({
                    tags: v
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  }),
              },
            },
            {
              // Status sits at the bottom as a field of its own, and keeps the
              // picker it had when it was a pill beside the name.
              label: "Status",
              value: (
                <DropdownMenu
                  label="Change status"
                  align="left"
                  width="w-44"
                  trigger={
                    <ClientStatusBadge status={client.status} withChevron className="cursor-pointer hover:opacity-80" />
                  }
                >
                  {STATUSES.map((s) => (
                    <MenuItem
                      key={s.value}
                      label={s.label}
                      selected={s.value === client.status}
                      onClick={() => setStatus(s.value)}
                    />
                  ))}
                </DropdownMenu>
              ),
            },
          ]}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* The drop surface: a card dragged in from the library lands here. */}
        <div
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(CARD_DRAG_TYPE)) {
              e.preventDefault();
              setDropHint(true);
            }
          }}
          onDragLeave={() => setDropHint(false)}
          onDrop={(e) => {
            setDropHint(false);
            const key = e.dataTransfer.getData(CARD_DRAG_TYPE) || e.dataTransfer.getData("text/plain");
            if (key) {
              e.preventDefault();
              addCard(key);
            }
          }}
          className={`min-h-0 flex-1 overflow-y-auto rounded-card transition-colors ${
            dropHint ? "bg-primary-wash outline-dashed outline-2 outline-offset-2 outline-primary" : ""
          }`}
        >
        {placed.length === 0 ? (
          <EmptyState
            icon="grid"
            title="An empty record"
            subtext="Add a card to build this client’s working view."
            actions={
              <Button variant="primary" leftIcon="plus" onClick={() => setLibraryOpen(true)}>
                Open card library
              </Button>
            }
          />
        ) : (
          <BoardGrid
            items={boardItems}
            storageKey={`${BOARD_KEY}:layout`}
            epoch={layoutEpoch}
            renderCard={(key) => {
              const def = CARD_BY_KEY[key];
              const count = def.count?.(record);
              return (
                <BoardCard
                  label={def.title}
                  title={
                    <span className="inline-flex items-center gap-1.5">
                      {def.title}
                      {count !== undefined && (
                        <span className="rounded-full bg-canvas px-1.5 text-[13px] tabular-nums text-text-muted">
                          {count}
                        </span>
                      )}
                    </span>
                  }
                  titleText={def.title}
                  menu={def.action?.(record)}
                  onRemove={() => removeCard(key)}
                >
                  {/* Each card is a window onto its section: the section keeps
                      its own scroll, the card keeps the board's geometry. */}
                  <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{def.render(record)}</div>
                </BoardCard>
              );
            }}
          />
        )}
        </div>
      </div>

      <CardLibraryPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        catalog={CARDS.map(({ key, title, category, icon, blurb }) => ({ key, title, category, icon, blurb }))}
        placed={placed}
        onAdd={addCard}
        onRemove={removeCard}
      />

      {/* The prescribe flow rides with the record, not the Rx card: it must
          survive the card being resized, reordered or taken off the board
          mid-write. Writes go through the provider's own Photon login — M2M
          cannot write prescriptions. */}
      {canPrescribe && patientId && (
        <PrescribePanel
          open={prescribeOpen}
          onClose={() => setPrescribeOpen(false)}
          onCreated={() => {
            toast("Prescription sent to Photon.", "success");
            onReload?.();
          }}
          patientId={patientId}
          clientName={name}
          photonClientId={record.photonClientId}
          orgId={record.orgId}
          photonEnv={record.photonEnv}
        />
      )}
    </div>
  );
}

/** The rail's loading state while a freshly-opened tab fetches its record. */
export function ClientRecordLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size={24} />
    </div>
  );
}
