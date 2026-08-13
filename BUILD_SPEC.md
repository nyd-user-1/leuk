# Leuk — Build Spec (canonical; every agent reads this first)

All-in-one practice management + EHR for healthcare/wellness professionals, branded **Leuk** (Leuk Psychiatry). Feature parity targets: Carepatron / SimplePractice. Surfaces: appointment scheduling (drag-and-drop calendar, public booking links), clinical documentation (SOAP/DAP templates + AI charting assistant), telehealth (1-on-1 video), billing & payments (invoices, Stripe), client portal (records, intake forms, secure messaging). Compliance posture: HIPAA/GDPR/PIPEDA — v1 gestures are: RBAC guards on every API route, append-only `audit_events` on PHI reads/writes, session cookies `httpOnly+secure+sameSite`, no PHI in logs, soft-delete on clinical data.

**Definition of done:** working v1 that runs locally on mock fixtures with zero env vars; attaching a NeonDB (`DATABASE_URL`) + running `sql/*.sql` makes it real. No unnecessary code, no speculative abstraction.

## Design system

The component spec is `/Users/brendanstanton/Vaults/hq/Carepatron/Design System/Component Catalog.md` — §1 tokens, **§1b Leuk theme (USE THESE VALUES)**, §2 index, §3 + §3b component specs, sibling notes for screens. Visual language: Carepatron's layouts re-skinned Leuk — light canvas `#F2F3F6`, white surfaces, **navy sidebar `#1C2440`** (active band `#2B3557`), **teal primary `#3F8290`** (hover `#35707C`, weak `#B7D8DD`), **amber accent `#F0AE55`** (`#C58A2E` on white), ink `#212A47`. Status: success `#16A34A`/`#DCFCE7`, warning `#B7791F`/`#FBE8C9`, danger `#DC2626`/`#FEE2E2`, info tint `#EDE9FD`→ use teal-100 `#E3F0F2`. Scrim `rgba(18,13,40,.5)`. Video stage `#111019`. Radius 8/12/full. Type: Inter; 28/700 page titles, 19/600 card titles, 15 body, 14/500 labels, 13 captions.

## Stack + conventions

