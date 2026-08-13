"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { TopBarActions } from "@/components/shell/topbar-slot";
import { SearchInput } from "@/components/ui/search-input";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { MenuItem } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import type { ThreadSummary } from "@/lib/repos/threads";

// Practitioner Inbox — page-level Tabs (Open/Closed/Drafts) and search over
// the master/detail split: thread list pane beside the open thread (children
// from inbox/layout.tsx). Below lg the panes swap on navigation. Compose
// lives in the TopBar; closing it mid-write saves a local draft
// (localStorage) that the Drafts tab lists and reopens.

function threadTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? formatTime(d) : formatDate(d);
}

interface ComposeDraft {
  id: string;
  clientId: string;
  subject: string;
  body: string;
  savedAt: string; // ISO
}

const DRAFTS_KEY = "leuk:inbox-drafts";

function loadDrafts(): ComposeDraft[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type ShellTab = "open" | "closed" | "drafts";

export function InboxShell({
  threads,
  clients = [],
  children,
  basePath = "/inbox",
  variant = "staff",
}: {
  threads: ThreadSummary[];
  clients?: Array<{ id: string; name: string }>;
  children: React.ReactNode;
  /** Route prefix for thread links (e.g. "/inbox" or "/portal/messages"). */
  basePath?: string;
  /** "staff" = practitioner inbox; "client" = portal (no client picker, care-team POV). */
  variant?: "staff" | "client";
}) {
  const router = useRouter();
  const toast = useToast();
  const pathname = usePathname();
  const isClient = variant === "client";
  const activeId = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length + 1).split("/")[0]
    : null;

  const active = threads.find((t) => t.id === activeId);
  const [tab, setTab] = useState<ShellTab>(active?.status === "closed" ? "closed" : "open");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "agents" | "clients" | "unread">("all");
  const [composeOpen, setComposeOpen] = useState(false);
  const [compose, setCompose] = useState({ clientId: "", subject: "", body: "" });
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<ComposeDraft[]>([]);
  const [busy, setBusy] = useState(false);

  // Drafts live in localStorage — hydrate after mount (SSR-safe).
  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);
  const saveDrafts = (next: ComposeDraft[]) => {
    setDrafts(next);
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));
    } catch {
      /* storage full/unavailable — drafts just won't persist */
    }
  };

  // Opening a thread marks it read server-side; refresh so the list's
  // unread badge clears. Skip the initial mount.
  const prevId = useRef(activeId);
  useEffect(() => {
    if (prevId.current !== activeId) {
      prevId.current = activeId;
      if (activeId) router.refresh();
    }
  }, [activeId, router]);

  const counts = useMemo(
    () => ({
      open: threads.filter((t) => t.status === "open").length,
      closed: threads.filter((t) => t.status === "closed").length,
    }),
    [threads],
  );

  const q = query.trim().toLowerCase();
  const visible = threads.filter((t) => {
    if (t.status !== tab) return false;
    if (filter === "agents" && !t.agentId) return false;
    if (filter === "clients" && t.agentId) return false;
    if (filter === "unread" && (isClient ? t.unreadFromStaff : t.unreadFromClient) === 0) return false;
    if (!q) return true;
    return (
      t.clientName.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.snippet ?? "").toLowerCase().includes(q)
    );
  });

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? null;
  const visibleDrafts = drafts.filter((d) => {
    if (!q) return true;
    return (
      (clientName(d.clientId) ?? "").toLowerCase().includes(q) ||
      d.subject.toLowerCase().includes(q) ||
      d.body.toLowerCase().includes(q)
    );
  });

  const openCompose = (draft?: ComposeDraft) => {
    setCompose(draft ? { clientId: draft.clientId, subject: draft.subject, body: draft.body } : { clientId: "", subject: "", body: "" });
    setDraftId(draft?.id ?? null);
    setComposeOpen(true);
  };

  // Closing compose mid-write keeps the work: save (or update) a draft.
  const closeCompose = () => {
    setComposeOpen(false);
    // The portal has no Drafts tab — don't persist a hidden draft there.
    if (isClient) {
      setDraftId(null);
      setCompose({ clientId: "", subject: "", body: "" });
      return;
    }
    const hasContent = compose.clientId || compose.subject.trim() || compose.body.trim();
    if (hasContent) {
      const id = draftId ?? `draft_${Date.now()}`;
      const next: ComposeDraft = { id, ...compose, savedAt: new Date().toISOString() };
      saveDrafts([next, ...drafts.filter((d) => d.id !== id)]);
      if (!draftId) toast("Saved to drafts", "info");
    } else if (draftId) {
      saveDrafts(drafts.filter((d) => d.id !== draftId)); // emptied out — drop it
    }
    setDraftId(null);
    setCompose({ clientId: "", subject: "", body: "" });
  };

  const deleteDraft = (id: string) => saveDrafts(drafts.filter((d) => d.id !== id));

  const submitCompose = async () => {
    if ((!isClient && !compose.clientId) || !compose.subject.trim() || !compose.body.trim()) {
      toast(
        isClient ? "Fill in a subject and message." : "Choose a client and fill in subject and message.",
        "warning",
      );
      return;
    }
    setBusy(true);
    // Client threads are scoped to the signed-in client server-side — no clientId.
    const payload = isClient ? { subject: compose.subject, body: compose.body } : compose;
    const res = await fetch("/api/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Could not start the conversation.", "danger");
      return;
    }
    const thread = await res.json();
    if (draftId) deleteDraft(draftId);
    setComposeOpen(false);
    setDraftId(null);
    setCompose({ clientId: "", subject: "", body: "" });
    router.push(`${basePath}/${thread.id}`);
    router.refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBarActions>
        <Button size="sm" leftIcon="plus" onClick={() => openCompose()}>
          {isClient ? "New message" : "Compose"}
        </Button>
      </TopBarActions>

      {/* Page-level tabs + search (hidden below lg while a thread is open) */}
      <Tabs
        className={`mb-4 shrink-0 ${activeId ? "max-lg:hidden" : ""}`}
        items={[
          { key: "open", label: "Open", count: counts.open },
          { key: "closed", label: "Closed", count: counts.closed },
          ...(isClient ? [] : [{ key: "drafts", label: "Drafts", count: drafts.length }]),
        ]}
        active={tab}
        onChange={(k) => setTab(k as ShellTab)}
      />
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-surface shadow-card">
        {/* Thread list pane */}
        <div
          className={`flex w-full flex-col border-border lg:w-[380px] lg:shrink-0 lg:border-r ${
            activeId ? "max-lg:hidden" : ""
          }`}
        >
          {/* Search rides at the top of the pane it filters, with the kebab
              opposite — the same header shape every table in the app uses. */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
            <SearchInput
              placeholder={tab === "drafts" ? "Search drafts" : "Search conversations"}
              className="min-w-0 flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <KebabMenu label="Filter conversations">
              <MenuItem icon="inbox" label="All conversations" selected={filter === "all"} onClick={() => setFilter("all")} />
              <MenuItem icon="sparkle" label="Agents only" selected={filter === "agents"} onClick={() => setFilter("agents")} />
              <MenuItem icon="users" label="Clients only" selected={filter === "clients"} onClick={() => setFilter("clients")} />
              <MenuItem icon="message" label="Unread only" selected={filter === "unread"} onClick={() => setFilter("unread")} />
            </KebabMenu>
          </div>

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
            {tab === "drafts" ? (
              visibleDrafts.length === 0 ? (
                <EmptyState
                  icon="edit"
                  title={query ? "No drafts match" : "No drafts"}
                  subtext={query ? undefined : "Messages you start but don't send are saved here."}
                />
              ) : (
                visibleDrafts.map((d) => (
                  // div, not button — the trash IconButton nests inside.
                  <div
                    key={d.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openCompose(d)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openCompose(d);
                    }}
                    className="block w-full cursor-pointer border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-canvas"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-text">
                        {clientName(d.clientId) ?? "No client selected"}
                      </span>
                      <span className="shrink-0 text-[12px] text-text-muted">{formatDateTime(d.savedAt)}</span>
                      <IconButton
                        icon="trash"
                        label="Delete draft"
                        variant="danger"
                        className="-mr-2 h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDraft(d.id);
                        }}
                      />
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-text-body">
                      {d.subject.trim() || "(no subject)"}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-text-muted">
                      {d.body.trim() || "Empty draft"}
                    </span>
                  </div>
                ))
              )
            ) : visible.length === 0 ? (
              <EmptyState
                icon="inbox"
                title={query ? "No conversations match" : `No ${tab} conversations`}
                subtext={
                  tab === "open" && !query
                    ? isClient
                      ? "Messages from your care team will appear here."
                      : "Client messages will appear here."
                    : undefined
                }
              />
            ) : (
              visible.map((t) => {
                const unreadCount = isClient ? t.unreadFromStaff : t.unreadFromClient;
                const unread = unreadCount > 0;
                const current = t.id === activeId;
                // The client's counterparty is always their care team; staff see the client's name.
                const heading = t.agentId ? t.clientName : isClient ? "Care team" : t.clientName;
                return (
                  <Link
                    key={t.id}
                    href={`${basePath}/${t.id}`}
                    aria-current={current ? "page" : undefined}
                    // Washed teal = read/opened. Unread rows stay on white so
                    // the eye lands on them first; the open one is tinted.
                    className={`group block border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-canvas ${
                      current ? "bg-primary-wash" : unread ? "" : "bg-primary-wash/40"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      {/* Unread count rides the avatar rather than taking its
                          own row — the list is a scan surface, not a report. */}
                      <span className="relative shrink-0">
                        {t.agentId ? <AgentAvatar agentId={t.agentId} /> : <Avatar name={heading} size="sm" />}
                        {unread && (
                          <span
                            aria-label={`${unreadCount} unread`}
                            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white"
                          >
                            {unreadCount}
                          </span>
                        )}
                      </span>
                      <span
                        // One weight down once it's been read.
                        className={`min-w-0 flex-1 truncate text-[15px] text-text transition-colors group-hover:text-primary ${
                          unread ? "font-semibold" : "font-normal"
                        }`}
                      >
                        {heading}
                      </span>
                      <span className="shrink-0 text-[12px] text-text-muted">{threadTime(t.lastMessageAt)}</span>
                    </span>
                    <span
                      className={`mt-1 block truncate text-sm transition-colors group-hover:text-primary ${
                        unread ? "font-medium text-text" : "font-normal text-text-body"
                      }`}
                    >
                      {t.subject}
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* Thread pane */}
        <div className={`min-w-0 flex-1 flex-col lg:flex ${activeId ? "flex" : "max-lg:hidden lg:flex"}`}>
          {children}
        </div>
      </div>

      <Modal
        open={composeOpen}
        onClose={closeCompose}
        title={isClient ? "Message your care team" : "New message"}
        icon="message"
        footer={
          <>
            <Button variant="secondary" onClick={closeCompose}>
              Cancel
            </Button>
            <Button onClick={submitCompose} loading={busy}>
              Send message
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!isClient && (
            <Select
              label="Client"
              required
              placeholder="Choose a client"
              options={clients.map((c) => ({ value: c.id, label: c.name }))}
              value={compose.clientId}
              onValueChange={(v) => setCompose((c) => ({ ...c, clientId: v }))}
            />
          )}
          <Field
            label="Subject"
            required
            value={compose.subject}
            onChange={(e) => setCompose((c) => ({ ...c, subject: e.target.value }))}
            placeholder="e.g. Follow-up on today's session"
          />
          <Textarea
            label="Message"
            required
            rows={4}
            value={compose.body}
            onChange={(e) => setCompose((c) => ({ ...c, body: e.target.value }))}
            placeholder="Write a message…"
          />
        </div>
      </Modal>
    </div>
  );
}
