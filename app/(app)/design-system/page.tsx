"use client";

import { useState, type ReactNode } from "react";
import { AccordionSection } from "@/components/ui/accordion-section";
import { Avatar, AvatarGroup } from "@/components/ui/avatar";
import { Badge, CountBadge, DotBadge } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { BoardCard } from "@/components/board/board-card";
import { BoardGrid } from "@/components/board/board-grid";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, SettingsCard } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceChip } from "@/components/ui/choice-chip";
import { ColorSwatch, EVENT_COLORS } from "@/components/ui/color-swatch";
import { DatePicker } from "@/components/ui/date-picker";
import { Divider } from "@/components/ui/divider";
import { DropdownMenu, MenuDivider, MenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { FileUpload } from "@/components/ui/file-upload";
import { FilterChip } from "@/components/ui/filter-chip";
import { FilterMenu } from "@/components/ui/filter-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Icon, IconSquare, type IconName } from "@/components/ui/icons";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { LibraryCard } from "@/components/ui/library-card";
import { ListRow } from "@/components/ui/list-row";
import { Logo } from "@/components/ui/logo";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SquareMeter } from "@/components/ui/square-meter";
import { Radio } from "@/components/ui/radio";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import { Skeleton, Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { Stepper } from "@/components/ui/stepper";
import { Table, Td, Tr } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { RelatedLink, TextLink } from "@/components/ui/text-link";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Toggle } from "@/components/ui/toggle";
import { Toolbar } from "@/components/ui/toolbar";
import { Tooltip } from "@/components/ui/tooltip";
import { UserChip } from "@/components/ui/user-chip";
import { ProviderCta } from "@/components/marketing/provider-cta";
import { TherapistSearchCta } from "@/components/marketing/therapist-search-cta";
import { InsurerStrip } from "@/components/site/insurer-strip";

// Design System — Leuk foundations + the full shared UI kit, plus a
// reference index of the feature components.
//
// Kept deliberately light:
//   • Tabs render only the ACTIVE panel (see `tab` switch) — the other panels
//     aren't in the DOM.
//   • Primitives are presentational, so they're demoed live.
//   • Feature components (ProseMirror editor, WebRTC stage, data-backed
//     dashboards…) are cataloged as METADATA only — never imported — so this
//     route never bundles their heavy dependencies.

// ── Foundations data ─────────────────────────────────────────────────────────

const BRAND = [
  { name: "primary", hex: "#3F8290" },
  { name: "primary-hover", hex: "#35707C" },
  { name: "primary-deep", hex: "#2C5C66" },
  { name: "primary-weak", hex: "#B7D8DD" },
  { name: "primary-wash", hex: "#DCECEC" },
  { name: "accent", hex: "#F0AE55" },
  { name: "accent-ink", hex: "#C58A2E" },
];
const CHROME = [
  { name: "sidebar-bg", hex: "#1C2440" },
  { name: "sidebar-active", hex: "#2B3557" },
  { name: "canvas", hex: "#F2F3F6" },
  { name: "surface", hex: "#FFFFFF" },
  { name: "border", hex: "#E6E7EB" },
];
const TEXT = [
  { name: "text", hex: "#212A47" },
  { name: "text-body", hex: "#4B5563" },
  { name: "text-muted", hex: "#9CA3AF" },
];
const STATUS = [
  { name: "success", hex: "#16A34A" },
  { name: "warning", hex: "#B7791F" },
  { name: "danger", hex: "#DC2626" },
  { name: "info", hex: "#35707C" },
];

// ── Feature-component catalog (metadata only — nothing imported) ──────────────

const FEATURES: Array<{
  area: string;
  items: Array<{ name: string; path: string; desc: string; composedOf?: Array<{ name: string; feature?: boolean }> }>;
}> = [
  {
    area: "Billing",
    items: [
      {
        name: "BillingShell",
        path: "billing/billing-shell.tsx",
        desc: "Master/detail split — invoice list pane (Tabs Open/Settled/Payers + search) beside the open invoice.",
        // Primitives actually imported by the file (verified against its import block).
        composedOf: [
          { name: "Tabs" }, { name: "SearchInput" }, { name: "Avatar" }, { name: "ListRow" },
          { name: "KebabMenu" }, { name: "EmptyState" }, { name: "Button" },
          { name: "InvoiceStatusBadge", feature: true }, { name: "NewInvoicePanel", feature: true },
          { name: "PayerPanel", feature: true },
        ],
      },
      {
        name: "ClientBilling",
        path: "billing/client-billing.tsx",
        desc: "Client Billing tab — async server wrapper.",
        // No primitives directly: fetches data and delegates to a feature component.
        composedOf: [{ name: "ClientInvoices", feature: true }],
      },
      {
        name: "ClientInvoices",
        path: "billing/client-invoices.tsx",
        desc: "StatCards + the client's invoice list.",
        // Mixed: composes primitives AND three sibling features.
        composedOf: [
          { name: "StatCard" }, { name: "Table" }, { name: "KebabMenu" }, { name: "EmptyState" },
          { name: "Button" }, { name: "TextLink" },
          { name: "InvoiceStatusBadge", feature: true }, { name: "NewInvoicePanel", feature: true },
          { name: "RecordPaymentModal", feature: true },
        ],
      },
      {
        name: "InvoicePane",
        path: "billing/invoice-pane.tsx",
        desc: "Invoice pane — document-style detail with inline actions (send · record · collect · void).",
        composedOf: [
          { name: "Avatar" }, { name: "Banner" }, { name: "Button" }, { name: "Field" },
          { name: "KebabMenu" }, { name: "Modal" },
          { name: "InvoiceStatusBadge", feature: true }, { name: "RecordPaymentModal", feature: true },
        ],
      },
      {
        name: "PortalInvoiceSheet",
        path: "billing/portal-invoice-sheet.tsx",
        desc: "Client-portal invoice sheet — document + Pay footer + in-place success state.",
        composedOf: [
          { name: "SidePanel" }, { name: "Badge" }, { name: "Button" }, { name: "Logo" },
          { name: "TextLink" },
        ],
      },
      {
        name: "InvoiceStatusBadge",
        path: "billing/invoice-status-badge.tsx",
        desc: "Maps invoice status → Badge variant.",
        composedOf: [{ name: "Badge" }],
      },
      {
        name: "NewInvoicePanel",
        path: "billing/new-invoice-panel.tsx",
        desc: "New-invoice SidePanel with client picker.",
        composedOf: [
          { name: "SidePanel" }, { name: "Field" }, { name: "Select" }, { name: "DatePicker" },
          { name: "Button" }, { name: "TextLink" },
        ],
      },
      {
        name: "PayerPanel",
        path: "billing/payer-panel.tsx",
        desc: "New / edit payer SidePanel.",
        composedOf: [{ name: "SidePanel" }, { name: "Field" }, { name: "Button" }],
      },
      {
        name: "PrintActions",
        path: "billing/print-actions.tsx",
        desc: "Screen-only toolbar on the print view.",
        composedOf: [{ name: "Button" }],
      },
      {
        name: "RecordPaymentModal",
        path: "billing/record-payment-modal.tsx",
        desc: "Record-payment Modal.",
        composedOf: [{ name: "Modal" }, { name: "Field" }, { name: "Select" }, { name: "Button" }],
      },
    ],
  },
  {
    area: "Telehealth call",
    items: [
      {
        name: "CallStage",
        path: "call/call-stage.tsx",
        desc: "Full-viewport WebRTC telehealth stage.",
        composedOf: [
          { name: "Card" }, { name: "Toggle" }, { name: "Spinner" }, { name: "Divider" }, { name: "Button" },
          { name: "CallHeader", feature: true }, { name: "CallControls", feature: true },
          { name: "VideoTile", feature: true }, { name: "ScribePanel", feature: true },
          { name: "useWebRTC", feature: true },
        ],
      },
      {
        name: "CallHeader",
        path: "call/call-header.tsx",
        desc: "Top strip on the dark stage — camera chip + timer.",
        composedOf: [{ name: "Badge" }],
      },
      { name: "CallControls", path: "call/call-controls.tsx", desc: "Bottom control toolbar on the stage." },
      {
        name: "VideoTile",
        path: "call/video-tile.tsx",
        desc: "Participant surface on the dark stage.",
        composedOf: [{ name: "Avatar" }],
      },
      { name: "useWebRTC", path: "call/use-webrtc.ts", desc: "Native-WebRTC 1-on-1 call hook (/api/signal)." },
    ],
  },
  {
    area: "Forms & intake",
    items: [
      {
        name: "FormBuilder",
        path: "forms/form-builder.tsx",
        desc: "Palette · question cards · settings builder.",
        composedOf: [
          { name: "Field" }, { name: "Textarea" }, { name: "Toggle" }, { name: "IconButton" },
          { name: "Button" }, { name: "Badge" }, { name: "SendFormModal", feature: true },
        ],
      },
      {
        name: "FormsTemplates",
        path: "forms/forms-templates.tsx",
        desc: "Forms tab of the Templates page.",
        composedOf: [
          { name: "Card" }, { name: "EmptyState" }, { name: "KebabMenu" }, { name: "Spinner" },
          { name: "Button" }, { name: "Badge" }, { name: "SendFormModal", feature: true },
        ],
      },
      {
        name: "IntakeWizard",
        path: "forms/intake-wizard.tsx",
        desc: "Portal intake wizard — Stepper-driven fill.",
        composedOf: [
          { name: "Stepper" }, { name: "Field" }, { name: "Select" }, { name: "Checkbox" },
          { name: "Radio" }, { name: "ChoiceChip" }, { name: "Textarea" }, { name: "TextLink" },
          { name: "Button" }, { name: "Badge" },
        ],
      },
      {
        name: "SendFormModal",
        path: "forms/send-form-modal.tsx",
        desc: "'Send to client' modal.",
        composedOf: [{ name: "Modal" }, { name: "Select" }, { name: "Button" }],
      },
    ],
  },
  {
    area: "Messaging",
    items: [
      {
        name: "InboxShell",
        path: "messaging/inbox-shell.tsx",
        desc: "Practitioner inbox — split view: thread-list pane + open thread.",
        composedOf: [
          { name: "Tabs" }, { name: "SearchInput" }, { name: "EmptyState" },
          { name: "Modal" }, { name: "Field" }, { name: "Textarea" },
          { name: "Select" }, { name: "Avatar" }, { name: "Button" }, { name: "Badge" },
        ],
      },
      {
        name: "ThreadView",
        path: "messaging/thread-view.tsx",
        desc: "Shared secure-messaging thread pane.",
        composedOf: [{ name: "Avatar" }, { name: "Badge" }, { name: "Button" }],
      },
    ],
  },
  {
    area: "Notes & AI scribe",
    items: [
      { name: "NotesEditor", path: "notes-editor.tsx", desc: "Clinical-notes ProseMirror WYSIWYG engine." },
      {
        name: "ClientNotes",
        path: "notes/client-notes.tsx",
        desc: "Client Documentation tab.",
        composedOf: [
          { name: "EmptyState" }, { name: "KebabMenu" }, { name: "DropdownMenu" }, { name: "Tag" },
          { name: "Spinner" }, { name: "Button" }, { name: "Badge" },
          { name: "NoteSheet", feature: true },
        ],
      },
      {
        name: "NoteSheet",
        path: "notes/note-sheet.tsx",
        desc: "Full-screen slide-up document surface.",
        composedOf: [
          { name: "Tabs" }, { name: "Card" }, { name: "AccordionSection" }, { name: "Modal" },
          { name: "KebabMenu" }, { name: "IconButton" }, { name: "Avatar" }, { name: "Spinner" },
          { name: "TextLink" }, { name: "Button" }, { name: "Badge" },
          { name: "NotesEditor", feature: true }, { name: "AskAiPanel", feature: true },
          { name: "AiBits", feature: true },
        ],
      },
      {
        name: "ScribePanel",
        path: "notes/scribe-panel.tsx",
        desc: "Docked AI Scribe panel on the call screen.",
        composedOf: [
          { name: "Tabs" }, { name: "Banner" }, { name: "Select" }, { name: "Field" },
          { name: "Textarea" }, { name: "ChoiceChip" }, { name: "IconButton" }, { name: "Spinner" },
          { name: "Divider" }, { name: "Button" }, { name: "Badge" },
          { name: "AiBits", feature: true }, { name: "NoteSheet", feature: true },
        ],
      },
      {
        name: "AskAiPanel",
        path: "notes/ask-ai-panel.tsx",
        desc: "Ask-AI chat panel in a SidePanel.",
        composedOf: [
          { name: "SidePanel" }, { name: "IconButton" }, { name: "TextLink" }, { name: "Badge" },
        ],
      },
      { name: "AiBits", path: "notes/ai-bits.tsx", desc: "TrendList · TranscriptPanel · ChapterList." },
    ],
  },
  {
    area: "Shell",
    items: [
      {
        name: "AppShell",
        path: "shell/app-shell.tsx",
        desc: "Sidebar + main column (TopBar + canvas).",
        composedOf: [{ name: "Sidebar", feature: true }, { name: "TopBar", feature: true }],
      },
      {
        name: "Sidebar",
        path: "shell/sidebar.tsx",
        desc: "Navy nav column + bottom-left account menu.",
        composedOf: [
          { name: "UserChip" }, { name: "DropdownMenu" }, { name: "Avatar" }, { name: "Logo" },
          { name: "Badge" },
        ],
      },
      {
        name: "TopBar",
        path: "shell/topbar.tsx",
        desc: "White top strip — title + bell + avatar menu.",
        composedOf: [
          { name: "UserChip" }, { name: "DropdownMenu" }, { name: "IconButton" }, { name: "Avatar" },
        ],
      },
      { name: "NavPanel", path: "shell/nav-panel.tsx", desc: "Settings secondary nav panel." },
    ],
  },
];

