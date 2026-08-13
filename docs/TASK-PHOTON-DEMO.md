# TASK — Photon e-prescribing DEMO (Neutron sandbox), production-shaped

This is a DEMO in the Leuk provider portal. All client/Rx data is fake. Do
NOT add auth hardening, RLS, or PHI safeguards — that comes later.

CRITICAL BUILD INTENT: build as faithfully to the real production flow as
possible. Going live must require ONLY (a) swapping Neutron sandbox
credentials/URLs for production ones via env and (b) authorizing real
practitioners in Photon — no code rearchitecture. Where a real call can't
fully succeed in sandbox (e.g. provider not yet authorized to prescribe),
make the REAL call and handle that specific failure gracefully — never fake
the result.

Prerequisite: if `lib/photon.ts` and `scripts/probe-photon.mjs` already
exist (from docs/TASK-PHOTON-SCAFFOLD.md), build on them. If not, execute
that doc's STEP 0–2 first — read the Photon docs (start
https://docs.photon.health/docs/getting-started; GraphQL schema reference at
docs.photon.health/reference — NEVER guess mutation/field names), build the
M2M token module, and prove credentials with the probe before anything else.

Env (already in Vercel + .env.local — read from env ONLY, never inline
values; the client-id strings floating around in chat have a transcription
ambiguity, the env is the truth): PHOTON_AUTH_URL, PHOTON_M2M_CLIENT_ID,
PHOTON_M2M_CLIENT_SECRET, PHOTON_AUDIENCE, PHOTON_API_URL,
NEXT_PUBLIC_PHOTON_CLIENT_ID, NEXT_PUBLIC_PHOTON_ENV. No hardcoded
neutron/photon URLs anywhere in the diff.

=========================================================
PART A — DATA: practitioners + client assignment (FIRST; blocks the UI)
=========================================================
Verified current state (read sql/002_seed.sql lines 11–15 yourself):
- Brendan Stanton is ALREADY role='admin', and `requireRole` already treats
  admin as a practitioner superset (lib/auth.ts:241). Change NOTHING about
  Brendan or auth.
- THREE of the five practitioners ALREADY EXIST as users with working demo
  logins (password "demo"): Priya Raman, Lena Whitfield, Marcus Bell.
- `clients.primary_practitioner_id uuid` exists (sql/001_schema.sql:46) and
  the seed populates it for seeded clients — but verify against the LIVE DB;
  later-created rows may be NULL.
- `users` has NO slug column; `avatar_hue` is CHECK-constrained to exactly
  ('teal','amber','pink','blue') — 5 distinct hues is impossible; reuse hues
  for the new two, do not widen the constraint.

Do, as migration `sql/028_photon_demo.sql` (or next free number — check
`ls sql/` first), applied to the live DB:
1. INSERT two new practitioner users: "Dr. Shelley Padgett"
   (shelley@leuk.demo) and "Jason Hilario" (jason.h@leuk.demo — check
   sql/011 first; a Jason provider exists somewhere, avoid email collision),
   role='practitioner', password_hash copied verbatim from an existing demo
   user row (same bcrypt = password "demo" works; that IS the existing demo
   login mechanism — invent no new auth).
