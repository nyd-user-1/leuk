#!/usr/bin/env node
// Demo seeding: sync every Leuk client to Photon so each carries a real
// photon_patient_id. All demo data is fake; 0 prescriptions is expected.
//
//   node --env-file=.env.local scripts/sync-photon-patients.mjs [--dry]
//
// Idempotent: clients that already have a photon_patient_id are skipped, so
// re-running never creates duplicate patients. Mirrors lib/photon.ts exactly
// (same mutation, same field mapping) — it's the script form of
// POST /api/photon/sync-patient, minus the HTTP session.

import { neon } from "@neondatabase/serverless";

const DRY = process.argv.includes("--dry");
const { PHOTON_AUTH_URL, PHOTON_API_URL, PHOTON_AUDIENCE, PHOTON_M2M_CLIENT_ID, PHOTON_M2M_CLIENT_SECRET, DATABASE_URL } =
  process.env;

const missing = Object.entries({
  DATABASE_URL,
  PHOTON_AUTH_URL,
  PHOTON_API_URL,
  PHOTON_AUDIENCE,
  PHOTON_M2M_CLIENT_ID,
  PHOTON_M2M_CLIENT_SECRET,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")}. Run with node --env-file=.env.local`);
  process.exit(1);
}

const sql = neon(DATABASE_URL);

function tokenUrl() {
  const u = new URL(PHOTON_AUTH_URL);
  if (u.pathname === "/" || u.pathname === "") u.pathname = "/oauth/token";
  return u.toString();
}

async function getToken() {
  const r = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: PHOTON_M2M_CLIENT_ID,
      client_secret: PHOTON_M2M_CLIENT_SECRET,
      audience: PHOTON_AUDIENCE,
      grant_type: "client_credentials",
    }),
  });
  const j = await r.json().catch(() => null);
  if (!j?.access_token) {
    console.error(`token failed: HTTP ${r.status}`);
    process.exit(2);
  }
  return j.access_token;
}

async function gql(query, variables, token) {
  const r = await fetch(PHOTON_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json().catch(() => null);
  if (j?.errors?.length) throw new Error(j.errors.map((e) => e.message).join("; "));
  if (!j?.data) throw new Error(`HTTP ${r.status}`);
  return j.data;
}

// Same normalizers as lib/photon.ts.
function toSex(g) {
  const s = (g ?? "").trim().toLowerCase();
  if (s === "male" || s === "m" || s === "man") return "MALE";
  if (s === "female" || s === "f" || s === "woman") return "FEMALE";
  return "UNKNOWN";
}
function toPhone(p) {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (d.length === 10) return `+1${d}`;
  return null;
}
function parseAddress(address) {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const m = /^([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?$/.exec(parts[parts.length - 1]);
  if (!m) return null;
  return {
    street1: parts[0],
    street2: parts.length > 3 ? parts.slice(1, parts.length - 2).join(", ") : undefined,
    city: parts[parts.length - 2],
    state: m[1],
    postalCode: m[2],
    country: "US",
  };
}

const CREATE_PATIENT = `
  mutation createPatient($externalId: ID, $name: NameInput!, $dateOfBirth: AWSDate!, $sex: SexType!,
                         $gender: String, $email: AWSEmail, $phone: AWSPhone!, $address: AddressInput) {
    createPatient(externalId: $externalId, name: $name, dateOfBirth: $dateOfBirth, sex: $sex,
                  gender: $gender, email: $email, phone: $phone, address: $address) { id }
  }
`;

const clients = await sql`
  SELECT id, first_name, last_name, dob, email, phone, address, gender, photon_patient_id
  FROM clients ORDER BY first_name, last_name
`;
const todo = clients.filter((c) => !c.photon_patient_id);
console.log(`${clients.length} clients · ${clients.length - todo.length} already synced · ${todo.length} to sync`);
if (DRY) {
  for (const c of todo) console.log(`  would sync: ${c.first_name} ${c.last_name}`);
  process.exit(0);
}

const token = await getToken();
let ok = 0;
const skipped = [];
for (const c of todo) {
  const phone = toPhone(c.phone);
  if (!c.dob || !phone) {
    skipped.push(`${c.first_name} ${c.last_name} (missing ${!c.dob ? "dob" : "phone"})`);
    continue;
  }
  const dob = c.dob instanceof Date ? c.dob.toISOString().slice(0, 10) : String(c.dob).slice(0, 10);
  try {
    const data = await gql(
      CREATE_PATIENT,
      {
        externalId: c.id,
        name: { first: c.first_name, last: c.last_name },
        dateOfBirth: dob,
        sex: toSex(c.gender),
        gender: c.gender,
        email: c.email,
        phone,
        address: parseAddress(c.address),
      },
      token,
    );
    const pid = data.createPatient.id;
    await sql`UPDATE clients SET photon_patient_id = ${pid}, updated_at = now() WHERE id = ${c.id} AND photon_patient_id IS NULL`;
    console.log(`  ✓ ${c.first_name} ${c.last_name} → ${pid}`);
    ok++;
  } catch (e) {
    skipped.push(`${c.first_name} ${c.last_name} (${e.message})`);
  }
}
console.log(`synced ${ok}/${todo.length}`);
if (skipped.length) {
  console.log("skipped:");
  for (const s of skipped) console.log(`  – ${s}`);
}