// ── Click-to-copy payloads ────────────────────────────────────────────────────
// Copying a card yields the EXACT import line (file path + named exports), so a
// pasted line tells any future session precisely what to reuse — no drift.

const KIT_IMPORTS: Record<string, string> = {
  Button: 'import { Button } from "@/components/ui/button";',
  IconButton: 'import { IconButton } from "@/components/ui/icon-button";',
  TextLink: 'import { TextLink } from "@/components/ui/text-link";',
  Field: 'import { Field } from "@/components/ui/field";',
  Textarea: 'import { Textarea } from "@/components/ui/textarea";',
  Select: 'import { Select } from "@/components/ui/select";',
  SearchInput: 'import { SearchInput } from "@/components/ui/search-input";',
  Checkbox: 'import { Checkbox } from "@/components/ui/checkbox";',
  Radio: 'import { Radio } from "@/components/ui/radio";',
  Toggle: 'import { Toggle } from "@/components/ui/toggle";',
  SegmentedControl: 'import { SegmentedControl } from "@/components/ui/segmented-control";',
  ChoiceChip: 'import { ChoiceChip } from "@/components/ui/choice-chip";',
  ColorSwatch: 'import { ColorSwatch, EVENT_COLORS } from "@/components/ui/color-swatch";',
  FilterChip: 'import { FilterChip } from "@/components/ui/filter-chip";',
  FilterMenu: 'import { FilterMenu } from "@/components/ui/filter-menu";',
  DatePicker: 'import { DatePicker } from "@/components/ui/date-picker";',
  FileUpload: 'import { FileUpload } from "@/components/ui/file-upload";',
  Avatar: 'import { Avatar, AvatarGroup } from "@/components/ui/avatar";',
  Badge: 'import { Badge, CountBadge, DotBadge } from "@/components/ui/badge";',
  Tag: 'import { Tag } from "@/components/ui/tag";',
  StatCard: 'import { StatCard } from "@/components/ui/stat-card";',
  ListRow: 'import { ListRow } from "@/components/ui/list-row";',
  Table: 'import { Table, Tr, Td } from "@/components/ui/table";',
  ProgressBar: 'import { ProgressBar } from "@/components/ui/progress-bar";',
  SquareMeter: 'import { SquareMeter } from "@/components/ui/square-meter";',
  Stepper: 'import { Stepper } from "@/components/ui/stepper";',
  "Spinner / Skeleton": 'import { Spinner, Skeleton } from "@/components/ui/spinner";',
  Tabs: 'import { Tabs } from "@/components/ui/tabs";',
  "Table · stacked": 'import { DataTable } from "@/components/ui/data-table"; // <DataTable stacked …> — or Table with toolbar= + tintedHeader',
  IndexHeader: 'import { IndexHeader } from "@/components/ui/index-header";',
  RelatedLink: 'import { RelatedLink } from "@/components/ui/text-link"; // the related-record treatment (TextLink variant="related")',
  Breadcrumb: 'import { Breadcrumb } from "@/components/ui/breadcrumb";',
  Pagination: 'import { Pagination } from "@/components/ui/pagination";',
  Toolbar: 'import { Toolbar } from "@/components/ui/toolbar";',
  KebabMenu: 'import { KebabMenu } from "@/components/ui/kebab-menu"; // items: MenuItem/MenuDivider from dropdown-menu',
  DropdownMenu: 'import { DropdownMenu, MenuItem, MenuDivider } from "@/components/ui/dropdown-menu";',
  UserChip: 'import { UserChip } from "@/components/ui/user-chip";',
  Modal: 'import { Modal } from "@/components/ui/modal";',
  SidePanel: 'import { SidePanel } from "@/components/ui/side-panel";',
  Toast: 'import { useToast } from "@/components/ui/toast"; // ToastProvider already mounted in app/layout.tsx',
  Tooltip: 'import { Tooltip } from "@/components/ui/tooltip";',
  Banner: 'import { Banner } from "@/components/ui/banner";',
  EmptyState: 'import { EmptyState } from "@/components/ui/empty-state";',
  AccordionSection: 'import { AccordionSection } from "@/components/ui/accordion-section";',
  Card: 'import { Card, SettingsCard } from "@/components/ui/card";',
  "BoardGrid / BoardCard":
    'import { BoardGrid } from "@/components/board/board-grid";\nimport { BoardCard } from "@/components/board/board-card";',
  LibraryCard: 'import { LibraryCard } from "@/components/ui/library-card";',
  Divider: 'import { Divider } from "@/components/ui/divider";',
  PageHeader: 'import { PageHeader } from "@/components/ui/page-header";',
  Logo: 'import { Logo } from "@/components/ui/logo";',
  "Icon set": 'import { Icon, IconSquare, type IconName } from "@/components/ui/icons";',
};

function featureImport(c: { name: string; path: string; desc: string }) {
  return `import { ${c.name} } from "@/components/${c.path.replace(/\.(t|j)sx?$/, "")}"; // ${c.desc}`;
}

// Where each feature component renders in the running app.
const LIVE_AT: Record<string, string> = {
  BillingShell: "/billing",
  ClientBilling: "/clients/[id]?tab=billing",
  ClientInvoices: "/clients/[id]?tab=billing",
  InvoicePane: "/billing/[id]",
  PortalInvoiceSheet: "/portal/invoices",
  InvoiceStatusBadge: "/billing",
  NewInvoicePanel: "/billing",
  PayerPanel: "/billing (Payers tab)",
  PrintActions: "/billing/[id]/print",
  RecordPaymentModal: "/billing/[id]",
  CallStage: "/calls/[room]",
  CallHeader: "/calls/[room]",
  CallControls: "/calls/[room]",
  VideoTile: "/calls/[room]",
  useWebRTC: "/calls/[room]",
  FormBuilder: "/library/forms/[id]",
  FormsTemplates: "/library (Forms tab)",
  IntakeWizard: "/portal/forms/[responseId]",
  SendFormModal: "/library (Forms tab)",
  InboxShell: "/inbox",
  ThreadView: "/inbox/[id] + /portal/messages/[id]",
  NotesEditor: "inside NoteSheet",
  ClientNotes: "/clients/[id]?tab=documentation",
  NoteSheet: "opens from ClientNotes + the scribe flow",
  ScribePanel: "/calls/[room] (docked panel)",
  AskAiPanel: "inside NoteSheet",
  AiBits: "inside NoteSheet + ScribePanel",
  AppShell: "every workspace/portal page",
  Sidebar: "inside AppShell",
  TopBar: "inside AppShell",
  NavPanel: "/settings",
};

type FeatureItem = { name: string; path: string; desc: string; composedOf?: Array<{ name: string; feature?: boolean }> };

