// Clinical domain — reads/writes the HIPAA-enabled project (see lib/db.ts).
import { hasPhiDb as hasDb, sqlPhi as sql } from "@/lib/db";
import { isoDateTime } from "@/lib/format";
import { headshotFor } from "@/lib/headshots";
import { mockId, mockStore } from "@/lib/mock";
import "@/lib/mock/services";
import type { Availability, AvatarHue, Location, LocationKind, Service } from "@/lib/types";

// Scheduling catalog repo — services, locations, weekly availability,
// practitioner directory. hasDb → Postgres; otherwise the mock store.

type ServiceRow = {
  id: string;
  name: string;
  duration_min: number;
  price_cents: number;
  color: string;
  telehealth: boolean;
  active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

function toService(r: ServiceRow): Service {
  return {
    id: r.id,
    name: r.name,
    durationMin: r.duration_min,
    priceCents: r.price_cents,
    color: r.color,
    telehealth: r.telehealth,
    active: r.active,
    createdAt: isoDateTime(r.created_at),
    updatedAt: isoDateTime(r.updated_at),
  };
}

type LocationRow = {
  id: string;
  name: string;
  address: string | null;
  kind: LocationKind;
  created_at: string | Date;
  updated_at: string | Date;
};

function toLocation(r: LocationRow): Location {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    kind: r.kind,
    createdAt: isoDateTime(r.created_at),
    updatedAt: isoDateTime(r.updated_at),
  };
}

type AvailabilityRow = {
  id: string;
  practitioner_id: string;
  weekday: number;
  start_time: string; // Postgres TIME → "09:00:00"
  end_time: string;
  created_at: string | Date;
  updated_at: string | Date;
};

const hhmm = (t: string) => t.slice(0, 5);

function toAvailability(r: AvailabilityRow): Availability {
  return {
    id: r.id,
    practitionerId: r.practitioner_id,
    weekday: r.weekday,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    createdAt: isoDateTime(r.created_at),
    updatedAt: isoDateTime(r.updated_at),
  };
}

// ── services ──────────────────────────────────────────────────────────────────

export async function listServices(): Promise<Service[]> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM services ORDER BY name`) as ServiceRow[];
    return rows.map(toService);
  }
  return [...mockStore().services.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getService(id: string): Promise<Service | null> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM services WHERE id = ${id}`) as ServiceRow[];
    return rows[0] ? toService(rows[0]) : null;
  }
  return mockStore().services.get(id) ?? null;
}

export interface CreateServiceInput {
  name: string;
  durationMin: number;
  priceCents: number;
  color: string;
  telehealth?: boolean;
  active?: boolean;
}

export async function createService(input: CreateServiceInput): Promise<Service> {
  const telehealth = input.telehealth ?? false;
  const active = input.active ?? true;
  if (hasDb) {
    const rows = (await sql`
      INSERT INTO services (name, duration_min, price_cents, color, telehealth, active)
      VALUES (${input.name}, ${input.durationMin}, ${input.priceCents}, ${input.color}, ${telehealth}, ${active})
      RETURNING *
    `) as ServiceRow[];
    return toService(rows[0]);
  }
  const now = new Date().toISOString();
  const svc: Service = {
    id: mockId(),
    name: input.name,
    durationMin: input.durationMin,
    priceCents: input.priceCents,
    color: input.color,
    telehealth,
    active,
    createdAt: now,
    updatedAt: now,
  };
  mockStore().services.set(svc.id, svc);
  return svc;
}

export async function updateService(
  id: string,
  patch: Partial<CreateServiceInput>,
): Promise<Service | null> {
  const existing = await getService(id);
  if (!existing) return null;
  const next: Service = {
    ...existing,
    name: patch.name ?? existing.name,
    durationMin: patch.durationMin ?? existing.durationMin,
    priceCents: patch.priceCents ?? existing.priceCents,
    color: patch.color ?? existing.color,
    telehealth: patch.telehealth ?? existing.telehealth,
    active: patch.active ?? existing.active,
    updatedAt: new Date().toISOString(),
  };
  if (hasDb) {
    const rows = (await sql`
      UPDATE services SET name = ${next.name}, duration_min = ${next.durationMin},
        price_cents = ${next.priceCents}, color = ${next.color},
        telehealth = ${next.telehealth}, active = ${next.active}, updated_at = now()
      WHERE id = ${id} RETURNING *
    `) as ServiceRow[];
    return rows[0] ? toService(rows[0]) : null;
  }
  mockStore().services.set(id, next);
  return next;
}

