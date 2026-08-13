# TASK — Photon e-prescribing: sandbox plumbing, credential probe, webhook stub

Photon (photon.health) is the e-prescribing platform Leuk will integrate.
This task is the FOUNDATION ONLY: server-side auth plumbing, a
prove-the-credentials probe, and a stub webhook endpoint. No prescribing UI,
no patient sync, no database writes. The pattern is the same one we used for
the Anthem API onboarding: probe → report → stop → then build on proven
credentials.

## STEP 0 — Read the docs before writing any code

Start at https://docs.photon.health/docs/getting-started and follow its nav
to the auth (machine-to-machine / client credentials), API, and webhooks
pages. Extract and note in your report:

1. The exact token request shape (endpoint path on the auth domain, grant
   type, audience) for M2M client-credentials.
2. The API endpoint + protocol (GraphQL) and the cheapest read-only query
   that proves an authenticated round-trip (organization info, catalog
   list — whatever the docs show first).
3. The webhook signature scheme — header names and verification algorithm.
   Implement EXACTLY what the docs specify; do not improvise an HMAC scheme
   from memory.

We are on Photon's SANDBOX environment (their "Neutron" env). If the docs
show different hosts for sandbox vs production, the env vars below already
carry the right values — read hosts from env, never hardcode.

## Environment variables (already set — 7 in Vercel, all environments)

| var | role |
|---|---|
| `PHOTON_AUTH_URL` | OAuth/auth domain for the token request |
| `PHOTON_M2M_CLIENT_ID` | machine-to-machine client id (backend) |
| `PHOTON_M2M_CLIENT_SECRET` | machine-to-machine secret (backend, never expose) |
| `PHOTON_AUDIENCE` | audience param for the token request |
| `PHOTON_API_URL` | the API endpoint |
| `NEXT_PUBLIC_PHOTON_CLIENT_ID` | SPA client id — for the FUTURE browser embed; unused in this task |
| `NEXT_PUBLIC_PHOTON_ENV` | sandbox/prod switch — for the future embed; unused in this task |

FIRST ACTION: check `.env.local` contains all 7 (`grep -c '^PHOTON_\|^NEXT_PUBLIC_PHOTON_' .env.local`
should be 7). Local dev reads the file, not Vercel. If any are missing,
STOP and tell Brendan exactly which — do not guess values.

An eighth var, `PHOTON_WEBHOOK_SECRET`, does NOT exist yet — no webhook is
registered in the Photon dashboard yet. The stub below must handle its
absence (see STEP 3).

## STEP 1 — `lib/photon.ts`

Mirror the house patterns (`lib/email.ts` lazy singleton; `hasDb` from the
repos):

- `export const hasPhoton = !!(process.env.PHOTON_M2M_CLIENT_ID && …)` over
  the five server vars.
- Token management: client-credentials fetch against PHOTON_AUTH_URL with
  PHOTON_AUDIENCE, cached in-module until ~60s before expiry, refreshed on
  demand. Never log the token or secret.
- `photonQuery(query, variables)` — minimal typed GraphQL fetch against
  PHOTON_API_URL with the bearer token. Throws a clear error naming the
  failing stage (token vs query) without echoing credentials.
- Server-only module: import nothing from it in client components.

## STEP 2 — `scripts/probe-photon.mjs`

Mirror `scripts/probe-anthem.mjs` (read it first — same shape, same tone):
get a token → run the one cheapest read-only query from STEP 0 → print a
compact proof (env name, token type + expiry, query result summary) → exit.
Run it with `node --env-file=.env.local scripts/probe-photon.mjs`. It must
be read-only — no mutations against the sandbox. If it fails, report the
failing stage and which env var looks wrong; do not retry-loop.

Do not proceed to STEP 3 until the probe passes.

## STEP 3 — Webhook stub: `app/api/photon/webhook/route.ts`

POST handler, `runtime = "nodejs"`. Stub only — it must NOT touch
prescription/order state, so going to production later is a Photon
dashboard-config change, not new code.

- Verify the signature per the docs' scheme using `PHOTON_WEBHOOK_SECRET`.
  Invalid signature → 401.
- Secret not configured (current state, and true until the webhook is
  registered in the Photon dashboard): return 503 with a server-side
  `console.warn("photon webhook: PHOTON_WEBHOOK_SECRET not set")`. NEVER
  accept an unverified payload as if it were verified.
- Verified events: log **event type + Photon resource ids ONLY**, then 200
  fast. Prescription/order payloads carry patient identifiers — house rule
  is never log PHI, so no payload dumps, no patient names/DOB in logs.
- GET/other methods → 405.

## Out of scope — do not build

- The prescribe UI embed (Photon elements, `NEXT_PUBLIC_PHOTON_*`) — that is
  the next task, once this plumbing is proven. Touch no UI files at all.
- Patient creation/sync, order/prescription reads or writes, any Leuk DB
  writes, any new tables.
- Registering the webhook in the Photon dashboard (Brendan does that; note
  in your report the exact URL to register:
  `https://<prod-domain>/api/photon/webhook` and which events the docs
  recommend subscribing to).

## Done when

1. Probe passes against the sandbox and its output is in your report.
2. `lib/photon.ts` + `scripts/probe-photon.mjs` +
   `app/api/photon/webhook/route.ts` exist; `npm run build` (or the dev
   server compiling those routes) shows no errors.
3. A curl POST to `localhost:3010/api/photon/webhook` returns 503 (secret
   unset today) — include the curl + response in the report.
4. Report includes: the docs' webhook signature scheme (named + linked), the
   token/query shapes you implemented, the webhook URL + recommended events
   for dashboard registration, and any place where the docs contradicted
   this brief (docs win — say what you changed).

## Working agreements

- Multiple sessions share this tree: stage only files you created
  (`git add <paths>`, never `git add -A`). Commit when done; do NOT push.
- Dev server may already be running on port 3010 — don't kill it; hot
  reload picks up the new route.
- Secrets: never print PHOTON_M2M_CLIENT_SECRET or a bearer token in
  output, logs, or the report.
