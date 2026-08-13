import { DEMO_PRACTITIONER_ID, registerFixtures } from "@/lib/mock";
import { slugify } from "@/lib/slug";
import type { AvatarHue, Availability, Location, Service } from "@/lib/types";

// Scheduling fixtures — services, locations, weekly availability. Mirrors
// sql/002_seed.sql (same uuids/values). The seed's practitioner
// …001001 (Brendan) maps to the mock demo login DEMO_PRACTITIONER_ID so the
// signed-in demo user owns his calendar; Priya keeps her seed uuid and is
// added to the users map here (foundation seeds only the two demo logins).

export const PRIYA_PRACTITIONER_ID = "00000000-0000-4000-8000-000000001002";
export const SHELLEY_PRACTITIONER_ID = "00000000-0000-4000-8000-000000001006";
export const JASON_PRACTITIONER_ID = "00000000-0000-4000-8000-000000001007";
export const OFFICE_LOCATION_ID = "00000000-0000-4000-8000-000000004001";
export const TELEHEALTH_LOCATION_ID = "00000000-0000-4000-8000-000000004002";

const at = "2026-06-01T09:00:00-04:00";

// Practitioners beyond the two demo logins — mirror sql/002_seed.sql (same
// uuids/hues). Foundation seeds only Brendan + Casey, so these are added here.
const EXTRA_PRACTITIONERS: Array<[id: string, name: string, email: string, hue: AvatarHue, phone: string]> = [
  [PRIYA_PRACTITIONER_ID, "Priya Raman", "priya@leuk.demo", "amber", "+1 212 555 0141"],
  ["00000000-0000-4000-8000-000000001004", "Lena Whitfield", "lena@leuk.demo", "pink", "+1 212 555 0143"],
  ["00000000-0000-4000-8000-000000001005", "Marcus Bell", "marcus@leuk.demo", "blue", "+1 212 555 0142"],
  [SHELLEY_PRACTITIONER_ID, "Dr. Shelley Padgett", "shelley@leuk.demo", "teal", "+1 212 555 0146"],
  [JASON_PRACTITIONER_ID, "Jason Hilario", "jason@leuk.demo", "pink", "+1 775 555 0161"],
];

const services: Array<[string, string, number, number, string, boolean]> = [
  // [id, name, durationMin, priceCents, color, telehealth]
  ["00000000-0000-4000-8000-000000003001", "Initial Evaluation", 60, 25000, "teal", false],
  ["00000000-0000-4000-8000-000000003002", "Follow-up", 30, 12500, "blue", false],
  ["00000000-0000-4000-8000-000000003003", "Therapy", 45, 17500, "amber", false],
  ["00000000-0000-4000-8000-000000003004", "Telehealth Check-in", 30, 7500, "pink", true],
  ["00000000-0000-4000-8000-000000003005", "Group Session", 90, 6000, "purple", false],
];

registerFixtures("services", (store) => {
  // same demo hash as the seeded logins (password "demo")
  const passwordHash = store.users.get(DEMO_PRACTITIONER_ID)?.passwordHash ?? "";
  for (const [id, name, email, avatarHue, phone] of EXTRA_PRACTITIONERS) {
    if (store.users.has(id)) continue;
    store.users.set(id, {
      id,
      role: "practitioner",
      name,
      email,
      passwordHash,
      avatarHue,
      phone,
      timezone: "America/New_York",
      slug: slugify(name),
      deletedAt: null,
      createdAt: at,
      updatedAt: at,
    });
  }

  for (const [id, name, durationMin, priceCents, color, telehealth] of services) {
    const svc: Service = {
      id,
      name,
      durationMin,
      priceCents,
      color,
      telehealth,
      active: true,
      createdAt: at,
      updatedAt: at,
    };
    store.services.set(id, svc);
  }

  const locations: Location[] = [
    {
      id: OFFICE_LOCATION_ID,
      name: "Union Square Office",
      address: "31 E 17th St, Suite 402, New York, NY 10003",
      kind: "office",
      createdAt: at,
      updatedAt: at,
    },
    {
      id: TELEHEALTH_LOCATION_ID,
      name: "Telehealth",
      address: null,
      kind: "telehealth",
      createdAt: at,
      updatedAt: at,
    },
  ];
  for (const l of locations) store.locations.set(l.id, l);

  // M–F 9–5 for both practitioners (seed rows 05001–05010)
  const practitioners = [DEMO_PRACTITIONER_ID, PRIYA_PRACTITIONER_ID];
  practitioners.forEach((practitionerId, p) => {
    for (let weekday = 1; weekday <= 5; weekday++) {
      const id = `00000000-0000-4000-8000-0000000050${String(p * 5 + weekday).padStart(2, "0")}`;
      const rule: Availability = {
        id,
        practitionerId,
        weekday,
        startTime: "09:00",
        endTime: "17:00",
        createdAt: at,
        updatedAt: at,
      };
      store.availability.set(id, rule);
    }
  });
});
