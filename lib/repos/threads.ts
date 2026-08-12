// Clinical domain — reads/writes the HIPAA-enabled project (see lib/db.ts).
import { hasPhiDb as hasDb, sqlPhi as sql } from "@/lib/db";
import { isoDateOnly, isoDateTime } from "@/lib/format";
import { AGENTS } from "@/lib/agents/registry";
import { mockId, mockStore } from "@/lib/mock";
import "@/lib/mock/threads";
import "@/lib/mock/clients"; // client rows for name joins + portal-login mapping
import type { AvatarHue, Client, Message, Thread, ThreadStatus } from "@/lib/types";

// Secure-messaging repo — threads + messages. hasDb → Postgres; otherwise the
// in-memory mock store. Threads belong to a client; the portal user reaches
// them through clients.user_id (see clientForUser).

export interface ThreadSummary extends Thread {
  clientName: string;
  /** Body of the most recent message (list snippet). */
  snippet: string | null;
  /** Unread messages sent by the portal client — the practitioner's badge. */
  unreadFromClient: number;
  /** Unread messages sent by staff — the client's badge. */
  unreadFromStaff: number;
}

export interface ThreadDetail {
  thread: ThreadSummary;
  messages: Message[];
  /** Sender display info keyed by user id (for bubbles/avatars). */
  senders: Record<string, { name: string; hue: AvatarHue }>;
}

type ThreadRow = {
  id: string;
  client_id: string | null;
  agent_id: string | null;
  subject: string;
  status: ThreadStatus;
  last_message_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function toThread(r: ThreadRow): Thread {
  return {
    id: r.id,
    clientId: r.client_id ?? "",
    agentId: r.agent_id,
    subject: r.subject,
    status: r.status,
    lastMessageAt: isoDateTime(r.last_message_at),
    createdAt: isoDateTime(r.created_at),
    updatedAt: isoDateTime(r.updated_at),
  };
}

type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string | null;
  sender_agent_id: string | null;
  body: string;
  read_at: string | Date | null;
  created_at: string | Date;
};

function toMessage(r: MessageRow): Message {
  return {
    id: r.id,
    threadId: r.thread_id,
    senderId: r.sender_id ?? "",
    senderAgentId: r.sender_agent_id,
    body: r.body,
    readAt: isoDateTime(r.read_at),
    createdAt: isoDateTime(r.created_at),
  };
}

/** Whose conversation this is: the agent's name, or the client's. */
function partyName(agentId: string | null, firstName: string | null, lastName: string | null): string {
  if (agentId) return AGENTS.find((a) => a.id === agentId)?.name ?? agentId;
  return firstName || lastName ? `${firstName ?? ""} ${lastName ?? ""}`.trim() : "Client";
}

/** Bubble identities for agent turns, keyed `agent:<id>` so they can't collide
 *  with a user uuid in the same map. */
function agentSenders(messages: Message[]): ThreadDetail["senders"] {
  const out: ThreadDetail["senders"] = {};
  for (const m of messages) {
    if (!m.senderAgentId || out[`agent:${m.senderAgentId}`]) continue;
    const def = AGENTS.find((a) => a.id === m.senderAgentId);
    out[`agent:${m.senderAgentId}`] = { name: def?.name ?? m.senderAgentId, hue: "teal" };
  }
  return out;
}

