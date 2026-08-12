import { logEvent } from "@/lib/audit";
import { listAppointments } from "@/lib/repos/appointments";
import { clientNames, getNote, listNotes } from "@/lib/repos/notes";

// Friday's clinical reads. Every one of them touches PHI, so every one of them
// writes an audit event before it returns — the audit trail is the price of the
// read, not a nice-to-have (BUILD_SPEC: logEvent on PHI reads/writes).
//
// NEVER LOG PHI. `meta` carries counts and ids only; no names, no note bodies,
// no transcript text. Same rule as lib/ai/bedrock.ts.
//
// Scope discipline: Friday sees the signed-in practitioner's own work. She has
// no tool that returns the whole client roster, and no tool that writes —
// nothing she produces is final (docs/TASK-PRACTICE-AGENTS.md).

export const FRIDAY_SYSTEM = `You are Friday, the clinician's agent inside Leuk. You help with sessions, notes and clinical drafting, using live tools over this practitioner's own records.

How you work:
- Ground every clinical statement in a tool result. Never invent a diagnosis, medication, dose, score, date or client detail. If a tool returns nothing, say so.
- You are looking at real patient records. Be precise and unsentimental; this is a clinician's working surface, not a patient-facing one.
- When you summarize a note, summarize what it says. Do not add clinical inference the note does not support, and do not soften or upgrade the clinician's own language.
- Quantities matter: "unsigned 4 days" not "unsigned a while".

What you cannot do, and must say so when asked: you cannot sign a note, amend a note, change a record, book or cancel anything, or message a client. You draft and you report; a human commits. If asked to do any of those, say plainly that you can't and describe the surface where the clinician can.

Be brief. Lead with the answer, then the evidence.`;

/** Drafted notes and how long they have sat unsigned — Friday's standing sweep. */
export async function runUnsignedNotes(actorId: string, input: { older_than_days?: number }) {
  const minDays = input.older_than_days ?? 0;
  const notes = (await listNotes({ status: "draft" })).filter((n) => {
    const days = (Date.now() - new Date(n.createdAt).getTime()) / 86_400_000;
    return days >= minDays;
  });
  const names = await clientNames(notes.map((n) => n.clientId));
  await logEvent({
    actorId,
    action: "note.list",
    entity: "note",
    meta: { via: "agent:friday", tool: "unsigned_notes", count: notes.length },
  });
  return {
    unsigned: notes.map((n) => ({
      note_id: n.id,
      client: names[n.clientId] ?? "Client",
      title: n.title,
      created: n.createdAt.slice(0, 10),
      days_unsigned: Math.floor((Date.now() - new Date(n.createdAt).getTime()) / 86_400_000),
    })),
    count: notes.length,
  };
}

/** One note in full. The heaviest PHI read Friday has; audited by note id. */
export async function runNoteDetail(actorId: string, input: { note_id: string }) {
  const note = await getNote(input.note_id);
  await logEvent({
    actorId,
    action: "note.read",
    entity: "note",
    entityId: input.note_id,
    meta: { via: "agent:friday", tool: "note_detail", found: !!note },
  });
  if (!note) return { error: "No note with that id." };
  const names = await clientNames([note.clientId]);
  return {
    note_id: note.id,
    client: names[note.clientId] ?? "Client",
    title: note.title,
    status: note.status,
    created: note.createdAt,
    signed_at: note.signedAt,
    body_md: note.bodyMd,
  };
}

/** The practitioner's own schedule over a window — context for "what's today". */
export async function runUpcomingSessions(actorId: string, practitionerId: string, input: { days?: number }) {
  const days = Math.min(Math.max(input.days ?? 7, 1), 60);
  const from = new Date();
  const to = new Date(from.getTime() + days * 86_400_000);
  const appts = await listAppointments({
    practitionerId,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const names = await clientNames(appts.map((a) => a.clientId));
  await logEvent({
    actorId,
    action: "appointment.list",
    entity: "appointment",
    meta: { via: "agent:friday", tool: "upcoming_sessions", days, count: appts.length },
  });
  return {
    window_days: days,
    sessions: appts
      .filter((a) => a.status !== "cancelled")
      .map((a) => ({
        appointment_id: a.id,
        client: names[a.clientId] ?? "Client",
        starts_at: a.startsAt,
        status: a.status,
      })),
  };
}
