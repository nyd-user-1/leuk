import bcrypt from "bcryptjs";
import type {
  Appointment,
  AuditEvent,
  Availability,
  Client,
  DirectoryProgram,
  DirectoryProvider,
  FileRecord,
  Form,
  FormResponse,
  InsurancePolicy,
  Invoice,
  InvoiceItem,
  Location,
  Message,
  Note,
  NoteAmendment,
  NoteTemplate,
  PasswordToken,
  Payer,
  Payment,
  ProviderApplication,
  ProviderLead,
  ProviderProfile,
  Referral,
  Service,
  Session,
  Thread,
  Transcript,
  User,
} from "@/lib/types";

// In-memory mock store — the zero-env demo database. One module-scoped
// singleton per process (stashed on globalThis so Next dev HMR doesn't wipe
// state between recompiles). Mutable: repos write straight into the maps so
// demo CRUD works.
//
// Foundation seeds ONLY the demo logins. Feature agents own their domain
// fixtures: create lib/mock/<domain>.ts that calls
//
//   registerFixtures("appointments", (store) => { store.appointments.set(…) });
//
// at module scope, then import that module from your repo. Each named
// registration runs exactly once per process, whatever the import order.

export interface MockStore {
  users: Map<string, User>;
  clients: Map<string, Client>;
  services: Map<string, Service>;
  locations: Map<string, Location>;
  availability: Map<string, Availability>;
  appointments: Map<string, Appointment>;
  notes: Map<string, Note>;
  noteAmendments: Map<string, NoteAmendment>;
  noteTemplates: Map<string, NoteTemplate>;
  transcripts: Map<string, Transcript>;
  forms: Map<string, Form>;
  formResponses: Map<string, FormResponse>;
  invoices: Map<string, Invoice>;
  invoiceItems: Map<string, InvoiceItem>;
  payments: Map<string, Payment>;
  payers: Map<string, Payer>;
  insurancePolicies: Map<string, InsurancePolicy>;
  threads: Map<string, Thread>;
  messages: Map<string, Message>;
  files: Map<string, FileRecord>;
  auditEvents: AuditEvent[]; // append-only
  sessions: Map<string, Session>;
  directoryProviders: Map<string, DirectoryProvider>;
  directoryPrograms: Map<string, DirectoryProgram>;
  referrals: Map<string, Referral>;
  providerApplications: Map<string, ProviderApplication>;
  providerLeads: Map<string, ProviderLead>;
  providerProfiles: Map<string, ProviderProfile>;
  passwordTokens: Map<string, PasswordToken>;
}

const now = new Date().toISOString();
const DEMO_PASSWORD_HASH = bcrypt.hashSync("demo", 10);

export const DEMO_PRACTITIONER_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_CLIENT_USER_ID = "00000000-0000-4000-8000-000000000002";

function createStore(): MockStore {
  const store: MockStore = {
    users: new Map(),
    clients: new Map(),
    services: new Map(),
    locations: new Map(),
    availability: new Map(),
    appointments: new Map(),
    notes: new Map(),
    noteAmendments: new Map(),
    noteTemplates: new Map(),
    transcripts: new Map(),
    forms: new Map(),
    formResponses: new Map(),
    invoices: new Map(),
    invoiceItems: new Map(),
    payments: new Map(),
    payers: new Map(),
    insurancePolicies: new Map(),
    threads: new Map(),
    messages: new Map(),
    files: new Map(),
    auditEvents: [],
    sessions: new Map(),
    directoryProviders: new Map(),
    directoryPrograms: new Map(),
    referrals: new Map(),
    providerApplications: new Map(),
    providerLeads: new Map(),
    providerProfiles: new Map(),
    passwordTokens: new Map(),
  };

  const users: User[] = [
    {
      id: DEMO_PRACTITIONER_ID,
      role: "admin", // staff superuser — passes practitioner + admin guards
      name: "Brendan Stanton",
      email: "brendan@leuk.demo",
      passwordHash: DEMO_PASSWORD_HASH,
      avatarHue: "teal",
      phone: null,
      timezone: "America/New_York",
      slug: "brendan-stanton",
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: DEMO_CLIENT_USER_ID,
      role: "client",
      name: "Casey Morgan",
      email: "casey@leuk.demo",
      passwordHash: DEMO_PASSWORD_HASH,
      avatarHue: "amber",
      phone: null,
      timezone: "America/New_York",
      slug: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const u of users) store.users.set(u.id, u);

  return store;
}

type Globals = typeof globalThis & {
  __leukMockStore?: MockStore;
  __leukMockFixtures?: Set<string>;
};
const g = globalThis as Globals;

/** The process-wide mock store singleton. */
export function mockStore(): MockStore {
  if (!g.__leukMockStore) g.__leukMockStore = createStore();
  return g.__leukMockStore;
}

/**
 * Register domain fixtures. Runs `seed(store)` immediately, exactly once per
 * process for a given `name` — safe to call at module scope in
 * lib/mock/<domain>.ts regardless of import order or HMR.
 */
export function registerFixtures(name: string, seed: (store: MockStore) => void): void {
  if (!g.__leukMockFixtures) g.__leukMockFixtures = new Set();
  if (g.__leukMockFixtures.has(name)) return;
  g.__leukMockFixtures.add(name);
  seed(mockStore());
}

let idCounter = 0;
/** Random uuid for mock rows (mirrors gen_random_uuid()). */
export function mockId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `mock-${Date.now()}-${idCounter++}`;
}