function mockSummary(t: Thread): ThreadSummary {
  const store = mockStore();
  const client = t.clientId ? store.clients.get(t.clientId) : undefined;
  const msgs = [...store.messages.values()]
    .filter((m) => m.threadId === t.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = msgs[msgs.length - 1];
  const clientUserId = client?.userId ?? null;
  return {
    ...t,
    clientName: partyName(t.agentId, client?.firstName ?? null, client?.lastName ?? null),
    snippet: last?.body ?? null,
    unreadFromClient: msgs.filter((m) => !m.readAt && (m.senderAgentId || m.senderId === clientUserId)).length,
    unreadFromStaff: msgs.filter((m) => !m.readAt && !m.senderAgentId && m.senderId !== clientUserId).length,
  };
}

export async function listThreads(f?: { clientId?: string; status?: ThreadStatus }): Promise<ThreadSummary[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT t.*, c.first_name, c.last_name, c.user_id AS client_user_id,
             (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS snippet,
             (SELECT count(*)::int FROM messages m WHERE m.thread_id = t.id AND m.read_at IS NULL AND (m.sender_agent_id IS NOT NULL OR m.sender_id = c.user_id)) AS unread_from_client,
             (SELECT count(*)::int FROM messages m WHERE m.thread_id = t.id AND m.read_at IS NULL AND m.sender_agent_id IS NULL AND (c.user_id IS NULL OR m.sender_id <> c.user_id)) AS unread_from_staff
      FROM threads t LEFT JOIN clients c ON c.id = t.client_id
      WHERE (${f?.clientId ?? null}::uuid IS NULL OR t.client_id = ${f?.clientId ?? null})
        AND (${f?.status ?? null}::text IS NULL OR t.status = ${f?.status ?? null})
      ORDER BY t.last_message_at DESC NULLS LAST
    `) as Array<ThreadRow & { first_name: string | null; last_name: string | null; snippet: string | null; unread_from_client: number; unread_from_staff: number }>;
    return rows.map((r) => ({
      ...toThread(r),
      clientName: partyName(r.agent_id, r.first_name, r.last_name),
      snippet: r.snippet,
      unreadFromClient: r.unread_from_client,
      unreadFromStaff: r.unread_from_staff,
    }));
  }
  return [...mockStore().threads.values()]
    .filter((t) => (!f?.clientId || t.clientId === f.clientId) && (!f?.status || t.status === f.status))
    .map(mockSummary)
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

export async function getThread(id: string): Promise<ThreadDetail | null> {
  if (hasDb) {
    const summaries = (await sql`
      SELECT t.*, c.first_name, c.last_name,
             (SELECT count(*)::int FROM messages m WHERE m.thread_id = t.id AND m.read_at IS NULL AND (m.sender_agent_id IS NOT NULL OR m.sender_id = c.user_id)) AS unread_from_client,
             (SELECT count(*)::int FROM messages m WHERE m.thread_id = t.id AND m.read_at IS NULL AND m.sender_agent_id IS NULL AND (c.user_id IS NULL OR m.sender_id <> c.user_id)) AS unread_from_staff
      FROM threads t LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ${id}
    `) as Array<ThreadRow & { first_name: string | null; last_name: string | null; unread_from_client: number; unread_from_staff: number }>;
    const r = summaries[0];
    if (!r) return null;
    const msgRows = (await sql`SELECT * FROM messages WHERE thread_id = ${id} ORDER BY created_at ASC`) as MessageRow[];
    const messages = msgRows.map(toMessage);
    const senderIds = [...new Set(messages.map((m) => m.senderId).filter(Boolean))];
    const users = senderIds.length
      ? ((await sql`SELECT id, name, avatar_hue FROM users WHERE id = ANY(${senderIds})`) as Array<{ id: string; name: string; avatar_hue: AvatarHue }>)
      : [];
    return {
      thread: {
        ...toThread(r),
        clientName: partyName(r.agent_id, r.first_name, r.last_name),
        snippet: messages[messages.length - 1]?.body ?? null,
        unreadFromClient: r.unread_from_client,
        unreadFromStaff: r.unread_from_staff,
      },
      messages,
      senders: { ...agentSenders(messages), ...Object.fromEntries(users.map((u) => [u.id, { name: u.name, hue: u.avatar_hue }])) },
    };
  }
  const store = mockStore();
  const t = store.threads.get(id);
  if (!t) return null;
  const messages = [...store.messages.values()]
    .filter((m) => m.threadId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const senders: ThreadDetail["senders"] = agentSenders(messages);
  for (const m of messages) {
    if (!m.senderId || senders[m.senderId]) continue;
    const u = store.users.get(m.senderId);
    senders[m.senderId] = { name: u?.name ?? "User", hue: u?.avatarHue ?? "teal" };
  }
  return { thread: mockSummary(t), messages, senders };
}

export interface CreateThreadInput {
  clientId: string;
  subject: string;
  senderId: string;
  body: string;
}

export async function createThread(input: CreateThreadInput): Promise<Thread> {
  if (hasDb) {
    const rows = (await sql`
      INSERT INTO threads (client_id, subject, status, last_message_at)
      VALUES (${input.clientId}, ${input.subject}, 'open', now())
      RETURNING *
    `) as ThreadRow[];
    const thread = toThread(rows[0]);
    await sql`INSERT INTO messages (thread_id, sender_id, body) VALUES (${thread.id}, ${input.senderId}, ${input.body})`;
    return thread;
  }
  const now = new Date().toISOString();
  const thread: Thread = {
    id: mockId(),
    clientId: input.clientId,
    agentId: null, // staff compose always opens a client thread
    subject: input.subject,
    status: "open",
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };
  mockStore().threads.set(thread.id, thread);
  await postMessage(thread.id, input.senderId, input.body);
  return thread;
}

export async function postMessage(threadId: string, senderId: string, body: string): Promise<Message> {
  if (hasDb) {
    const rows = (await sql`
      INSERT INTO messages (thread_id, sender_id, body)
      VALUES (${threadId}, ${senderId}, ${body})
      RETURNING *
    `) as MessageRow[];
    await sql`UPDATE threads SET last_message_at = now(), updated_at = now() WHERE id = ${threadId}`;
    return toMessage(rows[0]);
  }
  const now = new Date().toISOString();
  const message: Message = { id: mockId(), threadId, senderId, senderAgentId: null, body, readAt: null, createdAt: now };
  const store = mockStore();
  store.messages.set(message.id, message);
  const t = store.threads.get(threadId);
  if (t) store.threads.set(threadId, { ...t, lastMessageAt: now, updatedAt: now });
  return message;
}

/** Mark every message in the thread NOT sent by `userId` as read. */
export async function markRead(threadId: string, userId: string): Promise<void> {
  if (hasDb) {
    await sql`
      UPDATE messages SET read_at = now()
      WHERE thread_id = ${threadId} AND read_at IS NULL AND sender_id <> ${userId}
    `;
    return;
  }
  const store = mockStore();
  const now = new Date().toISOString();
  for (const m of store.messages.values()) {
    if (m.threadId === threadId && !m.readAt && m.senderId !== userId) {
      store.messages.set(m.id, { ...m, readAt: now });
    }
  }
}

export async function setThreadStatus(id: string, status: ThreadStatus): Promise<Thread | null> {
  if (hasDb) {
    const rows = (await sql`
      UPDATE threads SET status = ${status}, updated_at = now() WHERE id = ${id} RETURNING *
    `) as ThreadRow[];
    return rows[0] ? toThread(rows[0]) : null;
  }
  const store = mockStore();
  const t = store.threads.get(id);
  if (!t) return null;
  const next = { ...t, status, updatedAt: new Date().toISOString() };
  store.threads.set(id, next);
  return next;
}

// ── client lookups (local joins, like notes.ts authorNames) ──────────────────

/** The client record linked to a portal login (clients.user_id). */
export async function clientForUser(userId: string): Promise<Client | null> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM clients WHERE user_id = ${userId} LIMIT 1`) as Array<Record<string, unknown>>;
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id as string,
      userId: r.user_id as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      dob: isoDateOnly(r.dob as string | Date | null),
      email: r.email as string | null,
      phone: r.phone as string | null,
      address: r.address as string | null,
      gender: r.gender as string | null,
      pronouns: r.pronouns as string | null,
      status: r.status as Client["status"],
      tags: (r.tags as string[]) ?? [],
      primaryPractitionerId: r.primary_practitioner_id as string | null,
      photonPatientId: (r.photon_patient_id as string | null) ?? null,
      createdAt: isoDateTime(r.created_at as string | Date),
      updatedAt: isoDateTime(r.updated_at as string | Date),
    };
  }
  return [...mockStore().clients.values()].find((c) => c.userId === userId) ?? null;
}

/** Non-archived clients for compose/send Selects: id + display name. */
export async function threadClients(): Promise<Array<{ id: string; name: string }>> {
  if (hasDb) {
    const rows = (await sql`
      SELECT id, first_name, last_name FROM clients
      WHERE status <> 'archived' ORDER BY first_name, last_name
    `) as Array<{ id: string; first_name: string; last_name: string }>;
    return rows.map((r) => ({ id: r.id, name: `${r.first_name} ${r.last_name}` }));
  }
  return [...mockStore().clients.values()]
    .filter((c) => c.status !== "archived")
    .sort((a, b) => a.firstName.localeCompare(b.firstName))
    .map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` }));
}
