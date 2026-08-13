# Leuk

All-in-one practice management + EHR for healthcare and wellness professionals: scheduling, clinical documentation with an AI charting assistant, telehealth video, billing & payments, and a client portal with intake forms and secure messaging. Branded for Leuk Psychiatry (navy · teal · amber); compliance posture targets HIPAA/GDPR/PIPEDA — role-based access on every route, append-only audit trail, httpOnly sessions, soft-delete on clinical data.

## Quick start (no configuration needed)

```bash
npm install
npm run dev        # http://localhost:3010
```

With no `DATABASE_URL` set, the app runs on an in-memory demo dataset (a psychiatry practice with 12 clients, a week of appointments, notes, invoices, forms, and message threads). All CRUD works; data resets on restart.

**Demo logins** (password `demo`):
- `brendan@leuk.demo` — practitioner/admin → workspace (calendar, clients, inbox, billing, templates, settings)
- `casey@leuk.demo` — client → portal (appointments, records, forms, invoices, messages)

Public booking page (no login): `http://localhost:3010/book/leuk`

## Attach a database (Neon)

1. Create a Neon project, then bootstrap:
   ```bash
   psql "$DATABASE_URL" -f sql/001_schema.sql
   psql "$DATABASE_URL" -f sql/002_seed.sql
   ```
2. `cp .env.example .env.local` and set `DATABASE_URL`.
3. Restart. Same demo logins; data now persists. See `sql/README.md`.

## Optional integrations (all degrade gracefully when unset)

| Env var | Enables |
|---|---|
| `DATABASE_URL` | Neon Postgres (else in-memory mock store) |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Live Stripe checkout for invoice payment (else a mock checkout marks invoices paid in dev) |
| `RESEND_API_KEY` + `EMAIL_FROM` | Transactional email (else no-op) |

AI endpoints (`app/api/ai/*` — transcription, note generation, Ask AI) ship as clearly-marked stubs with realistic canned output; wire your ASR/LLM keys there.

## Deploy (Vercel)

Import the repo, set the env vars above, deploy. Note: telehealth signaling (`app/api/signal`) and the mock store are in-memory/single-process — fine for a single serverless region demo, but calls and mock data don't survive cold starts; attach Neon for persistence and consider a real signaling layer (e.g. WebSocket service) for production video.

## Architecture

- **Next 16 App Router · React 19 · Tailwind v4** — design tokens in `app/globals.css`; the design system spec lives in the Component Catalog (Obsidian vault, reverse-engineered from Carepatron and re-themed Leuk).
- **`lib/repos/*`** — one data module per domain; each function runs tagged-template SQL against Neon when `DATABASE_URL` is set, else the seeded in-memory store (`lib/mock/*`).
- **Auth** — cookie session (`leuk_session`), bcrypt against the users table (or demo users in mock mode), `requireUser()`/`requireRole()` guards on every API route; roles: admin / practitioner / client.
- **Audit** — `lib/audit.ts` appends to `audit_events` on PHI reads/writes.
- **Telehealth** — native WebRTC (STUN-only) with polling signaling; practitioner side hosts the AI Scribe panel that live-transcribes and drafts a note into the clinical record.
- **`sql/`** — schema (21 tables), idempotent seed, and DB readme.

`BUILD_SPEC.md` documents the full entity model and build conventions.
