# TASK — The practice agents (Friday, Bev, Sal, Rosie, Ada)

Five standing agents that work *inside* Leuk on behalf of the practice. Not the
dev-terminal fleet (`~/.claude/agents/*.md`, surfaced by the admin-only
`app/api/agents/[name]/route.ts`) — these are **product**. A clinician meets
them; they have names, memories, and a place in the UI.

This document is the settled design for all five. **Tranche 1 builds the spine
plus Friday and Bev**; Sal and Ada are tranche 2, Rosie tranche 3. Read the
whole thing before starting task 1 — the spine only works if it was designed
against all five.

## The two rulings that shape everything

**1. These are watchers, not chatbots.** The instinct is "agent = chat window."
Wrong for four of the five. Their value is that they run *unasked* — a
credentialing listing silently drifted, a payment came in under the published
rate, a note has been unsigned for four days. The primary output of an agent is
a **finding written to the inbox**, with evidence. Chat is how you interrogate a
finding after it lands, never the way you discover it. Friday is the exception:
she runs on a session, in a surface the clinician is already looking at.

**2. The model does the writing, not the deriving.** A drift diff, a rate delta,
an AR aging bucket — these are SQL. Compute them in a repo, hand the model the
small result, and let it write the sentence. Never ask a model to find something
a query can find: it costs money, it is slower, and it can be wrong about
arithmetic. Every finding must be reproducible without the model.

## Architecture (decided — do not re-litigate)

- **In-app.** These are Next routes + repos + a scheduled runner in this repo.
  They are NOT AWS AgentCore runtimes. Leuk's PHI path is Bedrock via
  `lib/ai/bedrock.ts`, which is already written, already BAA-reasoned, and
  already the only production-legal path. Use it.
- **PHI discipline is per-agent and is a design constraint, not a disclaimer.**
  Each agent declares a PHI class in its definition. Bev and Sal are
  `phi: none` — their model calls must be *structurally* incapable of carrying a
  client identity (Sal sees code + payer + date + amount, never a client). Friday
  and Rosie are `phi: yes` → Bedrock only, `logEvent` on every read/write, and
  never a byte of content in a log line.
- **Every finding carries its evidence.** A finding row stores the query result
  that produced it and a link to the surface that proves it. A number a
  clinician cannot click through to is a number they will not trust twice.
- **Nothing an agent produces is final.** No agent signs a note, sends a letter
  to a payer, books an appointment, or emails a client without a human approving
  the specific artifact. Drafts and findings only.

---

## The five

### Friday — clinical documentation

**Mission.** Turn a session into a defensible draft note so the clinician leaves
at 5pm instead of 7pm. She is the agent clinicians touch every day and the one
the product will be judged on.

She is more than the current `generate-note` prompt because she carries
**context**: the client's last note, the active treatment plan and goals, what
was assigned as homework, and the practitioner's own template and phrasing. A
prompt writes a note about a transcript. Friday writes the *next* note in an
ongoing course of care.

**Hard rules.**
- She NEVER signs. Output status is `draft`, always; a human moves it to
  `signed`. This is not a preference, it is the entire legal basis of the
  feature.
- Every clinical assertion traces to a transcript segment. No smoothing, no
  inference, no plausible filler.
- Uncertainty is **marked, not resolved**. Bad audio, crosstalk, an inaudible
  stretch → say so, in place, with the timestamp. A confident wrong note is far
  worse than a note with a gap in it.
- She does not diagnose. She records the diagnosis the clinician stated.
- **Risk language is surfaced, never assessed.** If the transcript contains
  suicidal or homicidal ideation, an abuse disclosure, or a safety concern, it
  goes at the top of the draft, verbatim, with its timestamp. She does not rate
  it, triage it, or decide whether it matters.

**Second job — coding.** Suggest the CPT/ICD the documentation supports, with the
supporting language quoted. The rule that makes this trustworthy: **she suggests
the code the note supports, never the code that pays best.** When a higher-paying
code is plausible but undocumented, she says exactly what documentation is
missing and lets the clinician decide. Never auto-apply.

**Built on.** `transcripts`, `notes`, `note_templates`, `clients` (plan/goals),
`lib/ai/clinical.ts`, `lib/ai/bedrock.ts`, `lib/cpt-labels.generated.ts`.
**Surface.** The note editor and the calls side-panel (both exist) + a "your
note is ready" finding. **PHI: yes.**

### Bev — credentialing and panel presence

**Mission.** Keep the practice's presence in payer directories accurate, and
find the panels it should be on. The single most hated recurring chore in a
small practice, and no EHR touches it.

Weekly, she sweeps the payer FHIR directories for every NPI/TIN in the practice
and diffs against the last sweep. She reports: listings that disappeared, fields
that drifted (address, phone, taxonomy, accepting-new-patients — a wrong
taxonomy makes you invisible in the plan's own search and no one ever tells
you), attestations coming due, and panels the peer cohort at comparable TINs is
on that you are not, with what they pay.