// Multi-line paste block: import · file + live route · composition graph.
function featureCopy(c: FeatureItem) {
  const lines = [featureImport(c), `// file: components/${c.path}${LIVE_AT[c.name] ? ` · live at: ${LIVE_AT[c.name]}` : ""}`];
  if (c.composedOf?.length) {
    lines.push(`// composed of: ${c.composedOf.map((p) => (p.feature ? `${p.name} (feature)` : p.name)).join(", ")}`);
  }
  return lines.join("\n");
}

// ── Shared layout helpers ─────────────────────────────────────────────────────

function Swatch({ name, hex }: { name: string; hex: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy --color-${name}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`--color-${name}: ${hex}; /* utilities: bg-${name} · text-${name} · border-${name} */`);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      className="group/sw flex items-center gap-2.5 text-left"
    >
      <span
        className="relative h-9 w-9 shrink-0 rounded-field border border-border transition group-hover/sw:ring-2 group-hover/sw:ring-primary-weak"
        style={{ background: hex }}
      >
        {copied && (
          <span className="absolute inset-0 flex items-center justify-center rounded-field bg-surface/80">
            <Icon name="check" size={16} className="text-success" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-text">{name}</span>
        <span className="block font-mono text-[12px] uppercase text-text-muted">{hex}</span>
      </span>
    </button>
  );
}

function SwatchGroup({ title, colors }: { title: string; colors: Array<{ name: string; hex: string }> }) {
  return (
    <div>
      <p className="mb-2.5 text-[13px] font-semibold text-text-muted">{title}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {colors.map((c) => (
          <Swatch key={c.name} {...c} />
        ))}
      </div>
    </div>
  );
}

// One primitive's live demo. Hovering the card shows a teal border + a copy
// icon top-right; clicking anywhere in the header copies the exact import
// line (+ variant summary). The demo area below stays interactive.
function Spec({ name, desc, wide, children }: { name: string; desc: string; wide?: boolean; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const imp = KIT_IMPORTS[name];
  const payload = imp ? (imp.includes("//") ? imp : `${imp} // ${desc}`) : name;
  return (
    <div
      className={`group/spec overflow-hidden rounded-card border border-border bg-surface shadow-card transition-colors hover:border-primary ${wide ? "lg:col-span-2 lg:order-first" : ""}`}
    >
      <button
        type="button"
        title="Copy import line"
        aria-label={`Copy ${name} import line`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(payload);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          } catch {}
        }}
        className="flex w-full items-start justify-between gap-3 border-b border-border px-5 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block font-mono text-[15px] font-semibold text-text">{name}</span>
          <span className="block text-sm text-text-body">{desc}</span>
        </span>
        <Icon
          name={copied ? "check" : "copy"}
          size={16}
          className={`mt-0.5 shrink-0 transition-opacity ${
            copied ? "text-success opacity-100" : "text-text-muted opacity-0 group-hover/spec:opacity-100"
          }`}
        />
      </button>
      <div className="flex flex-wrap items-center gap-3 px-5 py-5">{children}</div>
    </div>
  );
}

