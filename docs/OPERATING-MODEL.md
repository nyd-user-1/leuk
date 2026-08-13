# The Operating Model — how the terminal ecosystem runs

Formalized 2026-07-18 (the founder's directive: "self-sustaining ecosystem,
self-healing, self-improving — agents who each have a specialty and know how to
work together"). This is the loop written down: how work moves from the founder's
direction to shipped, verified, recorded outcomes without any single session
holding it all in its head.

The invariant identities live in `~/.claude/agents/*.md` (cross-repo, user-level).
The variable work lives in `docs/TASK-*.md` briefs. This document is the **loop**
that connects them.

## The cast

One **lead** (Fable) + a roster of specialist agents, each with a stable identity
and a seam:

| Agent | Model | Specialty |
| --- | --- | --- |
| `lead-agent` | fable | Orchestration — briefs, kickoffs, reviews, rulings, memory |
| `data-agent` | fable | Supply-side acquisition — MRF/TiC, FHIR, NPPES/CMS/DOL, loaders |
| `quality-agent` | opus | Data trustworthiness + the surfaces that expose it |
| `docs-agent` | opus | Institutional knowledge — Linear structure + the three documents |
| `review-agent` | opus | Adversarial engineering review of a named commit range |
| `ui-agent` | opus | Guardian of both design systems (Leuk kit + 44B paper) |
| `security-agent` | opus | PHI/HIPAA + auth guards + secret hygiene, both repos |
| `ops-agent` | opus | The automation fleets — harvestd + matview cron, tripwires, migration sequencing |
| `research-agent` | opus | Discovery spikes that end in a sized, buildable brief |
| `qa-agent` | opus | End-to-end headless product drives after big change days |

**Model budget:** fable = the lead + the hardest-judgment agent; opus = the rest.

## The loop

```
  founder direction
        │
        ▼
  ┌───────────┐   brief (docs/TASK-X.md)   ┌──────────┐
  │   LEAD    │ ─────────────────────────▶ │  AGENT   │
  │  writes   │   + kickoff paragraph        │ executes │
  │  reviews  │ ◀───────────────────────── │  reports │
  │   rules   │   report (docs/reports/…)   └──────────┘
  └───────────┘
        │  accept / correct / redirect (explicit ruling on every flag)
        ▼
   next tranche
```

1. **Brief.** The lead writes `docs/TASK-<NAME>.md`: mission, enumerated tasks
   with acceptance criteria, `OWNS` / `DO-NOT-TOUCH` seams, a disjoint `sql/0XX`
   range, house rules, and the report protocol. Identity is *not* re-written into
   the brief — that lives in the agent file; the brief carries only what varies.
2. **Kickoff.** A short paragraph, pasted into a fresh session — identity + seam,
   brief path + which tasks, any FIRST ACTION others depend on, explicit
   owns/do-NOT-touch, and the closing discipline. See "The kickoff" below.
3. **Execute.** The agent works only inside its seam, opens/closes its own Linear
   issues, verifies end-to-end, and stages explicitly.
4. **Report.** The agent writes `docs/reports/<date>-<agent>[-tN].md`: what
   shipped (commits), verification evidence, premise corrections (encouraged),
   flags for the lead, next-tranche suggestions. Commit, push, **STOP**.
5. **Review.** The lead reviews the report the moment it lands, re-runs a claim
   when a decision rides on it, and issues an **explicit ruling on every flag** —
   silence is not a ruling.
6. **Redirect.** The lead re-plans the next tranche from what the reports actually
   showed, and updates memory + Linear so a fresh lead can resume cold.

## Conventions

- **Tranche numbering.** Each agent's work on a brief is numbered `tN`. A report
  for tranche 2 of the review terminal is `docs/reports/<date>-review-t2.md` (the
  `-tN` suffix is omitted for a first/only tranche). A brief can pivot an agent's
  role mid-file (see `TASK-DOCS-LINEAR.md`'s tranche-2 role pivot to review) — the
  tranche number tracks the work, not the identity.
- **Seams are disjoint and granted.** Every agent works inside an `OWNS` /
  `DO-NOT-TOUCH` contract from its brief, plus a non-overlapping `sql/0XX` range.
  On a shared file (`ops/harvest/jobs.json`, `scripts/db-atlas.mjs`), stage only
  your hunk and `pull --rebase` first. **Conflicts go to the lead — never
  clobber.** The lead is the only arbiter of seams.
- **Linear is the shared brain.** `docs-agent` owns all *structure* (projects,
  milestones, Documents, moves/closes); every other agent files/closes only its
  own issues. Every shipped feature earns an **NYS-100-quality** record (feature
  story + technical spec + not-in-v1). Premise-checking tickets are first-class.
- **Verification means exercised.** "Verified" is never "the script exited 0" — it
  is the behavior reproduced end-to-end (distinct-NPI counts reconciled, the
  surface rendered, the endpoint hit). Look at output, not exit codes. Leuk
  headless gotcha: POST `/api/auth/login` and carry the cookie; `networkidle`
  never settles under HMR.

## The monitor pattern (a loop isn't a loop unless it's a loop)

The lead keeps a **Monitor** on `docs/reports/` (a new report → review it) and on
the harvest runner log when a queue is live, and reviews the moment work lands
rather than on a fixed schedule. The lead kicks the runner early when a queue is
hot instead of waiting for 01:04 — but never races a live run (check
`.harvest/runner/lock.json`) and never schedules the runner *after* the 04:12
matview cron (that ordering is load-bearing; see memory `leuk-harvestd`).

## The kickoff (founder correction, 2026-07-20)

**A kickoff is a short paragraph, not one line.** The one-line form this section
used to prescribe was wrong — it dropped the seam and the closing discipline,
which are exactly the parts that keep concurrent terminals from colliding and
keep work from dying uncommitted. The practice that actually works is in the
2026-07-20 transcripts. Two that ran cleanly, verbatim:

> You are ui-agent on the PORTAL seam. Execute docs/TASK-STRIPE-MARKETPLACE.md
> tasks T4+T5 per your identity contract. FIRST ACTION: create
> lib/email/stripe-notifications.ts with typed stub functions … and commit
> immediately — Terminal A imports them. Then: … You own
> lib/email/stripe-notifications.ts + portal pay UI only. Do NOT touch
> app/api/* or Settings. Reset ~1:30am: commit early/often, stop clean, report.

> You are qa-agent. Execute docs/TASK-STRIPE-MARKETPLACE.md task T6 prep per
> your identity contract: … You own scripts/qa/ only. … Reset ~1:30am: commit,
> stop clean, report.

**The five things a kickoff carries:**

1. **Identity** — the agent type, plus **the seam name when several agents of
   the same type are running** ("ui-agent on the PORTAL seam").
2. **The brief path and which tasks within it** — not the whole file when only
   part applies.
3. **Any FIRST ACTION other terminals depend on**, with why ("commit
   immediately — Terminal A imports them").
4. **Explicit owns / do NOT touch** — named paths, both directions.
5. **The closing discipline** — commit early/often with explicit pathspecs,
   stop clean, report; **plus the reset time when one is near**.

**Written fresh, per dispatch, by the lead.** There is deliberately no
fill-in-the-blank template here: the founder is not filling in brackets, and
only the lead knows the tranche — which seams are hot, which terminal is
waiting on which first action, how close the reset is. A template would
reintroduce exactly the omissions this correction exists to fix.

Everything *invariant* — the read-first list, house rules, seam discipline,
report format, escalation rules — stays in the agent file, not the kickoff.

## Standing decisions (don't re-litigate)

- **Expansion is APPROVED** (founder ruling, 2026-07-18 evening — this was
  always his call, and he made it): harvest everything reachable from every
  MRF, priority order (1) New York, (2) our current market + provider
  universe, (3) national back-out. Code panel as broad as possible (NYS-50).
  The zero-terminal harvestd queue is the default path; manifest-minting
  stays human. (Retires the old "NY-behavioral until 49.4%" wait-state.)
- An **always-on box** (Mac mini / cloud VM) is the upgrade when lid-physics or a
  missed night actually bites — not before.
- The **01:04 runner → 04:12 matview cron** ordering is load-bearing; never invert.
- **Agent definitions evolve through the same review loop as code** — a change to
  an identity file is briefed, executed, reviewed, and recorded like any other work
  (`docs-agent` owns agent-file upkeep; see `docs/TASK-DOCS-ENGINE.md`).

---

*Mirror of the seed memory `leuk-operating-model`. Dual-homed: this repo file is
the source of truth; the Linear Document is the readable mirror (docs-agent keeps
them in step).*

## Linear governance (founder ruling, 2026-07-18)

Linear MCP measured at 43% of usage. Effective immediately:

- **Only the lead calls Linear.** No other agent/terminal connects the
  Linear MCP or files issues directly.
- The lead syncs TWICE per session: once at start (pull the open board into
  `docs/QUEUE.md`) and once at end (batch-file everything owed).
- Executors write **Linear intents** in their reports instead — a short
  block per item: `issue (or NEW) · action (comment/close/create) ·
  evidence`. The lead executes them in the end-of-session batch.
- `docs/QUEUE.md` is the shared brain between syncs: the lead keeps warm
  assignments + pending intents there; briefs point at it.

## Spawn discipline — terminals over invisible sub-agents (founder ruling, 2026-07-20)

A visible window can be watched, jumped into, and stopped. An in-session
sub-agent can't be. That is the whole reason for this rule.

- **Every spawned agent MUST carry a domain `subagent_type`** (`ui-agent`,
  `quality-agent`, `qa-agent`, `data-agent`, …). The task-shaped string is the
  `name` label only. A generic/`general-purpose` spawn with the brief inline
  bypasses the agent-file identity contract — seams, verification standard, PHI
  handling, staging discipline — and is never acceptable.

- **Substantial, multi-step, or watchable work → hand the founder a kickoff
  prompt for a fresh terminal.** Write the brief, hand it over, don't spawn.
  The test is not "can I run this?" but "would he want to watch or interrupt
  it?" If yes, it belongs in a window.

- **Reusing one of the four warm terminals:** they sit near their context
  limits. Tell the founder to `/clear` the terminal first and re-kickoff there
  — never spawn a parallel agent alongside an idle window.

- **In-session spawns are reserved for bounded, short, clearly-scoped work.**

- **Whenever a spawn is running, the lead's next message says what it is and
  how to stop it.** No invisible work.

*Occasioned by 2026-07-20: the lead ran ten in-session spawns — an e2e payment
drive, a primitive-level table rework, a five-item UI batch, a security audit —
while all four worker terminals sat idle. Every spawn carried a correct domain
type, so the identity contract held; the pattern was still wrong, because the
founder could not see or stop any of it.*