**Hard rules.**
- **"Listed in a payer's directory" ≠ "in-network" ≠ "accepting new patients."**
  Never upgrade one into the other. This rule already exists verbatim in
  `DIRECTORY_SYSTEM` (`lib/ai/directory-tools.ts`) — reuse it, don't rewrite it.
- A disappearance is only reported after **two consecutive sweeps** confirm it.
  Payer feeds are flaky; a false "you've been dropped from Cigna" at 6am costs
  more trust than a one-week delay costs anything.
- Every claim carries its source and as-of date.
- She drafts the roster correction. A human sends it. She never files.

**Built on.** `getCredentialingFootprint(npi)`, `getStanding(npi)`,
`getTinCohort(tin)` — all already in `lib/repos/rate-signals.ts` — plus
`lib/repos/networks.ts`. **PHI: none.**

### Sal — rates and underpayment *(tranche 2)*

**Mission.** Know what the practice should be paid, and notice when it isn't.

*Forward:* where a practitioner sits in the published band for a code/payer/
geography, against the CMS benchmark, and a drafted rate-increase request citing
real comparables. *Backward, and this is where the money is:* reconcile what was
actually paid against what the payer's own machine-readable file says the
negotiated rate is. Flag the deltas, grouped by payer and code so a pattern is
visible. Big groups buy this as a product; Leuk can hand it to a solo because it
already holds the published side.

**Hard rules.**
- An MRF rate is *what the insurer published it pays in-network*, per payer/TIN/
  code, as of a date. It is not a guarantee, not revenue, not the patient's
  price. Never quote one without payer + code + as-of.
- A delta is **a flag for review, not an accusation.** Modifiers, place of
  service, and contract-specific terms all produce legitimate deltas. Say
  "worth checking," never "they underpaid you," unless the contract is known.
- **The model never sees a client.** Sal's inputs are code, payer, date, amount.
  Enforce that in the tool layer, not the prompt.
- Never sends anything to a payer.

**Built on.** `getRateBands`, `getPercentilePlacement`, `PayerCodeSpread`,
`getRateSignals` (`lib/repos/rate-signals.ts`), CMS PFS (`sql/033`),
`invoices`/`payments`/`codes`. **PHI: none** (by the aggregation constraint).

### Ada — Monday morning *(tranche 2)*

**Mission.** One page, every Monday, that nobody asked for and everybody reads.

Revenue against prior period; who owes what and how long it's been; no-show
rate; clients not seen in six weeks (clinical risk *and* revenue); notes
unsigned past 72 hours (compliance exposure); attestations due; open slots this
week and what they're worth.

**Hard rules.**
- **Every number links to the surface that proves it.** A number without a link
  is not shipped.
- She states facts, not clinical direction. "Client X hasn't been seen in eight
  weeks" is hers. "You should discharge them" is not.
- **No PHI leaves the app.** The email says "your Monday page is ready" and
  links; the page holds the content. Never a client name in an email body.

**Built on.** `lib/briefing.ts` (same machine, pointed at a practice),
`lib/insights-metrics.ts`, `lib/analytics/metrics.ts`, `lib/repos/dashboard.ts`.
**PHI: yes** (in-app only).

### Rosie — the front office *(tranche 3)*

**Mission.** Everything between "a person wants care" and "the session is
booked, documented, and paid." For a solo practice that cannot afford a
receptionist, she *is* the receptionist — that's the pitch.

Verify coverage from an insurance card against plan data; answer "do you take my
insurance" for inbound leads; turn a lead into a booked appointment on real
availability; chase unreturned intake forms; send statements and chase balances;
offer a Thursday cancellation to the right person.

**Hard rules.**
- **She never triages.** A pre-model, hard-coded check runs on every inbound
  message: distress or crisis language stops the automated flow, escalates to a
  human immediately, and surfaces 988. This is a code path, not a prompt
  instruction — prompts can be talked out of things. A person in crisis reaching
  a bot is the worst failure this product can have.
- A coverage check is an **estimate** unless a real eligibility response came
  back. Never promise a patient an out-of-pocket number.
- Never books, sends, or charges without explicit confirmation.

**Built on.** `threads`/`messages`, `appointments`/`availability`, `forms`,
`invoices`, `policies`, `payers`, `networks`. **Needs a `waitlist` table — does
not exist.** **PHI: yes.**

---

## TRANCHE 1 — your scope

Build the spine, then Friday and Bev on top of it. Do not start Sal, Ada, or
Rosie.

### 1. The agent spine — `lib/agents/`

A registry, a runner, and a findings model.

