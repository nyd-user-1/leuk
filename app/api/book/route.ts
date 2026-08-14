import { NextResponse } from "next/server";
import { logEvent } from "@/lib/audit";
import { createPasswordToken, ensureClientPortalUser } from "@/lib/auth";
import { DATE_RE, TIME_RE, freeSlots, localDate, toMin } from "@/lib/booking";
import { appBaseUrl, sendBookingConfirmation } from "@/lib/email";
import { createAppointment, findOrCreateLeadClient, type ClientLite } from "@/lib/repos/appointments";
import { getIntakeForm, listResponses, sendForm } from "@/lib/repos/forms";
import { authorNames } from "@/lib/repos/notes";
import { createPolicy } from "@/lib/repos/policies";
import { getService, listLocations } from "@/lib/repos/services";
import type { Service } from "@/lib/types";

export const dynamic = "force-dynamic";

// Public booking endpoint (no auth — the /book/[slug] page).
// GET  ?practitionerId&serviceId&date=YYYY-MM-DD → { slots: ["09:00", …] }
//      free start times via lib/booking (shared with portal reschedule).
// POST { practitionerId, serviceId, date, time, firstName, lastName, email, phone?, payerId? }
//      → creates client-if-new (status lead) + appointment (booked_via link),
//      then onboards them: insurance policy if payerId given, a portal
//      account + emailed booking confirmation (with a one-time set-password
//      link for new accounts) if they don't have one yet, and the New Client
//      Intake form. None of these three can fail the booking itself — a
//      booking that succeeds but couldn't send an email is still a booking;
//      each is independently best-effort.

/**
 * Everything a first-time booking should kick off besides the appointment
 * itself. Each step is independently best-effort — a failure here is logged
 * to the server console and swallowed, never surfaced to the booking response.
 */
async function onboardClient(opts: {
  client: ClientLite;
  practitionerId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  payerId: string;
  service: Service;
  startsAt: string;
  endsAt: string;
  locationLabel: string | null;
}): Promise<void> {
  const { client } = opts;

  if (opts.payerId) {
    try {
      await createPolicy({ clientId: client.id, payerId: opts.payerId, memberId: "", kind: "primary", status: "unverified" });
    } catch (e) {
      console.error("onboardClient: insurance policy failed", e);
    }
  }

  let setPasswordUrl: string | null = null;
  if (!client.userId) {
    try {
      const portal = await ensureClientPortalUser({
        clientId: client.id,
        email: opts.email,
        name: `${opts.firstName} ${opts.lastName}`,
        phone: opts.phone || null,
      });
      if (portal?.created) {
        const token = await createPasswordToken(portal.userId, "set");
        setPasswordUrl = `${appBaseUrl()}/set-password?token=${token}`;
        await logEvent({
          actorId: null,
          action: "user.portal_invite",
          entity: "user",
          entityId: portal.userId,
          meta: { via: "booking-portal-provision", clientId: client.id },
        });
      }
    } catch (e) {
      console.error("onboardClient: portal provisioning failed", e);
    }
  }

  try {
    const names = await authorNames([opts.practitionerId]);
    await sendBookingConfirmation({
      to: opts.email,
      firstName: opts.firstName,
      serviceName: opts.service.name,
      practitionerName: names[opts.practitionerId] ?? "your practitioner",
      startsAt: opts.startsAt,
      endsAt: opts.endsAt,
      locationLabel: opts.locationLabel,
      telehealth: opts.service.telehealth,
      setPasswordUrl,
    });
  } catch (e) {
    console.error("onboardClient: confirmation email failed", e);
  }

  try {
    const intake = await getIntakeForm();
    if (intake) {
      const already = await listResponses({ clientId: client.id, formId: intake.id });
      if (already.length === 0) await sendForm(intake.id, client.id);
    }
  } catch (e) {
    console.error("onboardClient: intake form send failed", e);
  }
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const practitionerId = p.get("practitionerId") ?? "";
  const serviceId = p.get("serviceId") ?? "";
  const date = p.get("date") ?? "";
  if (!practitionerId || !serviceId || !DATE_RE.test(date)) {
    return NextResponse.json({ error: "practitionerId, serviceId and date are required." }, { status: 400 });
  }
  const service = await getService(serviceId);
  if (!service || !service.active) return NextResponse.json({ error: "Service not found." }, { status: 404 });
  try {
    return NextResponse.json({ slots: await freeSlots(practitionerId, service, date) });
  } catch {
    return NextResponse.json({ error: "Could not load availability." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const practitionerId = s("practitionerId");
  const serviceId = s("serviceId");
  const date = s("date");
  const time = s("time");
  const firstName = s("firstName");
  const lastName = s("lastName");
  const email = s("email").toLowerCase();
  const phone = s("phone");
  const payerId = s("payerId"); // "" = self-pay/cash, no policy created

  // Attribution only — never authorization. The MCP server sets this header so
  // its bookings are countable (sql/075 widened booked_via); a forged header
  // buys nothing, because the route grants exactly the same thing either way.
  const viaMcp = req.headers.get("x-booked-via") === "mcp";

  if (!practitionerId || !serviceId) {
    return NextResponse.json({ error: "Pick a service." }, { status: 400 });
  }
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
    return NextResponse.json({ error: "Pick a date and time." }, { status: 400 });
  }
  if (!firstName || !lastName) {
    return NextResponse.json({ error: "Your first and last name are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const service = await getService(serviceId);
  if (!service || !service.active) return NextResponse.json({ error: "Service not found." }, { status: 404 });

  try {
    // The slot must still be free (someone may have booked it meanwhile).
    const slots = await freeSlots(practitionerId, service, date);
    if (!slots.includes(time)) {
      return NextResponse.json({ error: "That time was just taken — please pick another slot." }, { status: 409 });
    }

    const { client, created } = await findOrCreateLeadClient({
      firstName,
      lastName,
      email,
      phone: phone || null,
      practitionerId,
    });
    if (created) {
      await logEvent({
        actorId: null,
        action: "client.create",
        entity: "client",
        entityId: client.id,
        meta: { via: "booking-link" },
      });
    }

    const startMin = toMin(time);
    const locations = await listLocations();
    const location =
      locations.find((l) => (service.telehealth ? l.kind === "telehealth" : l.kind === "office")) ??
      locations[0] ?? null;

    const appointment = await createAppointment({
      clientId: client.id,
      practitionerId,
      serviceId,
      locationId: location?.id ?? null,
      startsAt: localDate(date, startMin).toISOString(),
      endsAt: localDate(date, startMin + service.durationMin).toISOString(),
      bookedVia: viaMcp ? "mcp" : "link",
      notesBrief: viaMcp ? "Booked through an assistant (MCP)" : "Booked via public booking link",
    });
    await logEvent({
      actorId: null,
      action: "appointment.book",
      entity: "appointment",
      entityId: appointment.id,
      meta: { via: "booking-link", serviceId, startsAt: appointment.startsAt },
    });

    await onboardClient({
      client,
      practitionerId,
      firstName,
      lastName,
      email,
      phone,
      payerId,
      service,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      locationLabel: location?.name ?? null,
    });

    return NextResponse.json({ ok: true, appointment: { id: appointment.id, startsAt: appointment.startsAt, endsAt: appointment.endsAt } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not complete your booking. Please try again." }, { status: 500 });
  }
}