2. UPDATE all demo clients so primary_practitioner_id divides them equally
   across the 5 practitioners (as even as count allows; overwriting existing
   assignments is fine, it's demo data).
3. `ALTER TABLE clients ADD COLUMN IF NOT EXISTS photon_patient_id text;`

CHECKPOINT before any UI work: print the per-practitioner client counts and
verify the split is ~equal and every client has a practitioner. A wrong
backfill here poisons every downstream view — catch it at the data step.

=========================================================
PART B — CLIENTS LIST: role-aware view + Practitioner + Rx columns
=========================================================
File: `app/(app)/clients/clients-index.tsx` — this is the reference
implementation of the table standard (docs/TASK-TABLE-STANDARD.md). Extend
its existing column mechanics; do not fork or hand-roll.

ADMIN view (Brendan): title "All Clients" (TopBar title stays as routed;
this is the in-content list heading if one exists — match current
placement). Columns in order:
  Client name | Practitioner | Rx | Phone | Email | Tags | Created | Status
Practitioner = primary_practitioner_id → user name. Shows ALL clients.

PRACTITIONER view (Shelley + others): title "My Clients". Same columns MINUS
Practitioner. Filtered to primary_practitioner_id = current user.

Role switch = `user.role === "admin"` from the existing session; no new auth
concepts. Rx column (both): count of the client's Photon prescriptions
(Part D), right-aligned tabular-nums, 0 renders as "0" not "—" (a synced
patient with no scripts is a real zero). Keep existing search/status/tags
filters working in both views.

=========================================================
PART C — CLIENT DRILL-DOWN: real "Rx" tab
=========================================================
File: `app/(app)/clients/[id]/page.tsx`. Insert tab "Rx" AFTER Personal,
BEFORE Insurance: Overview | Personal | Rx | Insurance | Documentation |
Billing | Files. Use the existing Tabs primitive/config — do not redesign
the other tabs.

Rx tab:
- List the client's Photon prescriptions via the M2M read path (Part D):
  medication name, strength, dispenseQuantity, fillsAllowed, writtenAt,
  state. Empty state: normal design-system empty state, offer sync if
  photon_patient_id is null.
- A REAL "Create prescription" flow (Part D "PRESCRIBE") in the Leuk design
  system — NOT a deep-link, NOT a mock.

=========================================================
PART D — PHOTON INTEGRATION, PRODUCTION-SHAPED
=========================================================
TWO REAL AUTH PATHS (both; this is the whole point):

(1) M2M path — server-side (lib/photon.ts), for reads + patient writes:
    client_credentials against PHOTON_AUTH_URL (client_id/secret/audience)
    → Bearer, cached server-side, refreshed before expiry. Request the
    scopes the docs specify for: patient read/write, prescription read,
    order read/write. M2M cannot write prescriptions — by design; do not
    try.

(2) User Access Token path — provider login, for PRESCRIBING:
    Use Photon's SUPPORTED client-side mechanism — the @photonhealth
    SDK/Elements client with NEXT_PUBLIC_PHOTON_CLIENT_ID (their Auth0 on
    the auth domain, Google OAuth is enabled) — to obtain a provider User
    Access Token carrying prescription-write scope. Prefer the official
    SDK/Elements prescribe workflow wrapped natively in our Rx tab over a
    hand-rolled GraphQL prescribe UI: production-shaped means
    vendor-supported. Only go raw-GraphQL-with-user-token if the docs
    document that as a supported path. NOTE: the Photon login is a SEPARATE
    identity from the Leuk session (Auth0 popup/redirect); localhost:3010 is
    already whitelisted on the SPA app. If the logged-in Photon user isn't
    authorized to prescribe in the sandbox org, catch that SPECIFIC error
    and render inline: "This practitioner is not yet authorized to prescribe
    in Photon (sandbox). Authorizing a provider is the only step needed to
    enable live prescribing." Everything up to the failing call must be
    real. Do not fabricate a signature/EPCS step — Photon handles that;
    surface what the real call returns.

Server endpoints (M2M token; follow house API style — requireUser, AuthError
mapping — but no extra hardening):
- POST `/api/photon/sync-patient` — createPatient from a Leuk clients row
  (name, dob, gender, email, phone, address per the docs' patient input
  type); store returned id in clients.photon_patient_id. Idempotent (no-op
  if already set).
- GET `/api/photon/prescriptions?patientId=` — normalized Rx list.
- GET `/api/photon/rx-counts?patientIds=` — counts for the visible page in
  ONE round-trip from the browser. If the GraphQL schema has no batch query,
  fan out server-side with bounded concurrency (~5) + a 60s in-module cache;
  never per-row calls from the client.

DEMO SEEDING: script or endpoint-driven — sync ALL demo clients to the
sandbox so every client has a real photon_patient_id (all data is fake; 0
prescriptions is fine). Casey Morgan must be synced.

=========================================================
DESIGN
=========================================================
Existing Leuk design system only — current Clients list + client-detail
idioms (row height, avatar chips, tag pills, status badges, tab underline).
No new colors/fonts/libraries. If the Photon Elements components render
their own UI inside the prescribe flow, contain them in a design-system
sheet/panel so the surrounding chrome is native; report any styling
limitation rather than fighting the web components.

=========================================================
OUT OF SCOPE
=========================================================
- No auth/security hardening, no RLS, no PHI safeguards (demo).
- Do NOT touch payer/rate tables (provider_rate_signals, tin_registry,
  directory_providers, nppes_organizations, org_tin_* / rate_* matviews).
- Do NOT redesign existing tabs or the clients-list filter system.
- Webhook stub only: POST `/api/photon/webhook` verifying the Photon
  signature per docs (secret env `PHOTON_WEBHOOK_SECRET`; it does NOT exist
  yet — no webhook is registered in the dashboard). Secret unset → 503 +
  console.warn. Invalid signature → 401. Verified → log event TYPE +
  resource IDs ONLY (never payload dumps — prescription payloads carry
  patient identifiers and the house rule is never log PHI), return 200. NOT
  wired to state updates — production is a dashboard-config change later.

=========================================================
DONE WHEN
=========================================================
1. Admin (brendan@leuk.demo / demo): "All Clients" with Practitioner +
   Rx columns; every row has a practitioner; 5 practitioners ~equal.
2. Practitioner (shelley@leuk.demo / demo): "My Clients", no Practitioner
   column, only her clients, Rx column present.
3. Casey Morgan detail: Rx tab (after Personal, before Insurance) lists real
   Neutron data; Create-prescription either submits for a Photon-authorized
   login or shows the exact "not yet authorized" message — never a mock.
4. All demo clients synced with a photon_patient_id; Rx counts are real
   sandbox data.
5. `grep -ri "neutron\|photon.health" --include="*.ts" --include="*.tsx"`
   over the diff shows no hardcoded URLs (env-driven only).
6. Webhook stub behaves as specified (curl → 503 today).

=========================================================
WORKING AGREEMENTS
=========================================================
- Multiple concurrent sessions share this tree: stage ONLY your own files
  (`git add <paths>`, never `git add -A`). Commit when done; do NOT push.
- Dev server on port 3010 may already be running; don't kill it.
- Verify on localhost:3010 with both logins before reporting.
- Never print PHOTON_M2M_CLIENT_SECRET or bearer tokens.
- Report: per-practitioner client counts, probe/sync results, the exact
  Photon SDK path you chose for the user-token flow and why, any docs-vs-
  brief conflicts (docs win), and the webhook URL + events to register in
  the Photon dashboard.