// One feature component's registry card. Same affordance as Spec: teal border
// + top-right copy icon on hover; the WHOLE card is the click target (these
// cards have no interactive demos). Copies the featureCopy() paste block.
function FeatureCard({ c }: { c: FeatureItem }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy import + file + composition"
      aria-label={`Copy ${c.name} reference`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(featureCopy(c));
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      className="group/feat h-full rounded-card border border-border bg-surface p-4 text-left shadow-card transition-colors hover:border-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[15px] font-semibold text-text">{c.name}</p>
        <Icon
          name={copied ? "check" : "copy"}
          size={16}
          className={`mt-0.5 shrink-0 transition-opacity ${
            copied ? "text-success opacity-100" : "text-text-muted opacity-0 group-hover/feat:opacity-100"
          }`}
        />
      </div>
      <p className="mt-1 text-sm text-text-body">{c.desc}</p>
      <p className="mt-2 font-mono text-[12px] text-text-muted">
        components/{c.path}
        {LIVE_AT[c.name] && <span className="text-text-muted/70"> · live at {LIVE_AT[c.name]}</span>}
      </p>
      {c.composedOf && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[12px] font-semibold text-text-muted">Composed of →</p>
          <div className="flex flex-wrap gap-1.5">
            {c.composedOf.map((p) => (
              <Tag key={p.name} hue={p.feature ? "grey" : "teal"}>
                {p.name}
                {p.feature && <span className="ml-1 text-[11px] opacity-70">feature</span>}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </button>
  );
}

// Section header with a full-width rule beneath it — spans the section, i.e.
// the left edge of the first card to the right edge of the last.
function SectionHead({ title }: { title: string }) {
  return (
    <div className="border-b border-border pb-2.5">
      <h2 className="text-[19px] font-semibold text-text">{title}</h2>
    </div>
  );
}

const ASSET_BLOB = "https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com";
const ASSET_GROUPS: Array<{ label: string; tile: "light" | "navy"; items: string[] }> = [
  {
    label: "Watercolour illustrations",
    tile: "light",
    items: [
      "illustrations/leuk_e0mhvxe0mhvxe0mh-mint.avif",
      "illustrations/leuk_e0mhvxe0mhvxe0mh.avif",
      "illustrations/leuk_4ji9244ji9244ji9.avif",
      "illustrations/leuk_5ziunj5ziunj5ziu.avif",
      "illustrations/leuk_7h6ra17h6ra17h6r.avif",
      "illustrations/leuk_99yp1z99yp1z99yp.avif",
      "illustrations/leuk_a2t92la2t92la2t9.avif",
      "illustrations/leuk_n1y3w0n1y3w0n1y3.avif",
      "illustrations/leuk_nielb8nielb8niel.avif",
      "illustrations/leuk_w5kx7ww5kx7ww5kx.avif",
      "illustrations/leuk_xj1aw5xj1aw5xj1a.avif",
      "illustrations/leuk-3.avif",
      "illustrations/leuk-8.avif",
      "illustrations/leuk-9.avif",
      "illustrations/leuk-13.avif",
      "illustrations/leuk-landscape_b69909b69909b699.avif",
      "illustrations/leuk-landscape_rhjb16rhjb16rhjb.avif",
      "illustrations/leuk-landscape_w68hevw68hevw68h.avif",
      // Five paths below keep the pre-rename object name. A blob pathname is a
      // storage key, not a brand: renaming it in source only 404s the image,
      // because the object itself is still called `Liminal-…`. Re-uploading
      // needs a Vercel Blob write, which is unavailable while the account is
      // fair-use blocked. Rename the objects, then these five strings.
      "illustrations/Liminal-life_law6m9law6m9law6.avif",
    ],
  },
  {
    label: "New illustrations (latest batch)",
    tile: "light",
    items: [
      "illustrations/Gemini_Generated_Image_aq9ajaaq9ajaaq9a.avif",
      "illustrations/Gemini_Generated_Image_au7vf1au7vf1au7v.avif",
      "illustrations/Gemini_Generated_Image_ev0snqev0snqev0s.avif",
      "illustrations/Gemini_Generated_Image_gandqagandqagand.avif",
      "illustrations/Gemini_Generated_Image_m17ugum17ugum17u.avif",
      "illustrations/Gemini_Generated_Image_q35ecjq35ecjq35e.avif",
      "illustrations/Liminal-dusk-landscape-5-July-07-2026-12_33AM.avif",
      "illustrations/dusk-7.avif",
      "illustrations/leuk-dusk-landscape_4ijehh4ijehh4ije.avif",
      "illustrations/leuk-dusk-landscape_vu9yc6vu9yc6vu9y.avif",
      "illustrations/maya-1.avif",
      "illustrations/maya-2.avif",
      "illustrations/maya-4.avif",
      "illustrations/maya6.avif",
    ],
  },
  { label: "Brand logo", tile: "light", items: ["logos/brand/liminal-beige.avif", "logos/brand/liminal-dark.png"] },
  { label: "Brand logo — reversed", tile: "navy", items: ["logos/brand/liminal-light.png"] },
  {
    label: "Insurance — colour",
    tile: "light",
    items: ["aetna", "anthem", "bcbs", "carelon", "cigna", "horizon", "optum-oscar", "optum-unitedhealth", "united"].map((s) => `logos/insurance/${s}.avif`),
  },
  {
    label: "Insurance — white",
    tile: "navy",
    items: ["aetna", "anthem", "bcbs", "carelon", "cigna", "horizon", "optum-oscar", "optum-unitedhealth", "united"].map((s) => `logos/insurance-white/${s}.avif`),
  },
  { label: "Product screenshots", tile: "light", items: ["marketing/product-calendar.avif", "marketing/product-booking.avif", "marketing/product-billing.avif"] },
];

function AssetGrid({ label, items, tile }: { label: string; items: string[]; tile: "light" | "navy" }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-text-muted">
        {label} <span className="text-text-muted/60">· {items.length}</span>
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => (
          <div
            key={p}
            className={`flex min-h-[92px] items-center justify-center overflow-hidden rounded-card border border-border p-2 ${tile === "navy" ? "bg-sidebar-bg" : "bg-canvas"}`}
          >
            <img src={`${ASSET_BLOB}/${p}`} alt={p.split("/").pop() ?? p} className="max-h-32 w-full object-contain" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Group({ title, cols = 2, children }: { title: string; cols?: 2 | 3; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <SectionHead title={title} />
      <div className={`grid gap-4 ${cols === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>{children}</div>
    </section>
  );
}

const DEMO_ICONS: IconName[] = [
  "calendar", "inbox", "users", "dollar", "clipboard", "gear", "bell", "message",
  "video", "phone", "file-text", "credit-card", "search", "plus", "check", "x",
  "edit", "trash", "download", "upload", "lock", "globe", "sparkle", "paint-roller",
];

// ── Page ─────────────────────────────────────────────────────────────────────

const DESIGN_RULES = `Leuk design system — start here (read before you build)

REUSE FIRST. ~45 UI primitives in components/ui/* and ~30 feature components. Compose what exists; if no primitive fits, compose several. Adding a genuinely new primitive requires saying so explicitly in your report. Never duplicate a feature component.

COLOR TOKENS (CSS vars in app/globals.css — never invent colors):
• Brand: primary #3F8290 (teal) · primary-hover #35707C · primary-deep #2C5C66 (deep teal for large accent type) · primary-weak #B7D8DD (chip/fill pastel) · primary-wash #DCECEC (pale-teal field — the hero/section wash) · accent #F0AE55 (amber) · accent-ink #C58A2E (amber on white, AA).
• Chrome: sidebar-bg #1C2440 (navy) · canvas #F2F3F6 · surface #FFFFFF · border #E6E7EB.
• Text: text #212A47 (navy ink) · text-body #4B5563 · text-muted #9CA3AF.
• Status: success / warning / danger / info (+ blue tint for Scheduled). Use the *-tint bg with the same-hue text.

TYPOGRAPHY: Inter for all UI/body. Bricolage Grotesque (font-display) for MARKETING display headings only — never in the app UI.

LAYOUT: One H1 per app page, and it lives in the TopBar (route-derived via ROUTE_TITLES in components/shell/topbar.tsx). Pages never render their own page-level H1. Exceptions: entity detail headers and full-screen/marketing surfaces (which own their H1).

THE INDEX PAGE STANDARD (every object list wears this — do not re-invent it):
• Top half = IndexHeader (components/ui/index-header.tsx): the TopBar's actions (New <entity> + bell) and the tab row, one thin piece. Its TopBar half portals into the real TopBar, so it renders wherever it sits in the page. The tab row carries the only in-content list heading.
• Bottom half = DataTable (components/ui/data-table.tsx): it already owns the toolbar, the column picker, the table and the scroll. Toolbar anatomy is fixed — search LEFT (toolbarLeft), then the right group: Filter · Columns · Export · Refresh. Pass filter= for the Filter slot, storageKey= for Columns, onExport=, onRefresh=. Omit a button only where it is genuinely meaningless (e.g. /catalog has no facet to filter by), and say so.
• The list itself is an OBJECT TABLE (components/tables/*): self-contained — its own columns, toolbar, filters, detail panel and data wiring, plus a scope prop and an onRowOpen callback — so the same table serves its own route AND an embedded rail (see /clients).
• No page-level horizontal scroll: the Table owns the scroll, so give every flex ancestor min-w-0 (the recurring overflow bug is in the ancestor chain, never the table).
• No dead rows: every row does something on click — a detail panel, a drill-down, or a record page. Kebab-only is the fallback when nothing exists to open.
• TWO TABLE LAYOUTS, and only two. index (default) = search LEFT in the toolbar, actions right, all above the chrome — for object lists. stacked (DataTable stacked=, or Table toolbar= + tintedHeader=) = the whole toolbar lives INSIDE the table card as its header. Analytical variant: search + the facets/columns/export cluster share that header (see /rates Services + Panels). Operational variant (TABLE STANDARD v2, see /workspace Operations): the header carries a TITLE BLOCK far-left — a status dot + the table's name + a status pill — and the search moves RIGHT beside the utilities kebab; a source + freshness footer stamps the bottom. Same slots either way: a page changes layout, not wiring. The column band is white/grey, never teal — teal means focus/active here, and a permanent teal header spends that signal on chrome.
• TABLE STANDARD v2 — the definition of done for every NEW table. It NAMES ITSELF and states its own health (DataTable title / status / titleMeta — no separate status card floating above it), search on the RIGHT immediately before the kebab, a select column left + a per-row action column right (pin/favourite, copy id/row, open-in-source, CSV export in the kebab), sortable TYPE-AWARE headers on EVERY column, ≥10 rows visible then scroll, and an honest source + freshness footer (DataTable source / updatedAt — the matview/table/API it reads, and when the data last moved; no pipeline vocabulary). Under the hood it ships the LIGHTNING STACK by default: server-side pagination, lazy loading, debounced indexed search (trigram where text), snapshot/matview backing for anything over ~10k rows, parallel page+count queries, min-w-0 overflow discipline. Fast and standardized IS the bar — a table missing any of this is a defect, not a preference.
• RELATED RECORDS: when a value on a row IS a record in another table, wrap it in RelatedLink (components/ui/text-link.tsx) — a faint dotted teal underline, teal on hover. It means one thing only: "this value lives in another table; click to go there", as distinct from the row's own identity link (solid teal, wipe on hover) and the row's own drill-down. It stops propagation, because the row click means "open this row" and this means "open the OTHER record". Use it sparingly — if every value on a row is dotted, none of them read as a crossing.

INTERACTION / HOVER SYSTEM:
• Teal = focus/active only.
• White-bg menus (dropdown rows, account/portal menus) hover to a muted-teal bg (primary-wash).
• Grey-column rails (the Find-care + Search dropdown rails) mark the selected item with white bg + shadow-sm, not teal.
• Icons use the TWO-TONE treatment on hover/selected: navy line (text-text) + primary-wash fill (fill-primary-wash). For the lock icon only the box fills, not the shackle.
• Text links use the link-wipe underline (underline fills in on hover); no trailing → unless intentional.
• Dropdowns/Select menus portal to <body> (fixed) so overflow-hidden ancestors can't clip them.

DATA: everything through lib/repos/* (dual-mode: hasDb ? sql : mock). Repos return dates as ISO strings (isoDateTime/isoDateOnly), never driver Date objects.

VERIFY: npx tsc --noEmit clean, and exercise the change in headless Chrome (playwright-core, channel:"chrome") before claiming done.`;

// The board primitive, live. Everything the pack does is on this demo: hold the
// card (or its ⠿) and drag it onto another to reorder, drag the bottom-right
// grip out/in to step the size, click the × to drop a card.
const BOARD_DEMO: Record<string, { value: string; sub: string }> = {
  sessions: { value: "128", sub: "this week · +12%" },
  revenue: { value: "$18.4k", sub: "collected · 30 days" },
  noshows: { value: "4.1%", sub: "of booked · 30 days" },
};
const BOARD_IDS = Object.keys(BOARD_DEMO);
const BOARD_LABEL: Record<string, string> = { sessions: "Sessions", revenue: "Revenue", noshows: "No-show rate" };

function BoardDemo() {
  const [ids, setIds] = useState(BOARD_IDS);

  return (
    <div className="w-full">
      <BoardGrid
        items={ids.map((id) => ({ id, w: 4, h: 7, minW: 2, minH: 5 }))}
        renderCard={(id) => (
          <BoardCard
            label={BOARD_LABEL[id]}
            title={BOARD_LABEL[id]}
            onRemove={() => setIds((cur) => cur.filter((k) => k !== id))}
            menu={
              <KebabMenu label={`${BOARD_LABEL[id]} actions`} align="right">
                <MenuItem icon="info" label="About this data" onClick={() => {}} />
              </KebabMenu>
            }
            footer={<span className="font-mono text-[11px] text-text-muted">appointments</span>}
          >
            <div className="flex min-h-0 flex-1 flex-col justify-center">
              <span className="text-[26px] font-semibold leading-none text-text">{BOARD_DEMO[id].value}</span>
              <span className="mt-1.5 text-[13px] text-text-muted">{BOARD_DEMO[id].sub}</span>
            </div>
          </BoardCard>
        )}
      />
      {ids.length < BOARD_IDS.length && (
        <Button size="sm" variant="ghost" leftIcon="refresh-cw" className="mt-3" onClick={() => setIds(BOARD_IDS)}>
          Put them back
        </Button>
      )}
    </div>
  );
}

function DesignRules() {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(DESIGN_RULES);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-w-0 items-center gap-2 text-left">
          <Icon name={open ? "chevron-down" : "chevron-right"} size={16} className="shrink-0 text-text-muted" />
          <span className="text-[15px] font-semibold text-text">Start here — design system rules for every session</span>
        </button>
        <button
          type="button"
          onClick={copy}
          title="Copy rules"
          aria-label="Copy design rules"
          className="shrink-0 text-text-muted transition-colors hover:text-text"
        >
          <Icon name={copied ? "check" : "copy"} size={16} className={copied ? "text-success" : ""} />
        </button>
      </div>
      {open && (
        <pre className="whitespace-pre-wrap px-5 py-4 font-sans text-sm leading-relaxed text-text-body">
          {DESIGN_RULES}
        </pre>
      )}
    </div>
  );
}

export default function DesignSystemPage() {
  const [tab, setTab] = useState("primitives");

  // Interactive-primitive state
  const [cadence, setCadence] = useState("Biweekly");
  const [color, setColor] = useState<string>(EVENT_COLORS[0]);
  const [reminders, setReminders] = useState(true);
  const [view, setView] = useState("month");
  const [innerTab, setInnerTab] = useState("overview");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [timezone, setTimezone] = useState("");
  const [practitioner, setPractitioner] = useState("");
  const [date, setDate] = useState("2026-07-15");
  const [file, setFile] = useState<{ name: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [dsFilter, setDsFilter] = useState<Record<string, string | undefined>>({});
  const [page, setPage] = useState(2);
  const [modalOpen, setModalOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [specPanelOpen, setSpecPanelOpen] = useState(false);
  const toast = useToast();

  const featureTotal = FEATURES.reduce((n, g) => n + g.items.length, 0);

  return (
    <div>
      <Tabs
        className="mb-6"
        active={tab}
        onChange={setTab}
        items={[
          { key: "primitives", label: "Primitives", count: 45 },
          { key: "foundations", label: "Foundations" },
          { key: "assets", label: "Assets" },
          { key: "components", label: "Components", count: featureTotal },
          { key: "sections", label: "Sections" },
        ]}
      />

      {/* ── SECTIONS (reusable marketing bands) ─────────────────────── */}
      {tab === "sections" && (
        <div className="space-y-10">
          <p className="text-[13px] text-text-muted">
            Reusable full-width marketing sections. Drop them onto public pages; content is prop-overridable.
          </p>

          <section className="space-y-3">
            <SectionHead title="Provider CTA band" />
            <p className="text-[13px] text-text-muted">
              <code className="rounded bg-canvas px-1 py-0.5">
                {'import { ProviderCta } from "@/components/marketing/provider-cta";'}
              </code>
            </p>
            <div className="overflow-hidden rounded-card border border-border bg-page py-10">
              <ProviderCta />
            </div>
          </section>

          <section className="space-y-3">
            <SectionHead title="Find-a-therapist search CTA" />
            <p className="text-[13px] text-text-muted">
              <code className="rounded bg-canvas px-1 py-0.5">
                {'import { TherapistSearchCta } from "@/components/marketing/therapist-search-cta";'}
              </code>
            </p>
            <div className="overflow-hidden rounded-card border border-border bg-page py-10">
              <TherapistSearchCta />
            </div>
          </section>
        </div>
      )}

      {/* ── FOUNDATIONS ─────────────────────────────────────────────── */}
      {tab === "foundations" && (
        <div className="space-y-8">
          <DesignRules />

          <section className="space-y-4">
            <SectionHead title="Color Schema" />
            <Card className="space-y-6">
              <SwatchGroup title="Brand" colors={BRAND} />
              <SwatchGroup title="Chrome" colors={CHROME} />
              <SwatchGroup title="Text tones" colors={TEXT} />
              <SwatchGroup title="Semantic status" colors={STATUS} />
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHead title="Typography" />
            <Card>
              <p className="mb-4 text-[13px] font-semibold text-text-muted">
                Inter (UI / body) · Bricolage Grotesque (marketing display, <code className="rounded bg-canvas px-1 py-0.5">font-display</code>)
              </p>
              <div className="space-y-2.5">
                <p className="font-display text-[30px] font-extrabold tracking-tight text-text">Display · Bricolage</p>
                <p className="text-[28px] font-bold text-text">Heading · Inter 28 / 700</p>
                <p className="text-[19px] font-semibold text-text">Heading · 19 / 600</p>
                <p className="text-[15px] text-text-body">Body · 15 / 400 — the workspace default</p>
                <p className="text-[13px] text-text-muted">Small · 13 — muted metadata</p>
              </div>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHead title="Radius and Elevation" />
            <Card>
              <div className="flex flex-wrap items-end gap-5">
                {[
                  { cls: "rounded-field border border-border bg-canvas", label: "field · 8px" },
                  { cls: "rounded-card border border-border bg-canvas", label: "card · 12px" },
                  { cls: "rounded-card bg-surface shadow-card", label: "shadow-card" },
                  { cls: "rounded-card bg-surface shadow-menu", label: "shadow-menu" },
                ].map((t) => (
                  <div key={t.label} className="text-center">
                    <span className={`block h-14 w-14 ${t.cls}`} />
                    <span className="mt-2 block text-[12px] text-text-muted">{t.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHead title="Images" />
            <Card className="space-y-5">
              {/* live examples of the two identity marks */}
              <div className="flex flex-wrap items-center gap-8">
                <div className="flex items-center gap-2.5">
                  <Avatar name="Ava Delgado" hue="teal" size="md" />
                  <Avatar name="Maya Patel" hue="amber" size="md" />
                  <Avatar name="Noah Kim" hue="pink" size="md" />
                  <AvatarGroup
                    people={[
                      { name: "Ava Delgado", hue: "teal" },
                      { name: "Maya Patel", hue: "amber" },
                      { name: "Noah Kim", hue: "pink" },
                      { name: "Eli Rosen", hue: "blue" },
                      { name: "Grace Tanaka" },
                    ]}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Logo variant="onLight" />
                  <span className="rounded-card px-3 py-2" style={{ backgroundColor: "#1C2440" }}>
                    <Logo variant="onNavy" />
                  </span>
                </div>
              </div>

              {/* Stock / placeholder photo — follows the image conventions below:
                  card-framed, native <img>, intrinsic dims, alt, lazy. */}
              <div>
                <p className="mb-2 text-[13px] font-semibold text-text-muted">Stock / placeholder photo</p>
                <div className="w-40 overflow-hidden rounded-card border border-border shadow-card">
                  <img
                    src="https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/illustrations/leuk_w5kx7ww5kx7ww5kx.avif"
                    alt="Leuk watercolour illustration — a still life of a lamp, book, and reading glasses on a side table."
                    width={1407}
                    height={768}
                    className="block w-full"
                    loading="lazy"
                  />
                </div>
              </div>

              <ul className="space-y-2 text-[15px] text-text-body">
                <li>
                  <b className="text-text">Avatars are initials, never photos</b> — a stable per-user hue circle
                  (teal / amber / pink / blue); no image upload, no PHI in the identity mark. Sizes sm 28 · md 36 · lg 96;
                  <code className="rounded bg-canvas px-1 py-0.5">AvatarGroup</code> overlaps with a “+n” overflow.
                </li>
                <li>
                  <b className="text-text">The logo is inline SVG</b> (amber rising-arch + lowercase wordmark) so it stays
                  crisp at any size. Variants <code className="rounded bg-canvas px-1 py-0.5">onLight</code> /
                  <code className="rounded bg-canvas px-1 py-0.5">onNavy</code>; a raster{" "}
                  <code className="rounded bg-canvas px-1 py-0.5">logo.webp</code> exists for social/OG only.
                </li>
                <li>
                  <b className="text-text">Product imagery</b> lives in{" "}
                  <code className="rounded bg-canvas px-1 py-0.5">/public/marketing/*.png</code> at 2× (2880px wide).
                  Rendered with a native <code className="rounded bg-canvas px-1 py-0.5">&lt;img&gt;</code>,{" "}
                  <code className="rounded bg-canvas px-1 py-0.5">block w-full</code>, explicit width/height (no layout
                  shift), specific alt text, and <code className="rounded bg-canvas px-1 py-0.5">loading</code> eager
                  (hero) / lazy (below the fold). The image itself is never rounded — its <code className="rounded bg-canvas px-1 py-0.5">rounded-card</code> frame is.
                </li>
                <li>
                  <b className="text-text">Payer logos</b> ship as transparent{" "}
                  <code className="rounded bg-canvas px-1 py-0.5">.webp</code> in <code className="rounded bg-canvas px-1 py-0.5">/public</code>{" "}
                  (Aetna, BCBS, Cigna, Optum, Anthem, Carelon, Horizon).
                </li>
                <li>
                  <b className="text-text">Watercolour illustrations</b> are AVIF in the public blob store
                  (<code className="rounded bg-canvas px-1 py-0.5">illustrations/*.avif</code>), card-framed like all
                  imagery.
                </li>
                <li>
                  <b className="text-text">Formats:</b> vector marks → inline SVG · screenshots → PNG @2× · logos → WebP.
                  No <code className="rounded bg-canvas px-1 py-0.5">next/image</code> — plain{" "}
                  <code className="rounded bg-canvas px-1 py-0.5">&lt;img&gt;</code> with intrinsic dimensions.
                </li>
                <li className="text-warning">
                  <b>Gap:</b> no favicon or OpenGraph image is configured in app metadata yet.
                </li>
              </ul>
            </Card>
          </section>
        </div>
      )}

      {/* ── ASSETS ──────────────────────────────────────────────────── */}
      {tab === "assets" && (
        <div className="space-y-8">
          <section className="space-y-4">
            <SectionHead title="Watercolour illustrations" />
            <Card className="space-y-5">
              <p className="text-[15px] text-text-body">
                Hero and section art is a single set of watercolour line-and-wash illustrations, stored as AVIF in the
                public blob store (<code className="rounded bg-canvas px-1 py-0.5">illustrations/*.avif</code>). They are
                painted on parchment, so to sit seamlessly on a coloured field we{" "}
                <b className="text-text">white-balance the paper to match the background</b> (multiply each channel by
                background ÷ paper). No blend mode, no card.
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { u: "illustrations/leuk_e0mhvxe0mhvxe0mh-mint.avif", a: "Bench by a lake" },
                  { u: "illustrations/leuk_nielb8nielb8niel.avif", a: "Cooking by a window" },
                  { u: "illustrations/leuk_n1y3w0n1y3w0n1y3.avif", a: "Man on a porch" },
                  { u: "illustrations/leuk_w5kx7ww5kx7ww5kx.avif", a: "Still life" },
                ].map((i) => (
                  <div key={i.u} className="overflow-hidden rounded-card" style={{ backgroundColor: "#dcecec" }}>
                    <img
                      src={`https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/${i.u}`}
                      alt={i.a}
                      className="block w-full"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
              <p className="text-[13px] text-text-muted">
                The recolour only works on <b className="text-text">light</b> surfaces (white · grey ·{" "}
                <span className="rounded px-1" style={{ backgroundColor: "#dcecec" }}>mint</span> ·{" "}
                <span className="rounded px-1" style={{ backgroundColor: "#fbeed9" }}>amber-100</span>). On navy or
                saturated amber the multiply crushes the scene — those surfaces need transparent-background art.
              </p>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHead title="Left-edge scrim (reusable)" />
            <Card className="space-y-5">
              <p className="text-[15px] text-text-body">
                When a hero headline sits over busy art, guarantee contrast with a{" "}
                <b className="text-text">background-to-transparent gradient</b> over the copy side — not a blanket dark
                overlay. It reads as depth, not a filter. Below: the same illustration without and with the scrim.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {[false, true].map((withScrim) => (
                  <div key={String(withScrim)}>
                    <p className="mb-2 text-[13px] font-semibold text-text-muted">{withScrim ? "With scrim" : "Raw"}</p>
                    <div
                      className="relative flex h-44 items-center overflow-hidden rounded-card"
                      style={{ backgroundColor: "#dcecec" }}
                    >
                      <img
                        src="https://c1vijjkvyt1skkfe.public.blob.vercel-storage.com/illustrations/leuk_xj1aw5xj1aw5xj1a.avif"
                        alt="Three friends at a table"
                        className="absolute right-0 top-1/2 w-3/4 -translate-y-1/2"
                        loading="lazy"
                      />
                      {withScrim && (
                        <div
                          className="absolute inset-y-0 left-0 w-2/3"
                          style={{ background: "linear-gradient(to right, #dcecec 30%, transparent)" }}
                        />
                      )}
                      <div className="relative max-w-[55%] pl-5">
                        <p className="font-display text-xl font-extrabold leading-tight text-text">Healing belongs to everyone.</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <pre className="overflow-x-auto rounded-field bg-canvas p-3 text-[12px] leading-relaxed text-text-body">{`<div class="relative">
  <img class="absolute right-0 …" src="…" />
  {/* scrim: section-bg → transparent over the copy side */}
  <div class="absolute inset-y-0 left-0 w-2/3"
       style="background: linear-gradient(to right, var(--section-bg) 30%, transparent)" />
  <h1 class="relative …">Healing belongs to everyone.</h1>
</div>`}</pre>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHead title="Insurance logos" />
            <Card className="space-y-5">
              <p className="text-[15px] text-text-body">
                Payer marks are stored as colour AVIF/SVG in{" "}
                <code className="rounded bg-canvas px-1 py-0.5">logos/insurance/*</code>, for light fields. Tightly-cropped
                marks (Humana, Healthfirst) get a per-logo height so every row reads evenly. The live band
                (<code className="rounded bg-canvas px-1 py-0.5">InsurerStrip</code>):
              </p>
              <div className="-mx-5 -mb-5 overflow-hidden rounded-b-card">
                <InsurerStrip ground="page" />
              </div>
            </Card>
          </section>

          <section className="space-y-4">
            <SectionHead title="All assets — quick index" />
            <Card className="space-y-6">
              <p className="text-[13px] text-text-muted">
                Everything currently in the public blob store this session. White/reversed marks are shown on navy tiles.
              </p>
              {ASSET_GROUPS.map((g) => (
                <AssetGrid key={g.label} label={g.label} items={g.items} tile={g.tile} />
              ))}
            </Card>
          </section>
        </div>
      )}

      {/* ── PRIMITIVES ──────────────────────────────────────────────── */}
      {tab === "primitives" && (
        <div className="space-y-10">
          <Group title="Actions" cols={3}>
            <Spec name="Button" desc="primary · secondary · ghost · danger; sizes sm–xl.">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="primary" leftIcon="plus">New</Button>
              <Button variant="primary" loading>Saving</Button>
            </Spec>
            <Spec name="IconButton" desc="default · filled · circular · danger — click one to copy its JSX.">
              {(
                [
                  ["edit", "Edit", undefined],
                  ["plus", "Add", "filled"],
                  ["x", "Close", "circular"],
                  ["trash", "Delete", "danger"],
                ] as const
              ).map(([icon, label, variant]) => {
                const jsx = `<IconButton icon="${icon}" label="${label}"${variant ? ` variant="${variant}"` : ""} />`;
                return (
                  <Tooltip key={icon} label={jsx}>
                    <IconButton
                      icon={icon}
                      label={label}
                      variant={variant}
                      onClick={async () => {
                        await navigator.clipboard.writeText(jsx);
                        toast(`Copied ${jsx}`, "success");
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Spec>
            <Spec name="TextLink" desc="Inline link. STANDARD (default): teal with an underline that wipes in on hover. Variants: name (the wipe at 500 for a row's subject), related (see RelatedLink). Optional leading icon.">
              <div className="flex flex-col items-start gap-2">
                <TextLink>View all clients</TextLink>
                <TextLink icon="download">Export</TextLink>
              </div>
            </Spec>
            <Spec
              name="RelatedLink"
              desc="A value that IS a record in another table — muted-teal dotted underline at rest; on hover the text goes teal and a solid teal underline wipes in over the dotted line."
              wide
            >
              <div className="w-full space-y-3">
                <div className="flex flex-wrap items-center gap-6">
                  <span className="text-[15px] text-text-body">
                    Billing ID <RelatedLink href="/orgs">13-3957095</RelatedLink>
                  </span>
                  <RelatedLink href="/orgs">
                    <Badge variant="success">Billing TIN</Badge>
                  </RelatedLink>
                  <span className="text-[13px] text-text-muted">← hover either one</span>
                </div>
                <p className="text-[13px] text-text-body">
                  One meaning only: <em>this value lives in another table; click to go there</em> — as distinct from the
                  row&rsquo;s own identity link (solid teal, wipe on hover) and the row&rsquo;s own drill-down. At rest
                  it&rsquo;s a muted-teal dotted underline; on hover the solid teal fills in over the dotted line via the
                  same underline-wipe motion the standard TextLink uses. It stops propagation, because the row click
                  means &ldquo;open this row&rdquo; and this means &ldquo;open the OTHER record&rdquo;. Live on
                  /published-rates (Billing ID → the org book) and /orgs/registry (the Billing TIN badge). Use it
                  sparingly: if every value on a row is dotted, none of them read as a crossing.
                </p>
              </div>
            </Spec>
          </Group>

          <Group title="Form inputs">
            <Spec name="Field" desc="Label + input + hint/error; affix slots.">
              <div className="grid w-full gap-4 sm:grid-cols-2">
                <Field label="Full name" name="name" placeholder="Jane Doe" />
                <Field label="Fee" name="fee" prefix="$" suffix="/ session" placeholder="120" />
                <Field label="Email" name="email" error="Enter a valid email" defaultValue="not-an-email" />
                <Field label="NPI" name="npi" hint="10-digit provider ID" placeholder="1234567890" />
              </div>
            </Spec>
            <Spec name="Textarea" desc="Multi-line Field.">
              <Textarea className="w-full" label="Session summary" name="summary" placeholder="Type a note…" />
            </Spec>
            <Spec name="Select" desc="Native · searchable · color-dot · avatar variants.">
              <div className="grid w-full gap-4 sm:grid-cols-2">
                <Select
                  label="Status — native"
                  placeholder="Any status"
                  value={status}
                  onValueChange={setStatus}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "lead", label: "Lead" },
                    { value: "discharged", label: "Discharged" },
                  ]}
                />
                <Select
                  label="Timezone — searchable"
                  searchable
                  placeholder="Pick a timezone…"
                  value={timezone}
                  onValueChange={setTimezone}
                  options={[
                    { value: "pt", label: "Pacific (PT)" },
                    { value: "mt", label: "Mountain (MT)" },
                    { value: "ct", label: "Central (CT)" },
                    { value: "et", label: "Eastern (ET)" },
                  ]}
                />
                <Select
                  label="Service — searchable + color dot"
                  searchable
                  placeholder="Pick a service…"
                  value={service}
                  onValueChange={setService}
                  options={[
                    { value: "intake", label: "Intake session", color: "#3F8290" },
                    { value: "therapy", label: "Therapy — 50 min", color: "#3BA55C" },
                    { value: "followup", label: "Follow-up", color: "#E0447C" },
                  ]}
                />
                <Select
                  label="Practitioner — searchable + avatar"
                  searchable
                  placeholder="All practitioners"
                  value={practitioner}
                  onValueChange={setPractitioner}
                  options={[
                    { value: "brendan", label: "Brendan Stanton", avatar: { name: "Brendan Stanton", hue: "teal" } },
                    { value: "priya", label: "Priya Raman", avatar: { name: "Priya Raman", hue: "pink" } },
                    { value: "amara", label: "Amara Okafor", avatar: { name: "Amara Okafor", hue: "amber" } },
                  ]}
                />
              </div>
            </Spec>
            <Spec name="DatePicker" desc="Mini month grid; today + selected states.">
              <DatePicker value={date} onChange={setDate} />
            </Spec>
            <Spec name="SearchInput" desc="Input with a leading search icon.">
              <SearchInput className="w-full" placeholder="Search clients…" />
            </Spec>
            <Spec name="Checkbox" desc="20px square; checked = primary fill.">
              <div className="space-y-2.5">
                <Checkbox label="Send appointment reminders" defaultChecked />
                <Checkbox label="Share notes with client" />
                <Checkbox label="Disabled" disabled />
              </div>
            </Spec>
            <Spec name="Radio" desc="Single-select ring; optional sub-label.">
              <div className="space-y-2.5">
                <Radio name="loc" label="In person" subLabel="Downtown office" defaultChecked />
                <Radio name="loc" label="Telehealth" subLabel="Secure video" />
              </div>
            </Spec>
            <Spec name="Toggle" desc="~40×22 switch; on = primary track.">
              <Toggle checked={reminders} onChange={setReminders} label="SMS reminders" subtitle="24h before" />
            </Spec>
            <Spec name="SegmentedControl" desc="Joined button group; active = primary.">
              <SegmentedControl
                value={view}
                onChange={setView}
                segments={[
                  { value: "day", label: "Day" },
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" },
                ]}
              />
            </Spec>
            <Spec name="ChoiceChip" desc="Single-select chip; selected = teal + ✓.">
              {["Weekly", "Biweekly", "Monthly"].map((c) => (
                <ChoiceChip key={c} label={c} selected={cadence === c} onSelect={() => setCadence(c)} />
              ))}
            </Spec>
            <Spec name="ColorSwatch" desc="Calendar-color chip; the Leuk palette.">
              {EVENT_COLORS.map((c) => (
                <ColorSwatch key={c} color={c} selected={color === c} onSelect={() => setColor(c)} />
              ))}
            </Spec>
            <Spec name="FilterChip" desc="Table filter pill — add vs. applied.">
              <FilterChip label="Status" value={statusFilter || undefined} onClick={() => setStatusFilter("Active")} onClear={() => setStatusFilter("")} />
              <FilterChip label="Assignee" onClick={() => {}} />
            </Spec>
            <Spec name="FilterMenu" desc="Two-level filter — the dimension first, its values behind it in a searchable submenu. One control for many facets; one active value per category.">
              <FilterMenu
                categories={[
                  { key: "insurer", label: "Insurer", options: [{ value: "cigna", label: "Cigna Health & Life" }, { value: "aetna", label: "Aetna" }, { value: "emblem", label: "EmblemHealth" }] },
                  { key: "plan", label: "Plan", options: [{ value: "njpcp", label: "chc-of-new-york-njpcp" }, { value: "gppo", label: "metro-new-york-gppo" }, { value: "oap", label: "national-oap" }] },
                  { key: "code", label: "Code", options: [{ value: "90791", label: "90791 · Diagnostic evaluation" }, { value: "90837", label: "90837 · Therapy, 60 min" }] },
                ]}
                selected={dsFilter}
                onSelect={(k, v) => setDsFilter((s) => ({ ...s, [k]: v }))}
              />
            </Spec>
            <Spec name="FileUpload" desc="Dropzone → uploaded tile.">
              <FileUpload
                className="w-full"
                constraints="PDF, PNG or JPG · max 10 MB"
                file={file}
                onFile={(f) => setFile({ name: f.name })}
                onRemove={() => setFile(null)}
              />
              {!file && (
                <Button variant="ghost" size="sm" onClick={() => setFile({ name: "referral-letter.pdf" })}>
                  Simulate upload
                </Button>
              )}
            </Spec>
          </Group>

          <Group title="Data display">
            <Spec name="Icon set" desc="The line-icon registry (IconName) — click an icon to copy its JSX." wide>
              <div className="flex w-full flex-wrap gap-2">
                {DEMO_ICONS.map((n) => (
                  <Tooltip key={n} label={n}>
                    <button
                      type="button"
                      aria-label={`Copy icon ${n}`}
                      onClick={async () => {
                        await navigator.clipboard.writeText(`<Icon name="${n}" />`);
                        toast(`Copied <Icon name="${n}" />`, "success");
                      }}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-field border border-border text-text-body transition-colors hover:bg-canvas"
                    >
                      <Icon name={n} />
                    </button>
                  </Tooltip>
                ))}
              </div>
            </Spec>
            <Spec name="Logo" desc="Brand wordmark; onLight / onNavy.">
              <Logo />
              <span className="rounded-lg bg-sidebar-bg px-4 py-3"><Logo variant="onNavy" /></span>
            </Spec>
            <Spec name="Avatar" desc="Initials on a per-user hue; sizes + group.">
              <Avatar name="Brendan Stanton" hue="teal" size="sm" />
              <Avatar name="Amara Okafor" hue="amber" size="md" />
              <Avatar name="Priya Rao" hue="pink" size="md" />
              <AvatarGroup
                people={[
                  { name: "Brendan Stanton", hue: "teal" },
                  { name: "Amara Okafor", hue: "amber" },
                  { name: "Priya Rao", hue: "pink" },
                  { name: "Jon Lee", hue: "blue" },
                  { name: "Mia Chen" },
                ]}
              />
            </Spec>
            <Spec name="Badge" desc="Status chip · count circle · status dot.">
              <Badge variant="success">Active</Badge>
              <Badge variant="info">Submitted</Badge>
              <Badge variant="warning">Pending</Badge>
              <Badge variant="danger">Overdue</Badge>
              <CountBadge count={5} />
              <CountBadge count={128} variant="danger" />
              <span className="inline-flex items-center gap-1.5 text-sm text-text-body">
                <DotBadge variant="success" /> Online
              </span>
            </Spec>
            <Spec name="Tag" desc="Hue-coded taxonomy chip; dismissible.">
              <Tag hue="teal">Anxiety</Tag>
              <Tag hue="violet">CBT</Tag>
              <Tag hue="orange">Sliding scale</Tag>
              <Tag hue="grey" onDismiss={() => {}}>Removable</Tag>
            </Spec>
            <Spec name="StatCard" desc="KPI value + label + optional corner slot." wide>
              <div className="grid w-full gap-3 sm:grid-cols-3">
                <StatCard label="Outstanding" value="$4,280" corner={<Badge variant="warning">3</Badge>} />
                <StatCard label="Sessions this week" value="27" />
                <StatCard label="Collected" value="$12.6k" corner={<Tag hue="green">+8%</Tag>} />
              </div>
            </Spec>
            <Spec name="ListRow" desc="Bordered row: leading · title · meta · trailing." wide>
              <div className="w-full space-y-2.5">
                <ListRow
                  accent="#3F8290"
                  leading={<Avatar name="Amara Okafor" hue="amber" size="md" />}
                  title={<>Amara Okafor <Badge variant="info">Lead</Badge></>}
                  meta="Next: Jul 18 · Intake"
                  trailing={<IconButton icon="chevron-right" label="Open" />}
                />
                <ListRow
                  leading={<IconSquare name="file-text" />}
                  title="Intake packet"
                  meta="Sent 2 days ago"
                  trailing={<Badge variant="success">Signed</Badge>}
                />
              </div>
            </Spec>
            <Spec name="Table" desc="Header + rows; pair with Toolbar + Pagination." wide>
              <Table head={["Client", "Service", "Status", ""]} className="w-full">
                <Tr>
                  <Td>Amara Okafor</Td>
                  <Td>Therapy — 50 min</Td>
                  <Td><Badge variant="success">Paid</Badge></Td>
                  <Td className="text-right"><KebabMenu><MenuItem icon="eye" label="View" onClick={() => {}} /><MenuItem icon="trash" label="Delete" danger onClick={() => {}} /></KebabMenu></Td>
                </Tr>
                <Tr>
                  <Td>Jon Lee</Td>
                  <Td>Intake session</Td>
                  <Td><Badge variant="warning">Sent</Badge></Td>
                  <Td className="text-right"><KebabMenu><MenuItem icon="eye" label="View" onClick={() => {}} /></KebabMenu></Td>
                </Tr>
              </Table>
            </Spec>
            <Spec
              name="Table · stacked"
              desc="The analytical layout: search spans the table column above the chrome, facets INSIDE it, grey header band. DataTable exposes it as stacked."
              wide
            >
              <div className="w-full space-y-3">
                <SearchInput placeholder="Search by insurer" className="w-full" readOnly />
                <Table
                  tintedHeader
                  toolbar={
                    <>
                      <FilterChip label="Code" />
                      <FilterChip label="Insurer" />
                      <span className="ml-auto text-sm tabular-nums text-text-muted">279 of 279 bands</span>
                    </>
                  }
                  head={["Service", "Insurer", "Median In-Ntwk"]}
                  className="w-full"
                >
                  <Tr>
                    <Td>Psychotherapy, 45 min</Td>
                    <Td>CDPHP</Td>
                    <Td className="font-semibold text-text">$121.48</Td>
                  </Tr>
                  <Tr>
                    <Td>Psychotherapy, 60 min</Td>
                    <Td>CDPHP</Td>
                    <Td className="font-semibold text-text">$180.94</Td>
                  </Tr>
                </Table>
                <p className="text-[13px] text-text-body">
                  Grey band, never teal — teal means focus/active in this kit, so a permanent teal header would
                  spend that signal on chrome. Use <span className="font-mono">stacked</span> for dense analytical
                  tables (/rates); keep the default <span className="font-mono">index</span> layout for object lists.
                </p>
              </div>
            </Spec>
            <Spec
              name="Table · v2 (operational)"
              desc="TABLE STANDARD v2: the table names itself + states its own health in a title block far-left, search moves RIGHT before the kebab, and an honest source + freshness footer stamps the bottom. DataTable exposes it via title / status / titleMeta / source / updatedAt. Every NEW table ships this with the lightning stack by default (docs/reports/2026-07-20-table-standard-v2.md)."
              wide
            >
              <div className="w-full space-y-3">
                <Table
                  className="w-full"
                  head={["Job", "Status", ""]}
                  toolbar={
                    <>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <DotBadge variant="success" />
                          <span className="text-[15px] font-semibold text-text">Harvest runs</span>
                          <Badge variant="success">Healthy</Badge>
                        </div>
                        <span className="text-[13px] text-text-muted">Jul 20, 2026 · 1:23 AM · cron · 428s · 15 steps</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SearchInput placeholder="Search harvests" className="w-56" readOnly />
                        <KebabMenu label="Table options" icon="dots-horizontal">
                          <MenuItem icon="download" label="Export CSV" onClick={() => {}} />
                        </KebabMenu>
                      </div>
                    </>
                  }
                  footer={
                    <div className="flex items-center justify-between gap-4 text-[13px] text-text-muted">
                      <span>sync_runs · harvest:* jobs</span>
                      <span className="tabular-nums">Jul 20, 2026 · 1:14 AM</span>
                    </div>
                  }
                >
                  <Tr>
                    <Td>harvest:mrf-oscar-obh</Td>
                    <Td><Badge variant="success">OK</Badge></Td>
                    <Td className="text-right"><KebabMenu><MenuItem icon="copy" label="Copy run ID" onClick={() => {}} /></KebabMenu></Td>
                  </Tr>
                  <Tr>
                    <Td>harvest:mrf-empire-39F0</Td>
                    <Td><Badge variant="danger">Error</Badge></Td>
                    <Td className="text-right"><KebabMenu><MenuItem icon="copy" label="Copy run ID" onClick={() => {}} /></KebabMenu></Td>
                  </Tr>
                </Table>
                <p className="text-[13px] text-text-body">
                  Title + status far LEFT, search + kebab RIGHT, source (left) + freshness (right) in the footer. The
                  standalone status card is gone — the table carries its own health. Under the hood every new table
                  ships the lightning stack: server pagination, debounced indexed search, snapshot/matview backing
                  over ~10k rows, parallel page+count, <span className="font-mono">min-w-0</span> overflow. Fast and
                  standardized is the definition of done.
                </p>
              </div>
            </Spec>
            <Spec name="Stepper" desc="Numbered steps: done ✓ · active · upcoming." wide>
              <Stepper className="w-full" steps={["Details", "Insurance", "Consent", "Review"]} active={1} />
            </Spec>
            <Spec name="ProgressBar" desc="Thin track + primary fill; optional %.">
              <div className="w-full space-y-3">
                <ProgressBar value={38} showLabel />
                <ProgressBar value={72} showLabel />
              </div>
            </Spec>
            <Spec name="SquareMeter" desc="Grid of squares filling to a proportion; one square per percent. 25x4." wide>
              <div className="w-full space-y-3">
                <SquareMeter value={74} state="warning" />
                <SquareMeter value={92} state="healthy" />
              </div>
            </Spec>
            <Spec name="Spinner / Skeleton" desc="Inline loader + placeholder bars.">
              <Spinner className="text-primary" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
            </Spec>
          </Group>

          <Group title="Navigation">
            <Spec name="Tabs" desc="Underline tabs — controlled or href.">
              <Tabs
                className="w-full"
                active={innerTab}
                onChange={setInnerTab}
                items={[
                  { key: "overview", label: "Overview" },
                  { key: "billing", label: "Billing", count: 3 },
                  { key: "notes", label: "Notes" },
                ]}
              />
            </Spec>
            {/* Static anatomy, not a live mount: IndexHeader's TopBar half
                portals into the real TopBar, so rendering one here would put a
                stray "New …" button in this page's own TopBar. */}
            <Spec name="IndexHeader" desc="The index page standard, top half: New + bell, then the tab row." wide>
              <div className="w-full space-y-3">
                <div className="rounded-card border border-dashed border-border bg-canvas px-4 py-2.5">
                  <p className="text-[13px] text-text-muted">
                    TopBar (portalled) — <span className="font-mono text-text-body">route H1</span> · · ·{" "}
                    <span className="font-mono text-text-body">New client</span> ·{" "}
                    <span className="font-mono text-text-body">bell</span>
                  </p>
                </div>
                <Tabs
                  className="w-full"
                  slideActive
                  active={innerTab}
                  onChange={setInnerTab}
                  items={[
                    { key: "overview", label: "All Clients" },
                    { key: "billing", label: "Prescriptions" },
                    { key: "notes", label: "Orders" },
                  ]}
                />
                <p className="text-[13px] text-text-body">
                  Pair with <span className="font-mono">DataTable</span> below it — that is the standard&rsquo;s bottom
                  half and already owns the toolbar (search left; Filter · Columns · Export · Refresh), the column
                  picker, the table and the scroll. The list itself belongs in{" "}
                  <span className="font-mono">components/tables/*</span> as a self-contained object table, so the same
                  table serves its route and an embedded rail. See the Start-here rules for the full standard.
                </p>
              </div>
            </Spec>
            <Spec name="Breadcrumb" desc="Muted link trail above a PageHeader.">
              <Breadcrumb items={[{ label: "Clients", href: "#" }, { label: "Amara Okafor", href: "#" }, { label: "Billing" }]} />
            </Spec>
            <Spec name="Pagination" desc="URL-paged PUBLIC listings only — never under a table in the app. Tables show ten rows and scroll (docs/rules/table-standard.md).">
              <Pagination className="w-full" page={page} pageCount={5} onPageChange={setPage} />
            </Spec>
            <Spec name="KebabMenu" desc="Dots trigger → DropdownMenu of actions.">
              <KebabMenu>
                <MenuItem icon="eye" label="View" onClick={() => {}} />
                <MenuItem icon="edit" label="Edit" onClick={() => {}} />
                <MenuDivider />
                <MenuItem icon="trash" label="Delete" danger onClick={() => {}} />
              </KebabMenu>
            </Spec>
            <Spec name="DropdownMenu" desc="Portaled menu; bottom or drop-up.">
              <DropdownMenu
                label="Open menu"
                align="left"
                triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-field border border-border bg-surface px-3 text-[15px] font-medium text-text hover:bg-canvas"
                trigger={<>Actions <Icon name="chevron-down" size={14} className="text-text-muted" /></>}
              >
                <MenuItem icon="edit" label="Rename" onClick={() => {}} />
                <MenuItem icon="copy" label="Duplicate" onClick={() => {}} />
              </DropdownMenu>
            </Spec>
            <Spec name="UserChip" desc="Avatar + name pill; the account-menu trigger.">
              <UserChip name="Brendan Stanton" hue="teal" />
              <span className="rounded-lg bg-sidebar-bg p-2">
                <UserChip name="Brendan Stanton" hue="teal" onNavy />
              </span>
            </Spec>
            <Spec name="Toolbar" desc="Strip above an index table." wide>
              <Toolbar className="w-full" count={128} countLabel="clients" actions={<Button size="sm" leftIcon="plus">New</Button>}>
                <SearchInput placeholder="Search…" className="w-56" />
                <FilterChip label="Status" onClick={() => {}} />
              </Toolbar>
            </Spec>
          </Group>

          <Group title="Overlays & feedback">
            <Spec name="Modal" desc="Centered dialog on the scrim.">
              <Button variant="secondary" onClick={() => setModalOpen(true)}>Open modal</Button>
              <Modal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                title="Record payment"
                icon="credit-card"
                footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={() => setModalOpen(false)}>Save</Button></>}
              >
                <p className="text-[15px] text-text-body">Body content — forms, confirmations, details.</p>
              </Modal>
            </Spec>
            <Spec
              name="SidePanel"
              desc="Right FLYOVER — the create/edit workhorse. Insets 12px from the viewport with rounded-card, an inset 1px ring + high shadow (--shadow-panel) over a soft scrim, so it reads as a card over the page rather than a slab bolted to its edge. Optional `kicker` adds a mono uppercase category line above the title. Enter-only motion; Esc/backdrop dismiss."
            >
              <Button variant="secondary" onClick={() => setPanelOpen(true)}>Open panel</Button>
              <SidePanel
                open={panelOpen}
                onClose={() => setPanelOpen(false)}
                title="New client"
                kicker="Client"
                icon="users"
                footer={<><Button variant="secondary" onClick={() => setPanelOpen(false)}>Cancel</Button><Button onClick={() => setPanelOpen(false)}>Create</Button></>}
              >
                <div className="space-y-4">
                  <Field label="Full name" name="n" placeholder="Jane Doe" />
                  <Field label="Email" name="e" placeholder="jane@example.com" />
                </div>
              </SidePanel>
            </Spec>
            <Spec
              name={'SidePanel variant="spec"'}
              desc="The faithful dark treatment for READ-ONLY detail surfaces — same structure, Linear's own values (#0f1011 panel, #23252a ring, white radial glow, #8a8f98 secondary text). Opt-in: no consumer is forced onto it."
            >
              <Button variant="secondary" onClick={() => setSpecPanelOpen(true)}>Open spec panel</Button>
              <SidePanel
                open={specPanelOpen}
                onClose={() => setSpecPanelOpen(false)}
                title="Psychotherapy, 60 min"
                kicker="Tech specs"
                variant="spec"
              >
                <div className="space-y-6">
                  <div>
                    <p className="font-mono text-[13px] text-[#8a8f98]">1.0</p>
                    <h3 className="mt-1 text-[17px] text-[#f7f8f8]">Billing code</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-[#8a8f98]">
                      CPT 90837 — the dark shell marks a surface as read-only, so a spec sheet never reads as an
                      editable form.
                    </p>
                  </div>
                  <div className="border-t border-[#23252a] pt-6">
                    <p className="font-mono text-[13px] text-[#8a8f98]">2.0</p>
                    <h3 className="mt-1 text-[17px] text-[#f7f8f8]">Duration</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-[#8a8f98]">53–60 minutes.</p>
                  </div>
                </div>
              </SidePanel>
            </Spec>
            <Spec name="Toast" desc="Auto-dismissing bottom-right pill.">
              <Button size="sm" variant="secondary" onClick={() => toast("Invoice sent", "success")}>Success</Button>
              <Button size="sm" variant="secondary" onClick={() => toast("Draft saved")}>Info</Button>
              <Button size="sm" variant="secondary" onClick={() => toast("Payment failed", "danger")}>Danger</Button>
            </Spec>
            <Spec name="Tooltip" desc="Dark bubble on hover; portaled.">
              <Tooltip label="Start a telehealth call"><IconButton icon="video" label="Call" /></Tooltip>
              <Tooltip label="Compose message" placement="right"><IconButton icon="message" label="Message" /></Tooltip>
            </Spec>
            <Spec name="Banner" desc="Full-width tinted strip." wide>
              <div className="w-full space-y-2.5">
                <Banner variant="info" action={<Button size="sm" variant="ghost">View</Button>}>A new intake form is awaiting your review.</Banner>
                <Banner variant="warning">This client&apos;s card on file expires next month.</Banner>
              </div>
            </Spec>
            <Spec name="EmptyState" desc="Spot mark + title + subtext + actions." wide>
              <EmptyState
                className="w-full"
                icon="inbox"
                title="No messages yet"
                subtext="When a client replies, the thread shows up here."
                actions={<Button leftIcon="send">Compose</Button>}
              />
            </Spec>
            <Spec name="AccordionSection" desc="Title + chevron collapse; card variant." wide>
              <AccordionSection className="w-full" title="Insurance &amp; billing" icon="credit-card" variant="card">
                <p className="text-sm text-text-body">Collapsible content — form rows, summaries, nested rails.</p>
              </AccordionSection>
            </Spec>
          </Group>

          <Group title="Layout & brand">
            <Spec
              name="BoardGrid / BoardCard"
              desc="Dashboard board: cards flow in a 4-col grid, carry a size step, and reorder by picking the whole card up. Hover for the pack — × top-left, ⠿ top-right, resize grip bottom-right; hold anywhere and drag."
              wide
            >
              <BoardDemo />
            </Spec>
            <Spec name="Card" desc="Base Card + SettingsCard header." wide>
              <div className="grid w-full gap-3 sm:grid-cols-2">
                <Card>
                  <p className="text-[15px] font-semibold text-text">Base Card</p>
                  <p className="mt-1 text-sm text-text-body">Surface, border, radius, soft shadow.</p>
                </Card>
                <SettingsCard icon="gear" title="Preferences" action={<TextLink>Edit</TextLink>}>
                  <p className="text-sm text-text-body">Header row + optional far-right action.</p>
                </SettingsCard>
              </div>
            </Spec>
            <Spec name="LibraryCard" desc="Uniform template/resource card — fixed height, kebab, 1–2 tags opposite a date." wide>
              <div className="grid w-full gap-3 sm:grid-cols-2">
                <LibraryCard
                  title="DAP Note"
                  description="Data · Assessment · Plan — a concise structured progress note used across the Library."
                  date="Apr 2026"
                  onOpen={() => {}}
                  tags={
                    <>
                      <Tag hue="blue">DAP</Tag>
                      <Badge variant="neutral">Built-in</Badge>
                    </>
                  }
                  menu={
                    <KebabMenu label="Actions">
                      <MenuItem icon="edit" label="Edit" onClick={() => {}} />
                      <MenuItem icon="copy" label="Duplicate" onClick={() => {}} />
                    </KebabMenu>
                  }
                />
                <LibraryCard
                  title="New Client Intake"
                  description="Demographics, history, and consent — please complete before your first visit."
                  date="Mar 2026"
                  onOpen={() => {}}
                  tags={<Badge variant="success">Published</Badge>}
                  menu={
                    <KebabMenu label="Actions">
                      <MenuItem icon="send" label="Send to client" onClick={() => {}} />
                    </KebabMenu>
                  }
                />
              </div>
            </Spec>
            <Spec name="Divider" desc="Hairline; labeled 'or' variant." wide>
              <div className="w-full space-y-4">
                <Divider />
                <Divider label="or" />
              </div>
            </Spec>
            <Spec name="PageHeader" desc="Icon + title + right-aligned actions." wide>
              <PageHeader className="w-full" icon="users" title="Clients" actions={<Button leftIcon="plus">New client</Button>} />
            </Spec>
          </Group>
        </div>
      )}

      {/* ── COMPONENTS (metadata only) ──────────────────────────────── */}
      {tab === "components" && (
        <div className="space-y-8">
          <Banner variant="info">
            Feature components are cataloged as a reference index — not rendered here. They&apos;re
            data-backed and heavy (ProseMirror, WebRTC, live queries), so importing them would bloat
            this route. Open each in the app to see it live.
          </Banner>

          {FEATURES.map((group) => (
            <section key={group.area}>
              <h2 className="mb-3 text-[19px] font-semibold text-text">{group.area}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((c) => (
                  <FeatureCard key={c.path} c={c} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
