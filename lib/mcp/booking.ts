import { DATE_RE, TIME_RE, freeSlots } from "@/lib/booking";
import { appBaseUrl } from "@/lib/email";
import { getService, listBookablePractitioners } from "@/lib/repos/services";

// The Leuk MCP toolset — WRITE HALF, and the only file in lib/mcp that is
// allowed anywhere near PHI.
//
// ── Why this file is separate from tools.ts ──────────────────────────────────
// Reading the directory is public-record work. Booking is not: it creates a
// client row and an appointment, which is PHI in `sqlPhi`. Keeping the two in
// one module would make "the MCP server cannot read PHI" unverifiable, so the
// boundary checker treats lib/mcp/tools.ts as PHI-forbidden and this file as
// the one named exception.
//
// ── What this deliberately CANNOT do ─────────────────────────────────────────
// There is no read path here, by design. No looking a patient up, no listing
// anyone's appointments, no confirming whether an email is already a client.
// The only thing that crosses into the PHI database is a booking the person in
// the conversation just asked for, carrying only what they themselves supplied.
// `findOrCreateLeadClient` matches on email and would happily tell you whether
// that email is already a patient — so this tool NEVER reports which branch it
// took. "Booked" reads identically for a new lead and an existing client;
// anything else would turn a booking form into a patient-membership oracle.
//
// ── Why it is unauthenticated, and why that is not new exposure ──────────────
// This is exactly what POST /api/book already does for the public booking page
// at /book/[slug] — same validation, same slot re-check, same audit row, same
// confirmation email. The MCP tool is a second client for an endpoint that has
// always been open. It adds no capability; it adds a caller.
//
// The write goes through our own HTTP endpoint rather than importing
// createAppointment directly. That is not indirection for its own sake: the
// route also creates the insurance policy, provisions the portal account, sends
// the confirmation with the set-password link, and dispatches the intake form.
// Re-implementing that chain here would be a second booking path to keep in
// sync, and the day they diverged, MCP bookings would quietly stop onboarding
// anyone.

export type BookInput = {
  practitioner_id?: string;
  service_id?: string;
  date?: string;
  time?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
};

/** Open start times for one practitioner + service on one date. Read-only and
 *  reference-side: availability rules and busy blocks, never a patient name. */
export async function runGetAvailability(input: {
  practitioner_id?: string;
  service_id?: string;
  date?: string;
}) {
  const { practitioner_id: practitionerId, service_id: serviceId, date } = input;
  if (!practitionerId || !serviceId) {
    return { error: "practitioner_id and service_id are required. Call list_bookable first." };
  }
  if (!date || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD." };

  // getService throws on a malformed id (Postgres rejects a non-uuid), and a
  // model WILL pass "follow-up" here. A named error beats a generic failure.
  const service = await getService(serviceId).catch(() => null);
  if (!service || !service.active) {
    return { error: `No active service with id ${serviceId}. Use an id from list_bookable, not a name.` };
  }

  const slots = await freeSlots(practitionerId, service, date).catch(() => null);
  if (!slots) return { error: `No availability found for practitioner ${practitionerId}. Use an id from list_bookable.` };
  const practitioner = (await listBookablePractitioners().catch(() => []))
    .find((p) => p.id === practitionerId);
  return {
    date,
    practitioner_id: practitionerId,
    practitioner_name: practitioner?.name,
    service_id: serviceId,
    service: service.name,
    minutes: service.durationMin,
    telehealth: service.telehealth,
    open_times: slots,
    // The same booking, on Leuk's own page, with everything but the time
    // pre-filled — for people who would rather click than dictate.
    book_href: `/book/${practitioner?.slug ?? practitionerId}?service=${serviceId}&date=${date}`,
    note: slots.length
      ? "Times are local to the practice, 24-hour clock. Confirm one with the person before booking it."
      : "Nothing open that day. Try another date.",
  };
}

/**
 * Book it. Mirrors the public booking form exactly.
 *
 * Validation is duplicated here rather than deferred to the route so a model
 * gets a usable message ("date must be YYYY-MM-DD") instead of a 400 it has to
 * guess at, and so an obviously malformed call never reaches the database.
 */
export async function runBookAppointment(input: BookInput) {
  const str = (v: string | undefined) => (typeof v === "string" ? v.trim() : "");
  const practitionerId = str(input.practitioner_id);
  const serviceId = str(input.service_id);
  const date = str(input.date);
  const time = str(input.time);
  const firstName = str(input.first_name);
  const lastName = str(input.last_name);
  const email = str(input.email).toLowerCase();
  const phone = str(input.phone);

  if (!practitionerId || !serviceId) {
    return { error: "practitioner_id and service_id are required. Call list_bookable first." };
  }
  if (!DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD." };
  if (!TIME_RE.test(time)) return { error: "time must be HH:MM on a 24-hour clock, and must be one of the open_times from get_availability." };
  if (!firstName || !lastName) {
    return { error: "first_name and last_name are required. Ask the person for them — never guess a name." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid email is required. Ask the person for it — the confirmation and portal invitation go there." };
  }

  const res = await fetch(`${appBaseUrl()}/api/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-booked-via": "mcp" },
    body: JSON.stringify({
      practitionerId,
      serviceId,
      date,
      time,
      firstName,
      lastName,
      email,
      phone,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as { error?: string; appointment?: { startsAt?: string } };

  if (!res.ok) {
    // 409 is the one a model can actually act on: the slot went while they were
    // talking. Everything else is reported as given, since /api/book's messages
    // are already written for a person.
    return {
      booked: false,
      error: json.error ?? "The booking could not be completed.",
      retry: res.status === 409 ? "Call get_availability again and offer the person a different time." : undefined,
    };
  }

  // Deliberately uniform. No `created` flag, no client id, no indication of
  // whether this person was already known to the practice.
  return {
    booked: true,
    when: `${date} ${time}`,
    confirmation:
      "Booked. A confirmation email is on its way with the details and, for a first visit, a link to set up the patient portal.",
    manage_href: "/portal/appointments",
  };
}