/** "Delete" = deactivate — appointments keep their FK; inactive services stop being bookable. */
export async function deleteService(id: string): Promise<boolean> {
  const updated = await updateService(id, { active: false });
  return !!updated;
}

// ── locations ─────────────────────────────────────────────────────────────────

export async function listLocations(): Promise<Location[]> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM locations ORDER BY name`) as LocationRow[];
    return rows.map(toLocation);
  }
  return [...mockStore().locations.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface CreateLocationInput {
  name: string;
  address?: string | null;
  kind: LocationKind;
}

export async function createLocation(input: CreateLocationInput): Promise<Location> {
  if (hasDb) {
    const rows = (await sql`
      INSERT INTO locations (name, address, kind)
      VALUES (${input.name}, ${input.address ?? null}, ${input.kind})
      RETURNING *
    `) as LocationRow[];
    return toLocation(rows[0]);
  }
  const now = new Date().toISOString();
  const loc: Location = {
    id: mockId(),
    name: input.name,
    address: input.address ?? null,
    kind: input.kind,
    createdAt: now,
    updatedAt: now,
  };
  mockStore().locations.set(loc.id, loc);
  return loc;
}

export async function updateLocation(
  id: string,
  patch: Partial<CreateLocationInput>,
): Promise<Location | null> {
  if (hasDb) {
    const rows = (await sql`SELECT * FROM locations WHERE id = ${id}`) as LocationRow[];
    if (!rows[0]) return null;
    const cur = toLocation(rows[0]);
    const updated = (await sql`
      UPDATE locations SET name = ${patch.name ?? cur.name},
        address = ${patch.address === undefined ? cur.address : patch.address},
        kind = ${patch.kind ?? cur.kind}, updated_at = now()
      WHERE id = ${id} RETURNING *
    `) as LocationRow[];
    return updated[0] ? toLocation(updated[0]) : null;
  }
  const cur = mockStore().locations.get(id);
  if (!cur) return null;
  const next: Location = {
    ...cur,
    name: patch.name ?? cur.name,
    address: patch.address === undefined ? cur.address : patch.address,
    kind: patch.kind ?? cur.kind,
    updatedAt: new Date().toISOString(),
  };
  mockStore().locations.set(id, next);
  return next;
}

export async function deleteLocation(id: string): Promise<boolean> {
  if (hasDb) {
    // Appointments referencing the location keep history: null the FK first.
    await sql`UPDATE appointments SET location_id = NULL WHERE location_id = ${id}`;
    const rows = (await sql`DELETE FROM locations WHERE id = ${id} RETURNING id`) as Array<{ id: string }>;
    return rows.length > 0;
  }
  const store = mockStore();
  if (!store.locations.has(id)) return false;
  for (const [aid, a] of store.appointments) {
    if (a.locationId === id) store.appointments.set(aid, { ...a, locationId: null });
  }
  return store.locations.delete(id);
}

// ── availability ──────────────────────────────────────────────────────────────

export async function listAvailability(practitionerId?: string): Promise<Availability[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT * FROM availability
      WHERE (${practitionerId ?? null}::uuid IS NULL OR practitioner_id = ${practitionerId ?? null})
      ORDER BY practitioner_id, weekday, start_time
    `) as AvailabilityRow[];
    return rows.map(toAvailability);
  }
  return [...mockStore().availability.values()]
    .filter((a) => !practitionerId || a.practitionerId === practitionerId)
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
}

export interface AvailabilityRule {
  weekday: number; // 0–6, Sunday = 0
  startTime: string; // HH:MM
  endTime: string;
}