Next 16 App Router · React 19 · TypeScript strict · Tailwind v4 (`@import "tailwindcss"` + `@theme` in `app/globals.css`, tokens as CSS vars; NO tailwind.config) · `@neondatabase/serverless` · `stripe` · `prosemirror-*` (copy hq's exact dep list) · `bcryptjs`. Path alias `@/*`. Dev port **3010**. No other deps without necessity.

- API routes: `app/api/*/route.ts`, `NextResponse.json`, `export const dynamic = "force-dynamic"`, manual body validation. Every route calls `requireUser()`/`requireRole()` from `@/lib/auth`.
- Data: `lib/repos/<domain>.ts` per domain. Each repo function: if `hasDb` → tagged-template `sql\`...\`` (copy `tariffs/src/lib/db.ts` Proxy-lazy pattern), else → `lib/mock/<domain>.ts` fixtures (in-memory, mutable within process so demo CRUD works). Never crash without DATABASE_URL.
- Auth: cookie session (`leuk_session`, httpOnly). With DB: users table + bcrypt. Without DB: demo users auto-available — `brendan@leuk.demo` (practitioner/admin) and `casey@leuk.demo` (client), password `demo`. `requireRole('practitioner'|'admin'|'client')` guard per 44b's pattern.
- Client components only where interactivity demands; server components default.

## Borrow map (adapt, don't import cross-repo; copy code in)

- `hq/app/ui/prosemirror-editor.tsx` — markdown WYSIWYG, self-contained → `components/notes-editor.tsx` (restyle light).
- `hq/app/ui/icons.tsx` — inline icon set pattern → `components/ui/icons.tsx`, extend w/ catalog icon list.
- `hq/app/ui/menu.tsx`, `tooltip.tsx`, `confirm-dialog.tsx` — portal/dismiss logic reference.
- `tariffs/src/lib/db.ts` → `lib/db.ts`. `tariffs/src/lib/stripe.ts` + `api/stripe/checkout|webhook/route.ts` → payments (mock-degrade kept). `tariffs/src/lib/email.ts` → `lib/email.ts` (Resend, lazy, optional).
- `tariffs` ConsultScheduler + `api/consult` — booking-page reference. `tariffs/src/app/api/portal/entry/route.ts` — multipart upload → local `./uploads` when no blob token.
- `solar/sql/003_users_chats_messages.sql` + `api/chats/*` — messaging model. `44b/migrations/0006_filing_workflow.sql` — status lifecycle + audit events + human ids (`INV-2026-0001`). `childcare/src/app/application/page.tsx` — intake wizard shape. `insurance/src/lib/generatePdf.ts` — jsPDF superbill/invoice PDF.

## Entity model (canonical — types.ts, mocks, SQL, and repos MUST agree)

uuid PKs `gen_random_uuid()`, `created_at/updated_at TIMESTAMPTZ DEFAULT now()`, snake_case DB / camelCase TS.

- **users**: id, role CHECK(admin|practitioner|client), name, email UNIQUE, password_hash, avatar_hue (teal|amber|pink|blue), phone, timezone, deleted_at
- **clients**: id, user_id FK nullable (portal login), first/last name, dob, email, phone, address, gender, pronouns, status CHECK(lead|active|archived), tags text[], primary_practitioner_id FK users
- **services**: id, name, duration_min, price_cents, color (categorical slot), telehealth bool, active
- **locations**: id, name, address, kind CHECK(office|telehealth)
- **availability**: id, practitioner_id, weekday 0-6, start_time, end_time
- **appointments**: id, client_id, practitioner_id, service_id, location_id, starts_at, ends_at, status CHECK(scheduled|confirmed|arrived|completed|cancelled|no_show), video_room, booked_via CHECK(staff|portal|link), notes_brief, cancelled_reason
- **notes**: id, client_id, appointment_id nullable, author_id, template CHECK(soap|dap|progress|intake|free), title, body_md, status CHECK(draft|signed|locked), signed_at, deleted_at
- **note_templates**: id, name, template kind, body_md (prompt skeleton), is_builtin
- **transcripts**: id, appointment_id, segments JSONB [{t0,t1,speaker,text}], summary_md, status CHECK(recording|processing|ready)
- **forms**: id, title, description, schema JSONB (blocks: [{id,type(text|textarea|select|radio|checkbox|date|signature|scale|info),label,options,required}]), status CHECK(draft|published)
- **form_responses**: id, form_id, client_id, answers JSONB, status CHECK(sent|in_progress|submitted), submitted_at
- **invoices**: id, number UNIQUE (INV-2026-0001), client_id, appointment_id nullable, status CHECK(draft|sent|paid|overdue|void), issued_on, due_on, subtotal_cents, tax_cents, total_cents, stripe_checkout_id
- **invoice_items**: id, invoice_id CASCADE, description, qty, unit_cents, amount_cents
- **payments**: id, invoice_id, amount_cents, method CHECK(card|cash|insurance|other), stripe_payment_intent, paid_at
- **payers**: id, name, payer_code; **insurance_policies**: id, client_id, payer_id, member_id, group_id, kind CHECK(primary|secondary), status CHECK(unverified|verified|inactive), copay_cents
- **threads**: id, client_id, subject, status CHECK(open|closed), last_message_at; **messages**: id, thread_id CASCADE, sender_id, body, read_at
- **files**: id, client_id, uploader_id, name, mime, size_bytes, url, kind CHECK(upload|form_pdf|superbill)
- **audit_events** (append-only, no UPDATE/DELETE): id bigserial, actor_id, action, entity, entity_id, meta JSONB, at
- **sessions**: token PK, user_id, expires_at

## File map (ownership boundaries for parallel agents)

- **Foundation (task 4):** package.json, configs, `app/globals.css`, `app/layout.tsx`, `lib/{db,auth,types,audit,format,email}.ts`, `lib/mock/index.ts` (store plumbing + users), `components/ui/*` (kit below), `components/shell/{sidebar,topbar,app-shell,nav-panel}.tsx`, `app/(auth)/sign-in/page.tsx`, `app/page.tsx` (redirect by role), `app/api/auth/*`, `middleware/proxy` none.
- **Scheduling (5):** `app/(app)/calendar/*`, `app/book/[slug]/*`, `app/api/{appointments,availability,book}/*`, `lib/repos/{appointments,services}.ts`, `lib/mock/{appointments,services}.ts`, settings pages `app/(app)/settings/{services,locations,availability}/*`
- **Clients/EHR (6):** `app/(app)/clients/*` (index + [id] tabs Overview|Personal|Insurance|Documentation|Billing), `app/api/{clients,policies,files}/*`, `lib/repos/{clients,policies,files}.ts` + mocks
- **Clinical docs (7):** `components/notes-editor.tsx`, `app/(app)/templates/*`, notes UI inside client detail (`components/notes/*`), `app/api/{notes,templates,ai}/*` (ai = stubbed transcribe/generate-note/ask endpoints returning realistic canned output, clearly marked for real keys), `lib/repos/notes.ts` + mocks
- **Telehealth (8):** `app/(app)/calls/[room]/*`, `app/portal/call/[room]/*` shared components `components/call/*`, `app/api/signal/*` (in-memory WebRTC signaling), scribe side-panel hooks into task-7 endpoints
- **Billing (9):** `app/(app)/billing/*` (dashboard stats + invoices + payers tabs), `app/api/{invoices,payments,stripe}/*`, `lib/{stripe,pdf}.ts`, `lib/repos/{invoices,payers}.ts` + mocks
- **Portal/Inbox (10):** `app/portal/*` (dashboard, appointments, records, invoices, forms/[id] renderer, messages), `app/(app)/inbox/*` (practitioner side), form builder `app/(app)/templates/forms/*`, `app/api/{threads,messages,forms}/*`, `lib/repos/{threads,forms}.ts` + mocks
- **SQL (11):** `sql/001_schema.sql`, `sql/002_seed.sql`, `README.md` DB section

## UI kit (foundation builds; features consume — names/variants per catalog §3/§3b)

Button(primary|secondary|ghost|danger|danger-solid; sm|md|xl; leftIcon) · IconButton · TextLink · Field/FieldLabel/FieldHint (+affixes) · Textarea · Select (+searchable) · Checkbox · Radio · Toggle · Tabs · SearchInput · Badge(variant family) · Tag · Avatar(+hue)/AvatarGroup · Card/SettingsCard · EmptyState · Divider · DropdownMenu/MenuItem · KebabMenu · Tooltip · Toast(+provider) · Modal · SidePanel · Table(+Toolbar page variant+Pagination) · FilterChip · Breadcrumb · DatePicker · Banner · StatCard · ListRow · AccordionSection · Spinner/Skeleton · ProgressBar · SegmentedControl · Stepper · FileUpload · ChoiceChip · ColorSwatch. Shell: Sidebar (config-driven items + count badges + footer UserChip), TopBar, AppShell(workspace|portal), NavPanel (settings).

Sidebar items — workspace: Calendar · Inbox · Clients · Billing · Templates · Settings (+Team later). Portal: Home · Appointments · Records · Forms · Invoices · Messages.

## Verification bar

`npm run build` must pass clean at every task's end. Feature agents: also exercise your pages via `npm run dev -p 3010` + curl the API routes you added (mock mode). No console errors on your pages.
