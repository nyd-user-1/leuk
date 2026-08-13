import bcrypt from "bcryptjs";
import { DEMO_CLIENT_USER_ID, DEMO_PRACTITIONER_ID, registerFixtures } from "@/lib/mock";
import type { Client, ClientStatus } from "@/lib/types";

// Mirrors sql/002_seed.sql — clients (02): same uuids, names, statuses, tags.
// Bridge to the foundation mock users: seed practitioner 00…1001 (Brendan) maps
// to DEMO_PRACTITIONER_ID and seed portal user 00…1003 (Casey) maps to
// DEMO_CLIENT_USER_ID; Priya (00…1002) is registered here so practitioner
// lookups and the practitioner Select work in mock mode.

export const PRIYA_PRACTITIONER_ID = "00000000-0000-4000-8000-000000001002";

const T = "2026-06-01T09:00:00.000Z";
const B = DEMO_PRACTITIONER_ID; // seed 00…1001
const P = PRIYA_PRACTITIONER_ID; // seed 00…1002

function row(
  id: string,
  userId: string | null,
  firstName: string,
  lastName: string,
  dob: string,
  email: string,
  phone: string,
  address: string | null,
  gender: string,
  pronouns: string,
  status: ClientStatus,
  tags: string[],
  primaryPractitionerId: string,
): Client {
  return {
    id: `00000000-0000-4000-8000-0000000020${id}`,
    userId,
    firstName,
    lastName,
    dob,
    email,
    phone,
    address,
    gender,
    pronouns,
    status,
    tags,
    primaryPractitionerId,
    photonPatientId: null, // mock mode never talks to Photon
    createdAt: T,
    updatedAt: T,
  };
}

const clients: Client[] = [
  row("01", DEMO_CLIENT_USER_ID, "Casey", "Morgan", "1994-03-18", "casey@leuk.demo", "+1 917 555 0182", "48 Carmine St, Apt 3B, New York, NY 10014", "Non-binary", "they/them", "active", ["portal", "anxiety", "weekly"], B),
  row("02", null, "Jordan", "Lee", "1988-11-02", "jordan.lee@example.com", "+1 646 555 0113", "210 E 14th St, New York, NY 10003", "Male", "he/him", "active", ["adhd", "monthly"], B),
  row("03", null, "Sam", "Whitaker", "1979-06-25", "sam.whitaker@example.com", "+1 718 555 0177", "77 Court St, Brooklyn, NY 11201", "Male", "he/him", "active", ["depression"], P),
  row("04", null, "Ava", "Delgado", "1991-01-09", "ava.delgado@example.com", "+1 347 555 0128", "133 Kent Ave, Brooklyn, NY 11249", "Female", "she/her", "active", ["anxiety", "superbill"], B),
  row("05", null, "Noah", "Kim", "2001-08-30", "noah.kim@example.com", "+1 929 555 0165", "501 W 110th St, New York, NY 10025", "Male", "he/him", "active", ["med-management"], P),
  row("06", null, "Ruth", "Okafor", "1968-04-12", "ruth.okafor@example.com", "+1 212 555 0154", "88 Greenwich St, New York, NY 10006", "Female", "she/her", "active", ["group", "insomnia"], P),
  row("07", null, "Liam", "Novak", "1996-12-07", "liam.novak@example.com", "+1 646 555 0192", "25-40 31st Ave, Astoria, NY 11106", "Male", "he/him", "active", ["telehealth"], B),
  row("08", null, "Maya", "Patel", "1985-09-21", "maya.patel@example.com", "+1 917 555 0136", "300 Cathedral Pkwy, New York, NY 10026", "Female", "she/her", "active", ["telehealth", "ptsd"], B),
  row("09", null, "Eli", "Rosen", "1999-02-14", "eli.rosen@example.com", "+1 718 555 0121", null, "Male", "he/him", "lead", ["referral", "intake-pending"], P),
  row("10", null, "Grace", "Tanaka", "1993-07-04", "grace.tanaka@example.com", "+1 347 555 0119", null, "Female", "she/her", "lead", ["website-inquiry"], P),
  row("11", null, "Victor", "Hughes", "1972-10-16", "victor.hughes@example.com", "+1 212 555 0108", "420 Riverside Dr, New York, NY 10025", "Male", "he/him", "archived", ["moved-away"], B),
  row("12", null, "Nina", "Petrov", "1990-05-27", "nina.petrov@example.com", "+1 929 555 0173", null, "Female", "she/her", "archived", ["completed-care"], P),
  // Leads carry no address: nobody has taken an intake yet.
  row("13", null, "Omar", "Haddad", "1987-03-22", "omar.haddad@example.com", "+1 718 555 0146", null, "Male", "he/him", "lead", ["referral", "intake-pending"], P),
  row("14", null, "Tessa", "Byrne", "1995-11-13", "tessa.byrne@example.com", "+1 917 555 0158", null, "Female", "she/her", "lead", ["online-booking"], B),
  row("15", null, "Dmitri", "Volkov", "1981-06-08", "dmitri.volkov@example.com", "+1 347 555 0184", "55 Bay Ridge Ave, Brooklyn, NY 11220", "Male", "he/him", "archived", ["completed-care"], B),
  row("16", null, "Aisha", "Rahman", "1992-09-30", "aisha.rahman@example.com", "+1 929 555 0167", "37-15 74th St, Jackson Heights, NY 11372", "Female", "she/her", "archived", ["moved-away"], P),
  row("17", null, "Colin", "Fitzgerald", "1975-01-19", "colin.fitzgerald@example.com", "+1 212 555 0193", "190 Bleecker St, New York, NY 10012", "Male", "he/him", "archived", ["completed-care", "superbill"], B),
];

registerFixtures("clients", (store) => {
  for (const c of clients) store.clients.set(c.id, c);
  if (!store.users.has(PRIYA_PRACTITIONER_ID)) {
    store.users.set(PRIYA_PRACTITIONER_ID, {
      id: PRIYA_PRACTITIONER_ID,
      role: "practitioner",
      name: "Priya Raman",
      email: "priya@leuk.demo",
      passwordHash: bcrypt.hashSync("demo", 10),
      avatarHue: "amber",
      phone: "+1 212 555 0141",
      timezone: "America/New_York",
      slug: "priya-raman",
      deletedAt: null,
      createdAt: T,
      updatedAt: T,
    });
  }
});
