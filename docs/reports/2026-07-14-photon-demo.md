# 2026-07-14 — Photon e-prescribing demo (Neutron sandbox)

## Shipped
- `e242421` — scaffold: `lib/photon.ts` (M2M token cache, GraphQL fetch, `photonOrgId`,
  patient/Rx normalizers, aliased Rx-count batcher), `scripts/probe-photon.mjs`,
  `app/api/photon/webhook/route.ts`, `types/photonhealth-elements.d.ts`
- Endpoints: `app/api/photon/{sync-patient,prescriptions,rx-counts}/route.ts`
- UI: `app/(app)/clients/page.tsx` (role-aware), `clients-index.tsx` (Practitioner + Rx columns),
  `app/(app)/clients/[id]/{page.tsx,rx-tab.tsx}`, `components/photon/prescribe-panel.tsx`
- Data: `sql/029_photon_demo.sql`, `scripts/sync-photon-patients.mjs`
- Plumbing: `lib/types.ts`, `lib/repos/{clients,invoices,threads,appointments}.ts`, `lib/mock/clients.ts`,
  `package.json` (+`@photonhealth/elements@0.23.10`)
- Probe: token OK (ttl 86400s), scopes `read:patient write:patient read:prescription read:order write:order
  write:invite read:invite read:organization` — **no `write:prescription`, by design**. `dispenseUnits` → 40.
  Org `org_vFNleudHEuQ2wWXT`. Webhook: POST → 503, GET → 405. Verified both logins on :3010.

## DB changes
- `sql/029_photon_demo.sql` applied to live DB. `clients.photon_patient_id TEXT` + partial index.
- Client assignment 14 rows: **before** Brendan 8 / Priya 6 → **after** Shelley 3 / Jason 3 / Lena 3 /
  Marcus 3 / Priya 2 / Brendan 0 (admin owns no caseload). 14/14 assigned. `UPDATE 12`.
- Shelley Padgett INSERT was `0 0` — she already existed on live (see Decisions).
- Photon sandbox: **12/14 clients synced** (was 0 patients in org). Casey Morgan =
  `pat_01KXHWKGTN4T238V2947EY3SJW`. Rx counts all real 0.

## Decisions
- **`.env.local` had ZERO of the 7 PHOTON vars** (brief says "already in .env.local"). All 7 were in
  Vercel → pulled via `vercel env pull` to scratch, appended to `.env.local` (gitignored). No values inlined.
- **Both new practitioners already existed.** Brief says insert Shelley + Jason; live DB already had
  Shelley (`…1006`) and Jason (`…1007`, from sql/011). Migration keeps an idempotent Shelley INSERT
  because *no migration ever created her* — a from-scratch rebuild had 4 practitioners. On live it no-ops.
- **Brief wrong on two facts:** `users.slug` DOES exist (sql/008); Jason's email is `jason@leuk.demo`.
- **Org id from the M2M token's `http://photon.health/org_id` claim**, not an 8th env var — it follows the
  credentials sandbox→prod automatically. Only `photon.health` literal in the diff; it's a claim key, not a URL.
- **`dev-mode`, not `env`, selects sandbox.** SDK source: `env` sets the API host but leaves the Auth0
  domain on production — mismatch. Both driven off `NEXT_PUBLIC_PHOTON_ENV`; `"photon"` goes live.
- **Docs vs reality (docs win, noted):** token body is `application/json`, not form-encoded. Docs don't
  document requesting scopes → we send no `scope` param and report what's granted. `createPatient` gains
  `gender`/`email`/`address` per the schema reference (the guide page omits them). No strength field —
  `Treatment.name` carries it ("Lisinopril 10 mg tablet"), so brief's "strength" folded into Medication.
- **Rx counts batch via GraphQL aliases** — one round-trip per 25 ids, 60s in-module cache. No batch query
  exists in the schema; aliasing beat the brief's fan-out-with-concurrency-5 fallback.

## Open items
- **2 clients unsynced**: Peter Parker (no dob), Shelley Padgett *(a client row, not the practitioner)*
  (no phone). Photon requires both on `createPatient`. Not my rows; fabricating a patient DOB is the wrong
  default even in demo. UI degrades correctly (Rx `–`, sync → 422 naming the field). Fills 2 fields to fix.
- **"Not yet authorized to prescribe" path implemented but unexercised** — needs a real Photon provider
  login I have no credentials for. Detection reads `permissions` off the real User Access Token
  (`emit-user-token`) + matches the GraphQL error. Everything up to that call is verified real.
- **Webhook verified-path untested** — `PHOTON_WEBHOOK_SECRET` doesn't exist; only the 503 is reachable.
- **Register in the Photon dashboard**: `https://<prod-domain>/api/photon/webhook`, events
  `photon:prescription:{created,depleted,expired}` + `photon:order:*`. Then set `PHOTON_WEBHOOK_SECRET`.

## Gotchas
- **Elements pulls Shoelace assets from jsdelivr at runtime** (`setBasePath(cdn.jsdelivr.net/...)`) — vendor
  hardcoded, unreachable behind a CSP/offline. Not fought, per brief.
- **A 403 on `auth.neutron.health/authorize` in console is EXPECTED** — Auth0 silent-auth probe with no SSO
  session. It confirms sandbox host + real client id; not a bug.
- `photon-auth-wrapper` renders `<slot>` when authed, `<photon-login>` (own full card, `w-screen max-w-sm`)
  when not — contained by `overflow-x-hidden` in our SidePanel.
- `@photonhealth/elements` package.json `exports` has no `types` → needs `types/photonhealth-elements.d.ts`.
- Photon's signature sample hashes `JSON.stringify(parsedBody)`; we hash raw bytes first, then fall back to
  re-serialized so either sender behavior verifies.
- Splitting `sql/*.sql` on `;` in Node drops comment-led statements — use `psql -f`.