/** Replace a practitioner's full weekly rule set (the availability editor saves whole weeks). */
export async function replaceAvailability(
  practitionerId: string,
  rules: AvailabilityRule[],
): Promise<Availability[]> {
  if (hasDb) {
    await sql`DELETE FROM availability WHERE practitioner_id = ${practitionerId}`;
    for (const r of rules) {
      await sql`
        INSERT INTO availability (practitioner_id, weekday, start_time, end_time)
        VALUES (${practitionerId}, ${r.weekday}, ${r.startTime}, ${r.endTime})
      `;
    }
    return listAvailability(practitionerId);
  }
  const store = mockStore();
  for (const [id, a] of store.availability) {
    if (a.practitionerId === practitionerId) store.availability.delete(id);
  }
  const now = new Date().toISOString();
  for (const r of rules) {
    const rule: Availability = {
      id: mockId(),
      practitionerId,
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      createdAt: now,
      updatedAt: now,
    };
    store.availability.set(rule.id, rule);
  }
  return listAvailability(practitionerId);
}

// ── practitioners (directory for calendar filters / booking) ──────────────────

export interface PractitionerLite {
  id: string;
  name: string;
  avatarHue: AvatarHue;
  slug: string | null;
  /** Real photo when we have one on file — see lib/headshots.ts. */
  photoUrl: string | null;
}

export async function listPractitioners(): Promise<PractitionerLite[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT id, name, avatar_hue, slug FROM users
      WHERE role IN ('practitioner','admin') AND deleted_at IS NULL
      ORDER BY name
    `) as Array<{ id: string; name: string; avatar_hue: AvatarHue; slug: string | null }>;
    return rows.map((r) => ({ id: r.id, name: r.name, avatarHue: r.avatar_hue, slug: r.slug, photoUrl: headshotFor(r.id) }));
  }
  return [...mockStore().users.values()]
    .filter((u) => (u.role === "practitioner" || u.role === "admin") && !u.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => ({ id: u.id, name: u.name, avatarHue: u.avatarHue, slug: u.slug, photoUrl: headshotFor(u.id) }));
}

/**
 * Who the public may book: clinicians only. The admin account is a user with a
 * calendar, not a clinician, and must never be offered as one — the MCP roster
 * and the public booking page both read this, not listPractitioners().
 */
export async function listBookablePractitioners(): Promise<PractitionerLite[]> {
  if (hasDb) {
    const rows = (await sql`
      SELECT id, name, avatar_hue, slug FROM users
      WHERE role = 'practitioner' AND deleted_at IS NULL
      ORDER BY name
    `) as Array<{ id: string; name: string; avatar_hue: AvatarHue; slug: string | null }>;
    return rows.map((r) => ({ id: r.id, name: r.name, avatarHue: r.avatar_hue, slug: r.slug, photoUrl: headshotFor(r.id) }));
  }
  return [...mockStore().users.values()]
    .filter((u) => u.role === "practitioner" && !u.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) => ({ id: u.id, name: u.name, avatarHue: u.avatarHue, slug: u.slug, photoUrl: headshotFor(u.id) }));
}

/** Public profile lookup — /providers/[slug]. Read-only; slugs are seeded once, not written here. */
export async function getPractitionerBySlug(slug: string): Promise<PractitionerLite | null> {
  if (hasDb) {
    const rows = (await sql`
      SELECT id, name, avatar_hue, slug FROM users
      WHERE role IN ('practitioner','admin') AND deleted_at IS NULL AND slug = ${slug}
    `) as Array<{ id: string; name: string; avatar_hue: AvatarHue; slug: string | null }>;
    const r = rows[0];
    return r ? { id: r.id, name: r.name, avatarHue: r.avatar_hue, slug: r.slug, photoUrl: headshotFor(r.id) } : null;
  }
  const u = [...mockStore().users.values()].find(
    (u) => (u.role === "practitioner" || u.role === "admin") && !u.deletedAt && u.slug === slug,
  );
  return u ? { id: u.id, name: u.name, avatarHue: u.avatarHue, slug: u.slug, photoUrl: headshotFor(u.id) } : null;
}
