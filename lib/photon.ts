// Photon (photon.health) e-prescribing — server-side M2M plumbing.
//
// SERVER ONLY. Never import from a client component: this module reads
// PHOTON_M2M_CLIENT_SECRET. The browser half of the integration (provider
// login + prescribing) goes through @photonhealth/elements with the public
// NEXT_PUBLIC_PHOTON_* vars instead — see components/photon/.
//
// Hosts are env-driven (sandbox "Neutron" vs production differ only by env),
// so going live is a credential swap, not a code change. No photon.health /
// neutron.health literals in this file.
//
// Auth per https://docs.photon.health/docs/authentication: client-credentials
// exchange with a JSON body (NOT form-encoded — Photon's Auth0 tenant takes
// application/json here). The M2M token can do everything except write
// prescriptions; those require an authorized provider's User Access Token.

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
};

const AUTH_URL = process.env.PHOTON_AUTH_URL;
const CLIENT_ID = process.env.PHOTON_M2M_CLIENT_ID;
const CLIENT_SECRET = process.env.PHOTON_M2M_CLIENT_SECRET;
const AUDIENCE = process.env.PHOTON_AUDIENCE;
const API_URL = process.env.PHOTON_API_URL;

/** True when the five server-side Photon vars are present. */
export const hasPhoton = !!(AUTH_URL && CLIENT_ID && CLIENT_SECRET && AUDIENCE && API_URL);

/** Error naming the stage that failed, never echoing credentials. */
export class PhotonError extends Error {
  constructor(
    public stage: "config" | "token" | "query",
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "PhotonError";
  }
}

/**
 * Token endpoint. PHOTON_AUTH_URL carries the full path today
 * (…/oauth/token); if it is ever set to a bare domain, append the documented
 * path rather than failing.
 */
function tokenUrl(): string {
  const u = new URL(AUTH_URL!);
  if (u.pathname === "/" || u.pathname === "") u.pathname = "/oauth/token";
  return u.toString();
}

let cached: { token: string; expiresAt: number; scope: string } | null = null;

/**
 * M2M bearer token, cached in-module until 60s before expiry.
 * Scopes are assigned to the M2M application in the Photon dashboard — the
 * docs show them on the response, not as a request parameter, so we don't
 * send a `scope` param and report what was granted instead.
 */
export async function photonToken(): Promise<{ token: string; scope: string; expiresAt: number }> {
  if (!hasPhoton) throw new PhotonError("config", "Photon is not configured (PHOTON_* env vars missing).");
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return { token: cached.token, scope: cached.scope, expiresAt: cached.expiresAt };
  }
  let res: Response;
  try {
    res = await fetch(tokenUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        audience: AUDIENCE,
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    });
  } catch (e) {
    throw new PhotonError("token", `Could not reach the Photon auth host: ${(e as Error).message}`);
  }
  if (!res.ok) {
    // Auth0 error bodies name the problem (invalid_client, access_denied…)
    // without echoing what we sent — safe to surface.
    const body = await res.text().catch(() => "");
    throw new PhotonError("token", `Photon token request failed: HTTP ${res.status}`, body.slice(0, 300));
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) throw new PhotonError("token", "Photon token response carried no access_token.");
  const expiresAt = Date.now() + json.expires_in * 1000;
  cached = { token: json.access_token, expiresAt, scope: json.scope ?? "" };
  return { token: json.access_token, scope: cached.scope, expiresAt };
}

/**
 * Our Photon organization id, read off the M2M token's
 * `http://photon.health/org_id` claim. Elements needs it in the browser
 * (<photon-client org="…">), and taking it from the token rather than an
 * eighth env var means it follows the credentials automatically when sandbox
 * creds are swapped for production ones. It is a public identifier, not a
 * secret — it ships in the page.
 */
export async function photonOrgId(): Promise<string> {
  const { token } = await photonToken();
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const org = claims["http://photon.health/org_id"];
    if (typeof org === "string" && org) return org;
  } catch {
    /* fall through */
  }
  throw new PhotonError("token", "Photon token carried no org_id claim.");
}

