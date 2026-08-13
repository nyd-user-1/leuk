# TASK — PHI security hardening pass

_Brief for a fresh session. This is the technical-safeguards slice of HIPAA — the
buildable part. Legal (BAAs) and administrative (risk analysis, policies,
training) are founder tasks, out of scope here but noted at the end._

## Where we are (honest baseline)

**Not HIPAA-compliant today — and that's fine: demo data only, no real PHI yet.**
This pass builds the technical foundation so everything added later inherits it;
retrofitting auth/audit after real PHI lands is the expensive path.

Existing foundation (verified, don't rebuild): bcrypt password hashing, cookie
sessions (`lib/auth.ts`, `SESSION_COOKIE`), `requireUser()`/`requireRole()` used
in ~40 API routes, an append-only audit log (`logEvent`) called from 43 sites
across 24 `app/api/*` route groups. Neon (DB) + Vercel (host/Blob) + Stripe
(account exists) are the infrastructure.

## The gaps to close (in priority order)

### 1. Authorization / IDOR audit — HIGHEST VALUE, do first
The single most common real-world PHI breach in apps like this is one
authenticated user reading another's records by changing an id. Sweep **all 24
`app/api/*` route groups**: every route that returns or mutates PHI must assert
BOTH (a) role via `requireRole`, AND (b) **ownership** — that the requested
resource belongs to the caller (client sees only their own record; practitioner
only their own patients). Drive it with the two demo logins
(`brendan@leuk.demo` practitioner / `casey@leuk.demo` client, pw `demo`):
try to read the other user's appointments, notes, invoices, messages, files by
id. Report every route where ownership isn't enforced; fix with a shared
ownership-check helper. **Pay special attention to `app/api/files/download`** —
file proxies are classic IDOR + path-traversal territory.

### 2. Session hardening
`SESSION_DAYS = 30` with no idle timeout. HIPAA expects automatic logoff. Add:
idle timeout (e.g. 30 min) alongside the absolute expiry, "log out everywhere"
(invalidate all sessions for a user), and confirm the session cookie is
`httpOnly` + `secure` + `sameSite`. Keep it simple; reuse the existing sessions
table.

### 3. MFA (TOTP)
No second factor today. Add optional-then-enforceable TOTP (authenticator-app
style) for practitioner accounts at minimum (they see many patients' PHI).
Enrollment + verify flow + recovery codes. Check `/design-system` for existing
form/input primitives before building any UI.

### 4. Audit-log completeness + a viewer
43 call sites across 24 groups — verify EVERY PHI read and write is logged
(actor, action, resource, timestamp; **never log PHI values themselves**).
Report gaps, close them. Then build a practitioner/admin-facing audit viewer:
HIPAA requires you can *review* activity, not merely record it. Read-only,
paginated, filterable by user/date.

### 5. PHI hygiene sweep + data map
- No clinical PHI in URLs or query params (they land in server/proxy logs),
  in application logs, or in the **public** Blob store (patient documents must
  go through the authenticated `files/download` proxy from a PRIVATE store —
  confirm which store they're in).
- Write `docs/PHI-DATA-MAP.md`: which tables/columns hold PHI. This document is
  also the seed of the future formal risk analysis.

### 6. Payments PHI guard (Stripe)
Stripe does NOT sign BAAs and does not need to — payment processing is under
HIPAA's payment exception — **but only if PHI never enters Stripe.** Audit the
payments path (`app/api/payments`, `app/api/invoices`): invoice descriptions /
line items / metadata sent to Stripe must be generic ("Professional services"),
never diagnosis or clinical detail. Add a guard/test so a clinical string can't
reach a Stripe call.

### 7. Baseline hardening
Security headers (CSP, HSTS, X-Frame-Options, etc.), rate limiting on the auth
endpoints (login/MFA), and generic auth error messages (no user-enumeration).

## Rules / boundaries

- **Parallel-safe scope**: `lib/auth*`, `app/api/*`, portal shells, middleware,
  security config. **Do NOT touch** `scripts/ingest-payers.mjs`, `.harvest/*`,
  `lib/repos/networks.ts`, `lib/insurance-options.ts`, `lib/program-taxonomy.ts`,
  or the marketing/`/providers`/`/programs` surfaces — other terminals own those
  and have live crawls running. Stage only your own files; never `git add -A`
  (shared tree, multiple sessions).
- Reuse the ~44 `components/ui/*` primitives (browse `/design-system`); no new
  primitives without saying so explicitly. Server components by default.
- Never log PHI. Audit entries record that an action happened, never the
  clinical content.
- Verify on the dev server (port 3010, `npm run dev`). Don't deploy; commit only
  when Brendan says.
- If a DB migration is needed (MFA secret column, session idle-at), add it as a
  new `sql/0NN_*.sql` following the existing numbering and apply to Neon.

## Out of scope (founder tasks — note, don't attempt)
- **BAAs**: Neon (Business plan), Vercel (Enterprise), Anthropic (for any AI
  feature touching PHI — there's an `app/api/ai` route), email/SMS vendor.
- **Administrative**: written security risk analysis, designated security
  officer, workforce training, incident-response + contingency plans. (OCR fines
  most often cite the missing risk analysis — flag this to Brendan, don't write
  it.)
- Breach-notification procedures, patient rights (access/amendment) workflows.

## Suggested first report
Before building: the IDOR audit results (which routes lack ownership checks) +
the PHI data map + which Blob store patient files live in. Those three are the
highest-signal findings and shape everything after.
