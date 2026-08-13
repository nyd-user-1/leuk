# TASK — Agent-ize the terminals (the ecosystem spec)

Goal: turn the proven terminal roles into **standing, invokable agents** so
any future session — or the lead directly via the Agent tool — can summon a
specialist with a stable identity, instead of re-writing identity into every
tranche brief. This is the founder's directive (2026-07-18): "self-sustaining
ecosystem, self-healing, self-improving — agents who each have a specialty
and know how to work together."

## The mechanism (how Claude Code does this)

Agent definitions are markdown files with YAML frontmatter. Two registries:
- `~/.claude/agents/<name>.md` — **user-level, cross-repo** (works in
  leuk, 44b, hq). USE THIS ONE — the founder wants agents redeployable
  across repos (e.g. docs-agent on 44b later).
- Frontmatter: `name`, `description` (when the lead should invoke it — this
  is the routing signal), `model` (opus default; fable only where flagged),
  `tools` (omit for all).
- Body = the **identity prompt**: everything invariant about the role.

**The split that makes this work:** identity (stable, in the agent file)
vs. tranche (variable, in a `docs/TASK-*.md` passed at invocation). A
kickoff becomes one line: *"You are &lt;agent&gt;. Execute docs/TASK-X.md
tranche N per your identity contract."* Same file serves interactive
terminals (founder pastes the line) and Agent-tool subagents (lead spawns
directly).

## Every agent definition MUST contain (the founder's checklist, completed)

1. **Mission + specialty** — one paragraph, what this agent is *for*.
2. **Read-first list** — repo docs + memory files that are its education
   (e.g. `docs/MRF-INDEXES.md` for data; both design systems for UI).
3. **House rules** — the repo-portable invariants: explicit staging only /
   `git add -A` banned; pull --rebase before push; push=deploy discipline;
   live-DB hygiene; no PHI in logs; report-then-STOP.
4. **Seam protocol** — it works ONLY inside an ownership contract (OWNS /
   DO-NOT-TOUCH + a sql-range) granted by the tranche brief; conflicts go to
   the lead, never resolved by clobbering.
5. **Verification standard** — "verified" means exercised end-to-end
   (headless login gotchas, look-at-output-not-exit-code, re-run the claim).
6. **Linear protocol** — open an issue when starting non-trivial work, close
   with evidence, NYS-100 as the quality bar for feature records.
7. **Report protocol** — `docs/reports/<date>-<agent>[-tN].md`: shipped
   (commits), verification evidence, premise corrections (encouraged —
   tranche 1 proved their value), flags for the lead, next-tranche
   suggestions. Commit, push, STOP.
8. **Escalation rules** — decide-and-document for reversible calls inside
   its seam; stop-and-flag for scope changes, destructive ops, spends
   (API budgets), and anything touching another agent's seam.

## The six agents to write

1. **`data-agent`** (model: fable) — supply-side acquisition: MRF/TiC,
   FHIR directories, NPPES/CMS/DOL reference layers, manifest minting, the
   egress-recon patterns (HealthSparq rule), loaders via psql COPY.
   Education: `docs/MRF-INDEXES.md`, `ops/harvest/README.md`, the coverage
   audit, memory `leuk-rate-signals` + `leuk-form5500-registry`.
2. **`quality-agent`** — data trustworthiness + the app surfaces that
   expose it: repo/matview correctness, query-performance forensics
   (measure before porting — the count(p.*) lesson), premise-checking
   tickets, small product surfaces. Education: sql/README traps, NYS-65/88
   family, the DataTable/primitives catalog.
3. **`docs-agent`** — institutional knowledge: Linear structure, the three
   living documents (Operations/Scripts/Atlas), dual-home rule,
   `docs/TASK-DOCS-ENGINE.md` is its standing charter. Redeployable to 44b.
4. **`review-agent`** — adversarial engineering review of a named commit
   range: correctness, security (auth/secrets/spawn-injection surfaces),
   failure modes, claims-vs-reality re-verification. Findings-only (never
   fixes), filed as Linear issues. An empty verified-clean list is a valid
   outcome.
5. **`ui-agent`** (NEW — founder explicitly wants this) — guardian of BOTH
   design systems: Leuk's 44-primitive kit (`components/ui/*`,
   `/design-system` page, the Component Catalog in the Obsidian vault
   `~/Vaults/hq/Carepatron/Design System/`) and 44B's editorial/paper
   system (44b `CLAUDE.md` "Design system" section). Duties: primitives
   everywhere (no one-offs), design-system adherence sweeps, propose
   improvements, and UPDATE the catalog/design-system page when a pattern
   is promoted (e.g. the stacked DataTable). Education: both CLAUDE.mds,
   memory `feedback-primitives-first`, `feedback-table-overflow`,
   `leuk-table-toolbar-variant`.
6. **`lead-agent`** (model: fable) — condensed identity, verbatim from the
   sitting lead: *Writes meticulous tranche briefs (enumerated tasks,
   acceptance criteria, seams, sql ranges, report protocol) and one-line
   kickoffs; reviews every report the moment it lands (maintain a Monitor
   on `docs/reports/` + the harvest runner log — a loop isn't a loop unless
   it's a loop); accepts/corrects/redirects with explicit rulings on every
   flag; conserves its own context for judgment (delegates bulk work,
   always); makes reversible calls without asking and surfaces
   founder-calls explicitly (expansion axes, purchases, spends); keeps
   memory current (operating-model + per-domain files) so any fresh lead
   can resume; budgets models (fable = lead + hardest-judgment agent,
   opus = the rest); owns cross-repo/meta work (44b, hq ports) that no
   terminal's seam covers; kicks the harvest runner early when a queue is
   hot instead of waiting for the schedule.*

## Also deliver

- `docs/OPERATING-MODEL.md` — the loop written down (brief → kickoff →
  execute → report → review → redirect), the tranche numbering convention,
  the monitor pattern, and the kickoff-line template. Mirror to a Linear
  Document. (Content seed: memory file `leuk-operating-model`.)
- Update `docs/TASK-DOCS-ENGINE.md` to add agent-file upkeep to its charter
  (definitions evolve via the same review loop as code).
- File one Linear issue per agent created (project: Leuk for ui-agent,
  Data Engine for data/quality, no-project for lead/docs/review — or a new
  "Ecosystem" project if the lead approves at review), each NYS-100-style.

## Execution notes

- Executor: docs-agent-to-be (the docs terminal), as its tranche 3.
- Mine the identity content from: the three `docs/TASK-*.md` briefs (tranche
  1+2), the three `docs/reports/2026-07-18-*.md` reports, both repos'
  `CLAUDE.md`s, and the memory index — the invariant parts are already
  written; this task is extraction + stabilization, not invention.
- Keep each agent file under ~120 lines. Identity, not tranche content.
- Ownership: `~/.claude/agents/*` (new), `docs/OPERATING-MODEL.md`,
  `docs/TASK-DOCS-ENGINE.md` (edit), Linear issues. Nothing else.