type GraphQLResponse<T> = { data?: T; errors?: Array<{ message: string; extensions?: Record<string, unknown> }> };

/** Minimal GraphQL fetch against PHOTON_API_URL with the M2M bearer token. */
export async function photonQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { token } = await photonToken();
  let res: Response;
  try {
    res = await fetch(API_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: variables ?? {} }),
      cache: "no-store",
    });
  } catch (e) {
    throw new PhotonError("query", `Could not reach the Photon API: ${(e as Error).message}`);
  }
  const text = await res.text();
  let json: GraphQLResponse<T>;
  try {
    json = JSON.parse(text) as GraphQLResponse<T>;
  } catch {
    throw new PhotonError("query", `Photon API returned non-JSON (HTTP ${res.status}).`, text.slice(0, 300));
  }
  if (json.errors?.length) {
    throw new PhotonError("query", json.errors.map((e) => e.message).join("; "), json.errors);
  }
  if (!res.ok) throw new PhotonError("query", `Photon API error: HTTP ${res.status}`, text.slice(0, 300));
  if (!json.data) throw new PhotonError("query", "Photon API returned no data.");
  return json.data;
}

// ── Patients ─────────────────────────────────────────────────────────────────

/** Photon's SexType enum; free-text gender rides along in `gender`. */
export type PhotonSex = "MALE" | "FEMALE" | "UNKNOWN";

/** Map a Leuk `clients.gender` free-text value onto Photon's SexType. */
export function toPhotonSex(gender: string | null | undefined): PhotonSex {
  const g = (gender ?? "").trim().toLowerCase();
  if (g === "male" || g === "m" || g === "man") return "MALE";
  if (g === "female" || g === "f" || g === "woman") return "FEMALE";
  return "UNKNOWN";
}

/**
 * E.164-ish phone for Photon's AWSPhone scalar. Demo data is all US.
 * Returns null when there aren't enough digits to form a valid number —
 * caller decides, because `phone` is required on createPatient.
 */
export function toPhotonPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return null;
}