- `lib/agents/registry.ts` — one definition per agent: `id`, display name, one-
  line mission, `phi: 'none' | 'yes'`, schedule (cron-ish descriptor or
  `on-demand`), and the entry point. Adding an agent is one entry.
- `lib/agents/run.ts` — executes one agent, records the run, writes findings.
  Every run gets a row whether it found anything or not; "Bev ran and found
  nothing" is information.
- `lib/repos/agents.ts` — reads/writes for runs and findings, ISO-string dates
  per house rules.

**Acceptance:** a new agent can be added with one registry entry and one entry-
point function, no changes to the runner, the repo, or the UI.

### 2. `sql/071_agent_runs_findings.sql`

- `agent_runs`: id, agent_id, started_at, finished_at, status
  (running|ok|failed), items_found, error text nullable, meta jsonb.
- `agent_findings`: id, agent_id, run_id FK, subject_type, subject_id, severity
  (info|attention|urgent), title, body_md, evidence jsonb (the query result that
  produced it), href (the surface that proves it), status
  (open|acknowledged|resolved|dismissed), created_at, resolved_at.
- Index findings by (agent_id, status, created_at desc) and by subject.

**Acceptance:** migration runs clean; RLS consistent with the neighbouring
tables (see `sql/064_rls_stragglers.sql`).

### 3. Friday

Upgrade the existing scribe into the agent specced above: client context
(previous note, plan, goals, homework), template awareness, in-place uncertainty
marking, risk-language surfacing at the top of the draft, and code suggestion
with quoted supporting language.

**Acceptance, verified on real seeded data, output pasted into the report:**
- A generated draft is status `draft` and there is no code path that signs.
- A transcript with a deliberately inaudible stretch produces a draft that names
  the gap and its timestamp rather than inventing content.
- A transcript containing risk language puts it at the top, verbatim, with a
  timestamp.
- A code suggestion quotes the documentation supporting it; a plausible-but-
  undocumented higher code is declined with the missing documentation named.
- No PHI in any log line. Grep your own output before claiming this.

### 4. Bev

The weekly sweep, the diff, and findings.

**Acceptance:**
- The diff is computed in SQL/TS. The model writes prose only. Show both in the
  report — the derived diff, and the sentence it became.
- A simulated single-sweep disappearance produces **no** finding; a second
  consecutive sweep produces one. Prove it with two runs.
- Every finding carries source + as-of date and an `href` that resolves.

### 5. Surface

- Findings land in the existing inbox/notifications path
  (`lib/repos/notifications.ts`, `app/(app)/inbox`).
- `/agents` — the fleet page: each agent, its mission line, last run, open
  findings, and a manual "run now." Add the route to `ROUTE_TITLES`.
- **Reuse primitives only.** If nothing in `components/ui/*` fits, compose;
  adding a primitive requires saying so explicitly in the report.

**Acceptance:** a finding is discoverable from the inbox without knowing the
`/agents` page exists.

### 6. Verify like you mean it

Sign in for real (`brendan@leuk.demo` / `demo`, port 3010), drive both agents
end to end, and look at the output — not the exit code. Paste real transcripts.

## Seam

**OWNS:** `lib/agents/*`, `lib/repos/agents.ts`, `lib/ai/*`,
`app/(app)/agents/*`, `app/api/agents/run/*`, `app/api/agents/findings/*`,
`sql/071–079`, note-editor and calls side-panel changes needed for Friday.

**DO NOT TOUCH:** `components/ui/*` (no new primitives),
`app/api/agents/[name]/route.ts` (the admin dev-roster viewer — a static
sibling segment wins over the dynamic one in Next's matcher, so your routes
are safe; **verify `/api/agents/data-agent` still returns 200 before you
report**), `sql/` outside 071–079, `app/(site)/*` and the public directory,
`ops/harvest/*`.

## House rules that bind you

Stage files explicitly — `git add -A` is banned, multiple sessions share this
tree. Reuse the design system; no new primitives without saying so. No page-
level H1s. Repos return ISO strings, never `Date`. `requireUser()`/
`requireRole()` on every route; `logEvent` on PHI reads/writes; **never log
PHI**. `.env.local` may hold a live Neon URL — clean up test rows you create.
The dev-only Anthropic fallback in `lib/ai/clinical.ts` stays hard-gated to
non-production; do not weaken it.

**SPEND CAP: as stated in your kickoff.** Log every billed invocation and its
estimated cost in the report. If a step needs more than the cap, stop that step
and write it up — do not spend past it.

## Report

`docs/reports/<date>-practice-agents-t1.md`: what shipped (commits), the
verification evidence above pasted in full, premise corrections (encouraged —
if something in this brief is wrong about the codebase, say so plainly), flags
for the lead, and what tranche 2 should change. Commit, push, print a five-line
summary, STOP. Merges are the lead's.
