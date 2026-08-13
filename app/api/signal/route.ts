import { NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Minimal in-memory WebRTC signaling for 1-on-1 telehealth calls.
//
//   POST { room, peerId, type: join|leave|offer|answer|candidate, payload? }
//     → appends the event to every OTHER peer's queue in the room.
//       "join" replies with { peers: [...] } — the ids already present — so
//       the caller knows its negotiation role (existing peers ⇒ you offer).
//   GET  ?room=&peerId=&since=
//     → returns that peer's queued events with seq > since (acked events are
//       pruned) and refreshes the peer's liveness.
//
// State lives on globalThis so Next dev HMR doesn't wipe rooms. Single
// process only — fine for the local demo; a real deploy swaps this for a
// shared store or a WebSocket service.

const TYPES = ["join", "leave", "offer", "answer", "candidate"] as const;
type SignalType = (typeof TYPES)[number];

interface SignalEvent {
  seq: number;
  type: SignalType;
  from: string;
  payload: unknown;
}

interface Peer {
  queue: SignalEvent[];
  lastSeen: number;
}

interface Room {
  seq: number;
  peers: Map<string, Peer>;
  touchedAt: number;
}

const g = globalThis as typeof globalThis & { __leukSignalRooms?: Map<string, Room> };
const rooms = (g.__leukSignalRooms ??= new Map<string, Room>());

const ROOM_TTL_MS = 60 * 60 * 1000; // idle rooms evaporate after an hour
const PEER_TTL_MS = 15 * 1000; // a peer that stops polling is a ghost after 15s

/** Drop idle rooms and ghost peers (e.g. a closed tab that never sent leave). */
function sweep(now: number): void {
  for (const [id, room] of rooms) {
    if (now - room.touchedAt > ROOM_TTL_MS) {
      rooms.delete(id);
      continue;
    }
    for (const [pid, peer] of room.peers) {
      if (now - peer.lastSeen > PEER_TTL_MS) room.peers.delete(pid);
    }
    if (room.peers.size === 0 && now - room.touchedAt > PEER_TTL_MS) rooms.delete(id);
  }
}

function broadcast(room: Room, from: string, type: SignalType, payload: unknown): void {
  for (const [pid, peer] of room.peers) {
    if (pid === from) continue;
    peer.queue.push({ seq: ++room.seq, type, from, payload });
  }
}

export async function POST(req: Request) {
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let body: { room?: unknown; peerId?: unknown; type?: unknown; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { room: roomId, peerId, type, payload } = body;
  if (
    typeof roomId !== "string" ||
    !roomId ||
    roomId.length > 128 ||
    typeof peerId !== "string" ||
    !peerId ||
    peerId.length > 64 ||
    !TYPES.includes(type as SignalType)
  ) {
    return NextResponse.json({ error: "Expected { room, peerId, type: join|leave|offer|answer|candidate }." }, { status: 400 });
  }

  const now = Date.now();
  sweep(now);

  if (type === "join") {
    let room = rooms.get(roomId);
    if (!room) {
      room = { seq: 0, peers: new Map(), touchedAt: now };
      rooms.set(roomId, room);
    }
    room.touchedAt = now;
    room.peers.delete(peerId); // rejoin resets any stale queue
    const others = [...room.peers.keys()];
    room.peers.set(peerId, { queue: [], lastSeen: now });
    broadcast(room, peerId, "join", payload ?? null);
    return NextResponse.json({ ok: true, peers: others });
  }

  const room = rooms.get(roomId);
  if (!room || !room.peers.has(peerId)) {
    return NextResponse.json({ error: "Not in this room — send join first." }, { status: 404 });
  }
  room.touchedAt = now;
  const self = room.peers.get(peerId);
  if (self) self.lastSeen = now;

  broadcast(room, peerId, type as SignalType, payload ?? null);

  if (type === "leave") {
    room.peers.delete(peerId);
    if (room.peers.size === 0) rooms.delete(roomId);
  }
  return NextResponse.json({ ok: true, seq: room.seq });
}

export async function GET(req: Request) {
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const url = new URL(req.url);
  const roomId = url.searchParams.get("room") ?? "";
  const peerId = url.searchParams.get("peerId") ?? "";
  const since = Number(url.searchParams.get("since") ?? 0) || 0;
  if (!roomId || !peerId) {
    return NextResponse.json({ error: "Expected ?room=&peerId=&since=." }, { status: 400 });
  }

  const now = Date.now();
  sweep(now);

  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);
  if (!room || !peer) return NextResponse.json({ events: [], seq: since });

  room.touchedAt = now;
  peer.lastSeen = now;
  peer.queue = peer.queue.filter((e) => e.seq > since); // prune acked
  return NextResponse.json({ events: peer.queue, seq: room.seq });
}