export type PhotonAddressInput = {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

/**
 * Parse the demo `clients.address` single-line string into Photon's
 * AddressInput. Seed shape: "48 Carmine St, Apt 3B, New York, NY 10014".
 * Returns null if it doesn't parse — address is optional on createPatient,
 * so a miss costs nothing rather than failing the sync.
 */
export function parseAddress(address: string | null | undefined): PhotonAddressInput | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const last = parts[parts.length - 1];
  const m = /^([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?$/.exec(last);
  if (!m) return null;
  const [, state, postalCode] = m;
  const city = parts[parts.length - 2];
  const street1 = parts[0];
  const street2 = parts.length > 3 ? parts.slice(1, parts.length - 2).join(", ") : undefined;
  return { street1, street2, city, state, postalCode, country: "US" };
}

const CREATE_PATIENT = /* GraphQL */ `
  mutation createPatient(
    $externalId: ID
    $name: NameInput!
    $dateOfBirth: AWSDate!
    $sex: SexType!
    $gender: String
    $email: AWSEmail
    $phone: AWSPhone!
    $address: AddressInput
  ) {
    createPatient(
      externalId: $externalId
      name: $name
      dateOfBirth: $dateOfBirth
      sex: $sex
      gender: $gender
      email: $email
      phone: $phone
      address: $address
    ) {
      id
      externalId
    }
  }
`;

export type CreatePatientInput = {
  externalId: string;
  name: { first: string; last: string };
  dateOfBirth: string;
  sex: PhotonSex;
  gender?: string | null;
  email?: string | null;
  phone: string;
  address?: PhotonAddressInput | null;
};

/** createPatient → Photon patient id. */
export async function createPhotonPatient(input: CreatePatientInput): Promise<string> {
  const data = await photonQuery<{ createPatient: { id: string } }>(CREATE_PATIENT, {
    externalId: input.externalId,
    name: input.name,
    dateOfBirth: input.dateOfBirth,
    sex: input.sex,
    gender: input.gender ?? null,
    email: input.email ?? null,
    phone: input.phone,
    address: input.address ?? null,
  });
  return data.createPatient.id;
}

// ── Prescriptions ────────────────────────────────────────────────────────────

/** Photon PrescriptionState (verified against the live schema — DRAFT included). */
export type PhotonRxState = "DRAFT" | "ACTIVE" | "EXPIRED" | "DEPLETED" | "CANCELED";

export type PhotonPrescription = {
  id: string;
  medication: string;
  dispenseQuantity: number | null;
  dispenseUnit: string | null;
  fillsAllowed: number | null;
  writtenAt: string | null;
  state: PhotonRxState;
  instructions: string | null;
};

const RX_FIELDS = /* GraphQL */ `
  id
  state
  dispenseQuantity
  dispenseUnit
  fillsAllowed
  writtenAt
  instructions
  treatment {
    id
    name
  }
`;

type RxRow = {
  id: string;
  state: PhotonRxState;
  dispenseQuantity: number | null;
  dispenseUnit: string | null;
  fillsAllowed: number | null;
  writtenAt: string | null;
  instructions: string | null;
  treatment: { id: string; name: string } | null;
};

function toPrescription(r: RxRow): PhotonPrescription {
  return {
    id: r.id,
    // Treatment.name is the full label ("Lisinopril 10 mg tablet") — Photon
    // has no separate strength field, the strength is inside the name.
    medication: r.treatment?.name ?? "—",
    dispenseQuantity: r.dispenseQuantity,
    dispenseUnit: r.dispenseUnit,
    fillsAllowed: r.fillsAllowed,
    writtenAt: r.writtenAt,
    state: r.state,
    instructions: r.instructions,
  };
}

const PRESCRIPTIONS_BY_PATIENT = /* GraphQL */ `
  query prescriptionsByPatient($patientId: ID!) {
    prescriptions(filter: { patientId: $patientId }) {
      ${RX_FIELDS}
    }
  }
`;

/** Prescriptions for one Photon patient, normalized. */
export async function listPhotonPrescriptions(patientId: string): Promise<PhotonPrescription[]> {
  const data = await photonQuery<{ prescriptions: RxRow[] }>(PRESCRIPTIONS_BY_PATIENT, { patientId });
  return (data.prescriptions ?? []).map(toPrescription);
}

// ── Rx counts (batched) ──────────────────────────────────────────────────────
//
// The schema has no "count prescriptions for N patients" query, so we batch
// with GraphQL aliases: one HTTP round-trip carrying N aliased `prescriptions`
// queries. Results are cached in-module for 60s so paging the clients list
// doesn't re-hit Photon per keystroke.

const COUNT_TTL_MS = 60_000;
const countCache = new Map<string, { count: number; at: number }>();

/** Aliases must be valid GraphQL names; Photon ids contain characters that aren't. */
function alias(i: number): string {
  return `p${i}`;
}

/**
 * Prescription counts keyed by Photon patient id. One round-trip per batch of
 * 25 aliases (bounded so a large page can't build an unbounded query
 * document), 60s cache. Unknown/failed ids simply stay absent from the map.
 */
export async function photonRxCounts(patientIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const now = Date.now();
  const misses: string[] = [];
  for (const id of new Set(patientIds)) {
    const hit = countCache.get(id);
    if (hit && now - hit.at < COUNT_TTL_MS) out[id] = hit.count;
    else misses.push(id);
  }
  const BATCH = 25;
  for (let i = 0; i < misses.length; i += BATCH) {
    const batch = misses.slice(i, i + BATCH);
    const vars: Record<string, unknown> = {};
    const decls = batch.map((_, j) => `$${alias(j)}: ID!`).join(", ");
    const body = batch
      .map((_, j) => `${alias(j)}: prescriptions(filter: { patientId: $${alias(j)} }) { id }`)
      .join("\n      ");
    batch.forEach((id, j) => (vars[alias(j)] = id));
    const query = `query rxCounts(${decls}) {\n      ${body}\n    }`;
    const data = await photonQuery<Record<string, Array<{ id: string }>>>(query, vars);
    batch.forEach((id, j) => {
      const rows = data[alias(j)];
      if (Array.isArray(rows)) {
        out[id] = rows.length;
        countCache.set(id, { count: rows.length, at: Date.now() });
      }
    });
  }
  return out;
}

/** Drop cached counts for a patient (after a prescription is written). */
export function invalidateRxCount(patientId: string): void {
  countCache.delete(patientId);
}

// ── Prescription detail, orders, pharmacies, catalog ─────────────────────────
//
// Every field below was read off the live schema by introspection, not the
// guide pages (which disagree with it — see docs/reports/2026-07-14-photon-demo.md).
// Two shapes are worth knowing before reading on:
//
//  1. `Prescription` has NO `orders` field. An order is reached through fills:
//     Prescription → fills[] → Fill.order. Several fills of DIFFERENT
//     prescriptions can share ONE order (Photon batches a patient's fills into
//     a single pharmacy order), so the per-prescription order list is deduped
//     by order id rather than mapped 1:1 off fills.
//  2. `prescriptions()`/`orders()` are org-scoped for an M2M token, so the
//     org-wide lists are one round-trip each — no need to fan out over patient
//     ids. Caller-side role scoping happens in lib/photon-scope.ts.

/** Photon rejects any `first` above 25 ("Invalid page size 200, must be less
 *  than or equal to 25"), so every list pages through with the `after:` cursor
 *  rather than asking for one big page. */
const PHOTON_PAGE_SIZE = 25;

/** Overall bound across all pages, so a runaway org can't spin here forever.
 *  Hitting it is surfaced as a footnote rather than silently truncating. */
export const PHOTON_LIST_LIMIT = 200;

/**
 * Walk a cursor-paginated list query to completion (or PHOTON_LIST_LIMIT).
 * `after` takes the last id of the previous page.
 */
async function pageThrough<T extends { id: string }>(
  query: string,
  field: string,
  vars: Record<string, unknown> = {},
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  while (out.length < PHOTON_LIST_LIMIT) {
    const data = await photonQuery<Record<string, T[]>>(query, { ...vars, first: PHOTON_PAGE_SIZE, after: after ?? null });
    const rows = data[field] ?? [];
    out.push(...rows);
    if (rows.length < PHOTON_PAGE_SIZE) break;
    after = rows[rows.length - 1]?.id;
    if (!after) break;
  }
  return out;
}

export type PhotonOrderState = "ROUTING" | "PENDING" | "PLACED" | "COMPLETED" | "CANCELED" | "ERROR";
export type PhotonFillState = "SCHEDULED" | "NEW" | "SENT" | "CANCELED";

export type PhotonPharmacy = {
  id: string;
  name: string;
  phone: string | null;
  /** Single-line "168 2ND AVE, NEW YORK, NY 10003" — null when Photon has no address. */
  address: string | null;
};

export type PhotonOrder = {
  id: string;
  state: PhotonOrderState;
  createdAt: string | null;
  pharmacy: PhotonPharmacy | null;
  patientId: string;
  patientName: string;
  /** Distinct medications across the order's fills (an order can span prescriptions). */
  medications: string[];
  /** Distinct prescriptions behind the order's fills — an /orders row drills into the first. */
  prescriptionIds: string[];
  fillCount: number;
};

/** Full detail behind an Rx row, incl. the orders reached through its fills. */
export type PhotonRxDetail = PhotonPrescription & {
  externalId: string | null;
  patientId: string;
  patientName: string;
  prescriberName: string | null;
  notes: string | null;
  daysSupply: number | null;
  dispenseAsWritten: boolean | null;
  fillsRemaining: number | null;
  effectiveDate: string | null;
  doNotFillBeforeDate: string | null;
  expirationDate: string | null;
  orders: PhotonOrder[];
};

/** An Rx row on the org-wide list — the list fields plus who it belongs to. */
export type PhotonRxListRow = PhotonPrescription & {
  patientId: string;
  patientName: string;
  prescriberName: string | null;
  fillsRemaining: number | null;
};

const ADDRESS_FIELDS = /* GraphQL */ `street1 street2 city state postalCode`;

type AddressRow = { street1?: string | null; street2?: string | null; city?: string | null; state?: string | null; postalCode?: string | null } | null;

function toAddressLine(a: AddressRow): string | null {
  if (!a) return null;
  const line = [a.street1, a.street2, a.city, [a.state, a.postalCode].filter(Boolean).join(" ")]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return line || null;
}

const PHARMACY_FIELDS = /* GraphQL */ `id name phone address { ${ADDRESS_FIELDS} }`;

type PharmacyRow = { id: string; name: string; phone?: string | null; address?: AddressRow } | null;

function toPharmacy(p: PharmacyRow): PhotonPharmacy | null {
  return p ? { id: p.id, name: p.name, phone: p.phone ?? null, address: toAddressLine(p.address ?? null) } : null;
}

const ORDER_FIELDS = /* GraphQL */ `
  id
  state
  createdAt
  pharmacy { ${PHARMACY_FIELDS} }
  patient { id name { full } }
  fills { id state prescription { id treatment { name } } }
`;

type OrderRow = {
  id: string;
  state: PhotonOrderState;
  createdAt: string | null;
  pharmacy?: PharmacyRow;
  patient: { id: string; name: { full: string } };
  fills: Array<{ id: string; state: PhotonFillState; prescription: { id: string; treatment: { name: string } | null } | null }>;
};

function toOrder(o: OrderRow): PhotonOrder {
  return {
    id: o.id,
    state: o.state,
    createdAt: o.createdAt,
    pharmacy: toPharmacy(o.pharmacy ?? null),
    patientId: o.patient.id,
    patientName: o.patient.name.full,
    medications: [...new Set(o.fills.map((f) => f.prescription?.treatment?.name).filter((n): n is string => !!n))],
    prescriptionIds: [...new Set(o.fills.map((f) => f.prescription?.id).filter((n): n is string => !!n))],
    fillCount: o.fills.length,
  };
}

const RX_DETAIL_FIELDS = /* GraphQL */ `
  ${RX_FIELDS}
  externalId
  notes
  daysSupply
  dispenseAsWritten
  fillsRemaining
  effectiveDate
  doNotFillBeforeDate
  expirationDate
  patient { id name { full } }
  prescriber { name { full } }
  fills { id state order { ${ORDER_FIELDS} } }
`;

type RxDetailRow = RxRow & {
  externalId: string | null;
  notes: string | null;
  daysSupply: number | null;
  dispenseAsWritten: boolean | null;
  fillsRemaining: number | null;
  effectiveDate: string | null;
  doNotFillBeforeDate: string | null;
  expirationDate: string | null;
  patient: { id: string; name: { full: string } };
  prescriber: { name: { full: string } } | null;
  fills: Array<{ id: string; state: PhotonFillState; order: OrderRow | null }>;
};

const PRESCRIPTION_BY_ID = /* GraphQL */ `
  query prescriptionById($id: ID!) {
    prescription(id: $id) {
      ${RX_DETAIL_FIELDS}
    }
  }
`;

/** One prescription with its orders, or null when the id is unknown to the org. */
export async function getPhotonPrescription(id: string): Promise<PhotonRxDetail | null> {
  const data = await photonQuery<{ prescription: RxDetailRow | null }>(PRESCRIPTION_BY_ID, { id });
  const r = data.prescription;
  if (!r) return null;
  // Fills of one prescription can point at the same order — dedupe by order id.
  const orders = new Map<string, PhotonOrder>();
  for (const f of r.fills ?? []) if (f.order && !orders.has(f.order.id)) orders.set(f.order.id, toOrder(f.order));
  return {
    ...toPrescription(r),
    externalId: r.externalId,
    patientId: r.patient.id,
    patientName: r.patient.name.full,
    prescriberName: r.prescriber?.name.full ?? null,
    notes: r.notes,
    daysSupply: r.daysSupply,
    dispenseAsWritten: r.dispenseAsWritten,
    fillsRemaining: r.fillsRemaining,
    effectiveDate: r.effectiveDate,
    doNotFillBeforeDate: r.doNotFillBeforeDate,
    expirationDate: r.expirationDate,
    orders: [...orders.values()],
  };
}

// Org-wide lists: 60s in-module cache, same TTL/reasoning as the Rx counts above.

const LIST_TTL_MS = 60_000;
let rxListCache: { rows: PhotonRxListRow[]; at: number } | null = null;
let orderListCache: { rows: PhotonOrder[]; at: number } | null = null;

const ALL_PRESCRIPTIONS = /* GraphQL */ `
  query allPrescriptions($first: Int!, $after: ID) {
    prescriptions(first: $first, after: $after) {
      ${RX_FIELDS}
      fillsRemaining
      patient { id name { full } }
      prescriber { name { full } }
    }
  }
`;

type RxListQueryRow = RxRow & {
  fillsRemaining: number | null;
  patient: { id: string; name: { full: string } };
  prescriber: { name: { full: string } } | null;
};

/** Every prescription in the org (M2M tokens are org-scoped), newest first. */
export async function listAllPhotonPrescriptions(): Promise<PhotonRxListRow[]> {
  if (rxListCache && Date.now() - rxListCache.at < LIST_TTL_MS) return rxListCache.rows;
  const rows = (await pageThrough<RxListQueryRow>(ALL_PRESCRIPTIONS, "prescriptions"))
    .map((r) => ({
      ...toPrescription(r),
      patientId: r.patient.id,
      patientName: r.patient.name.full,
      prescriberName: r.prescriber?.name.full ?? null,
      fillsRemaining: r.fillsRemaining,
    }))
    .sort((a, b) => (b.writtenAt ?? "").localeCompare(a.writtenAt ?? ""));
  rxListCache = { rows, at: Date.now() };
  return rows;
}

const ALL_ORDERS = /* GraphQL */ `
  query allOrders($first: Int!, $after: ID) {
    orders(first: $first, after: $after) {
      ${ORDER_FIELDS}
    }
  }
`;

const ORDERS_BY_PATIENT = /* GraphQL */ `
  query ordersByPatient($patientId: ID!, $first: Int!, $after: ID) {
    orders(filter: { patientId: $patientId }, first: $first, after: $after) {
      ${ORDER_FIELDS}
    }
  }
`;

const byNewest = (a: PhotonOrder, b: PhotonOrder) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

/** One patient's orders, newest first. Uncached — the portal reads it per page load. */
export async function listPhotonPatientOrders(patientId: string): Promise<PhotonOrder[]> {
  const rows = await pageThrough<OrderRow>(ORDERS_BY_PATIENT, "orders", { patientId });
  return rows.map(toOrder).sort(byNewest);
}

/** Every order in the org, newest first. */
export async function listAllPhotonOrders(): Promise<PhotonOrder[]> {
  if (orderListCache && Date.now() - orderListCache.at < LIST_TTL_MS) return orderListCache.rows;
  const rows = (await pageThrough<OrderRow>(ALL_ORDERS, "orders")).map(toOrder).sort(byNewest);
  orderListCache = { rows, at: Date.now() };
  return rows;
}

// ── Pharmacies ───────────────────────────────────────────────────────────────
//
// `pharmacies(name:)` alone is REJECTED: "Missing location for search on
// pharmacy of type PICK_UP". A PICK_UP search needs LatLongSearch
// {latitude, longitude, radius} — the schema has no postal-code search and no
// geocoder, so there is no zip → pharmacy path (see the Phase-2 report).
// MAIL_ORDER is the exception: it is location-free, which is why the portal
// picker can always offer it.

const PHARMACY_SEARCH = /* GraphQL */ `
  query pharmacySearch($name: String, $location: LatLongSearch, $type: FulfillmentType, $first: Int) {
    pharmacies(name: $name, location: $location, type: $type, first: $first) {
      ${PHARMACY_FIELDS}
      fulfillmentTypes
    }
  }
`;

export type PharmacySearchInput = {
  name?: string | null;
  /** Required for PICK_UP; omit for MAIL_ORDER. */
  location?: { latitude: number; longitude: number; radius?: number } | null;
  type?: "PICK_UP" | "MAIL_ORDER" | null;
  first?: number;
};

export async function searchPhotonPharmacies(input: PharmacySearchInput): Promise<Array<PhotonPharmacy & { fulfillmentTypes: string[] }>> {
  const data = await photonQuery<{ pharmacies: Array<NonNullable<PharmacyRow> & { fulfillmentTypes: string[] | null }> }>(PHARMACY_SEARCH, {
    name: input.name?.trim() || null,
    location: input.location ?? null,
    type: input.type ?? null,
    first: input.first ?? 10,
  });
  return (data.pharmacies ?? []).map((p) => ({ ...toPharmacy(p)!, fulfillmentTypes: p.fulfillmentTypes ?? [] }));
}

const PREFERRED_PHARMACIES = /* GraphQL */ `
  query preferredPharmacies($id: ID!) {
    patient(id: $id) {
      id
      preferredPharmacies { ${PHARMACY_FIELDS} }
    }
  }
`;

export async function getPhotonPreferredPharmacies(patientId: string): Promise<PhotonPharmacy[]> {
  const data = await photonQuery<{ patient: { preferredPharmacies: PharmacyRow[] } | null }>(PREFERRED_PHARMACIES, { id: patientId });
  return (data.patient?.preferredPharmacies ?? []).map((p) => toPharmacy(p)!).filter(Boolean);
}

const SET_PREFERRED = /* GraphQL */ `
  mutation setPreferredPharmacy($id: ID!, $pharmacies: [ID]) {
    updatePatient(id: $id, preferredPharmacies: $pharmacies) {
      id
      preferredPharmacies { ${PHARMACY_FIELDS} }
    }
  }
`;

/**
 * Set the patient's preferred pharmacies (write:patient — granted to M2M and
 * verified against the sandbox). Deliberately NOT `routeOrder`: routing an
 * order to a pharmacy is irreversible, whereas a preferred pharmacy can be
 * removed again, and Photon does not auto-route a ROUTING order when one is set
 * (verified: Peter Parker carries a preferred pharmacy while his order stays
 * ROUTING / no pharmacy).
 */
export async function setPhotonPreferredPharmacies(patientId: string, pharmacyIds: string[]): Promise<PhotonPharmacy[]> {
  const data = await photonQuery<{ updatePatient: { preferredPharmacies: PharmacyRow[] } }>(SET_PREFERRED, {
    id: patientId,
    pharmacies: pharmacyIds,
  });
  return (data.updatePatient.preferredPharmacies ?? []).map((p) => toPharmacy(p)!).filter(Boolean);
}

const REMOVE_PREFERRED = /* GraphQL */ `
  mutation removePreferredPharmacy($patientId: ID!, $pharmacyId: ID!) {
    removePatientPreferredPharmacy(patientId: $patientId, pharmacyId: $pharmacyId) {
      id
      preferredPharmacies { ${PHARMACY_FIELDS} }
    }
  }
`;

export async function removePhotonPreferredPharmacy(patientId: string, pharmacyId: string): Promise<PhotonPharmacy[]> {
  const data = await photonQuery<{ removePatientPreferredPharmacy: { preferredPharmacies: PharmacyRow[] } }>(REMOVE_PREFERRED, {
    patientId,
    pharmacyId,
  });
  return (data.removePatientPreferredPharmacy.preferredPharmacies ?? []).map((p) => toPharmacy(p)!).filter(Boolean);
}

// ── Catalog ──────────────────────────────────────────────────────────────────
//
// Org config, not PHI: the catalog is what the prescribe flow offers. One
// catalog per org in practice; `catalogs()` returns a list, we take the first.

export type PhotonTreatment = { id: string; name: string; description: string | null };

export type PhotonCatalog = { id: string; name: string; treatments: PhotonTreatment[] };

const CATALOGS = /* GraphQL */ `
  query catalogs {
    catalogs {
      id
      name
      treatments { id name description }
    }
  }
`;

let catalogCache: { catalog: PhotonCatalog | null; at: number } | null = null;

/** The org's catalog (first of `catalogs()`), treatments sorted by name. */
export async function getPhotonCatalog(force = false): Promise<PhotonCatalog | null> {
  if (!force && catalogCache && Date.now() - catalogCache.at < LIST_TTL_MS) return catalogCache.catalog;
  const data = await photonQuery<{ catalogs: Array<{ id: string; name: string; treatments: PhotonTreatment[] }> }>(CATALOGS);
  const c = data.catalogs?.[0];
  const catalog = c ? { ...c, treatments: [...c.treatments].sort((a, b) => a.name.localeCompare(b.name)) } : null;
  catalogCache = { catalog, at: Date.now() };
  return catalog;
}

/** Drop the cached catalog after an add/remove so the page reflects the write. */
export function invalidateCatalog(): void {
  catalogCache = null;
}

// `medicationConcepts(name:)` returns null for every term we tried (Tylenol,
// lisinopril, ibuprofen) — the documented concept search is dead in this
// tenant. `medications(filter: { drug: { name } })` is the search that works,
// and its `med_…` ids are exactly what addToCatalog wants.
// `controlled` is deliberately NOT selected. It is `Boolean!` in the schema but
// Photon returns null for it on real rows, and one null fails the WHOLE query
// ("Cannot return null for non-nullable type: 'Boolean' within parent
// 'Medication'"). Selecting it makes the search unusable; leaving it out is the
// only way to get results back. Same trap waits on any other non-nullable
// scalar Photon under-populates.
const TREATMENT_SEARCH = /* GraphQL */ `
  query treatmentSearch($name: String!, $first: Int!) {
    medications(filter: { drug: { name: $name } }, first: $first) {
      id
      name
      strength
      form
    }
  }
`;

export type TreatmentSearchHit = { id: string; name: string; strength: string | null; form: string | null };

export async function searchPhotonTreatments(name: string, first = 20): Promise<TreatmentSearchHit[]> {
  const term = name.trim();
  if (!term) return [];
  const data = await photonQuery<{ medications: TreatmentSearchHit[] }>(TREATMENT_SEARCH, { name: term, first });
  return data.medications ?? [];
}

const ADD_TO_CATALOG = /* GraphQL */ `
  mutation addToCatalog($catalogId: ID!, $treatmentId: ID!) {
    addToCatalog(catalogId: $catalogId, treatmentId: $treatmentId) { id name }
  }
`;

const REMOVE_FROM_CATALOG = /* GraphQL */ `
  mutation removeFromCatalog($catalogId: ID!, $treatmentId: ID!) {
    removeFromCatalog(catalogId: $catalogId, treatmentId: $treatmentId) { id name }
  }
`;

/** Both verified against the sandbox with the M2M token (add then remove, catalog restored). */
export async function addPhotonCatalogTreatment(catalogId: string, treatmentId: string): Promise<PhotonTreatment> {
  const data = await photonQuery<{ addToCatalog: PhotonTreatment }>(ADD_TO_CATALOG, { catalogId, treatmentId });
  invalidateCatalog();
  return data.addToCatalog;
}

export async function removePhotonCatalogTreatment(catalogId: string, treatmentId: string): Promise<PhotonTreatment> {
  const data = await photonQuery<{ removeFromCatalog: PhotonTreatment }>(REMOVE_FROM_CATALOG, { catalogId, treatmentId });
  invalidateCatalog();
  return data.removeFromCatalog;
}
