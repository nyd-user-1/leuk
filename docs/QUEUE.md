# Lead queue — warm assignments + pending Linear intents

**2026-07-20 AFTERNOON (fable lead): 4 more tranches SHIPPED.**
NYS-50 **CLOSED** (/rates surfaces all 20 codes AND got ~3× faster — the real
gap was `rate_table_child_mv` being *pivoted* to 5 code columns, so 15 codes
had no column to select; sql/063 long-grain twin; 145→54ms first paint) ·
NYS-170 **CLOSED** (dup rowKey = `panels-panel.tsx` omitting `tin`, 3
collisions→0; the lead's spread-panel diagnosis was WRONG and measured false)
· UI batch #3 (record Overview geometry, portal chrome stripped, invoice
letterhead, breadcrumb token, **client-scoped portal search on its own
endpoint** — id from session only, no tamper surface) · document-privacy
audit + trust affordance.

**NYS-181 — FOUNDER ACTION, one env change:** Production/Preview/Development
`BLOB_READ_WRITE_TOKEN` points at a THIRD (public) store. Uploads fail CLOSED
(500, no leak, zero `clients/` objects there). `lib/blob.ts` selects by TOKEN
and ignores `BLOB_STORE_ID`, so Production's correct-looking `BLOB_STORE_ID`
is vestigial. Repoint at `store_AiBVM9YwEidc0qgp`, then re-run audit items
1–3 against a deployment. **The shipped document-privacy copy is true of
LOCAL ONLY until then.**

**PERMANENT DATA HAZARD:** `file.view` rows written before `af5b0e3` are
phantoms (denied requests logged as views); `audit_events` is append-only so
they cannot be corrected. Anything querying `file.view` will over-count
access — count `file.download` instead.

**2026-07-20 DAY SESSION (fable lead): EHR records + UI batch #2 SHIPPED.**
NYS-179 (client record is a real EHR: private-blob documents, note signing +
append-only amendments, read auditing in the repos, honest seed — sql/062) and
NYS-180 (Rules become documents in the reused DocSheet, section labels, global
H1 icon removed) both Done. Reports: `2026-07-20-ehr-storage.md` ·
`2026-07-20-ehr-surfaces.md` · `2026-07-20-workspace-rules-headers.md`.

**FOUNDER DECISIONS OPEN (nothing proceeds without a ruling):**
NYS-175 fee labelling (Stripe's component calls our platform fee "Processing
fees"; our email correctly says "Platform fee" — GUARDRAIL: never fix the
email down to Stripe's wording) · NYS-176 GFE (4 schema gaps; 3 are wiring —
we already hold NPPES NPIs + hcpcs_codes) · NYS-177 CLAUDE.md H1 rule is
factually stale · NYS-178 document retraction (a file on the wrong chart
cannot be removed = PHI exposure) · MIME allowlist on the PHI store ·
/dashboard "Platform data" label · pricing model.

**Engineering backlog:** NYS-170 (/rates dup rowKeys — cause found: key omits
CPT/place-of-service) · NYS-171 (Anthem count 1.15s) · NYS-172 (marketplace
polish: Resend id capture, lib/email consolidation, ⌘K entries, banner
spinner) · NYS-174 (onboarding UI, 6 items incl. missing status poll).

**PROCESS — shared-index sweeps happened TWICE on 2026-07-20.** Staging
discipline is NOT sufficient: another agent running `git commit` without a
pathspec commits YOUR staged files. Every kickoff must require
`git commit -m "…" -- <paths>`.


**2026-07-20 OVERNIGHT (fable lead): Stripe tranche 1 SHIPPED + tranche 2
nearly done.** Full record: NYS-168 (Stripe tranche 1) + NYS-169 (TABLE
STANDARD v2, founder scope expansion) both Done; lead review
`docs/reports/2026-07-20-lead-review-stripe-t1.md`. Backlog filed: NYS-170
(/rates dup rowKeys) · NYS-171 (Anthem-June count perf) · NYS-172 (marketplace
polish batch) · NYS-173 (DECISION fork 7: on_behalf_of vs own-data
Transactions — blocked on T6 evidence). **ONLY OPEN ITEM: T6 e2e drive,
founder-gated on sandbox Connect signup** — CLEARED 2026-07-20 ~03:10 on
**acct_1T1DhqFTCTbH09lM (NYSgpt sandbox)**; the earlier acct_1T1DhaFZHX4S0kX2
in these notes was a DIFFERENT environment, ignore it. Keys re-saved 03:08 →
the first-captured whsec went stale (forwarder had authed to the old
account); forwarder + dev server rebuilt against the current key before the
drive. Agent stripe-t6-drive parked ready, earnings-surface
parked for the 2 demo screenshots (resume with charge id). Env: sandbox keys
live in .env.local (QUOTED values), two-scope stripe-listen detached, whsec
captured. NEW HOUSE RULE all kickoffs: `git diff --cached --name-only` before
EVERY commit (shared-index sweep incident, resolved). ui-workspace-v4's dead
session recovered at 740770d. ~20 local commits, push founder-gated.

**Original 2026-07-20 note:** THE BIG PROJECT = Stripe Connect marketplace.
Decision record + tranche-1 brief: `docs/TASK-STRIPE-MARKETPLACE.md`
(committed a2c0230). Handoff memory: handoff-2026-07-20-stripe-marketplace.

Maintained by the lead (see OPERATING-MODEL.md → Linear governance).
Last sync: 2026-07-18 ~21:30 (start-of-session pull; NYS-150 filed).

## Board snapshot (open, NYS team)

- **In Progress (8):** NYS-37 (Find-my-plan, Urgent) · NYS-147 (DataTable
  roadmap — founder's own terminal, small signed-off increments post-revert) ·
  NYS-25 (Empire OOM) · NYS-26 (NY-license expansion) · NYS-32 (KYR ph2) ·
  NYS-36 (plan entity) · NYS-91 (/rates reductive) · NYS-13 (UHC PoC).
- **Todo:** empty. **Backlog ~80**, notable recents: NYS-149 (runner
  honesty), NYS-148 (record shape), NYS-146 (5500-SF), NYS-145 (/orgs card),
  NYS-150 (rate-API epic, filed this sync).

## Warm assignments

- **ui-agent** — TASK-PAYR-PAGES **DONE** (b80a029, lead-verified 200/0-placeholder/
  honesty-labeled; report docs/reports/2026-07-18-ui-payr.md; NOT pushed —
  founder reviews at /pricing-data · /payer-negotiation · /payer-disputes;
  4 founder flags open: nav-dropdown add, %-of-Medicare section, route slugs,
  contact form). Behind it: the huge UI backlog —
  NYS-147 restart (founder-driven, small increments), NYS-148 record shape,
  NYS-127 /directory port, NYS-134 public /search.
- **data-agent** — TASK-DATA-DETACHED **tasks 1+2 DONE** (c2b76ed,
  lead-verified: org_network_rates re-adopted 603,345 rows; form5500_sf_filings
  52,375 rows / 31,016 net-new EINs, registry +45.7% — but NY lift is only
  ~98 EINs, structural). Task 3 Anthem/Empire DEFERRED on runner contention
  (accepted ruling) — launch post-04:12 in a clean window; URLs good to
  2026-08-21. **Tranche 2 (TASK-DATA-FIREHOSE) DISPATCHED by the lead**
  (Agent tool, 2026-07-18 ~22:20): NYS-25 diag + NYS-26 measure + MRF
  universe walk → staged manifests + NYS-50 broad-code projection.
  Founder is out of this loop except manifest minting. **T2 DONE + lead-
  reviewed 2026-07-18 ~23:00 (accepted)**: coverage 47.3→47.9%; Empire OOM
  three-killer root cause PROVEN (39F0-1 pass B clean, 476,322 rows /
  31,024 NPIs, DONE 22:54); NPPES blind spot nearly closed (571 net-new,
  not thousands); Oscar S3 bucket cracked → Optum BH carve-out files
  (+419 measured). Rulings: **sql/053 granted** (571-NPI re-key + NPPES
  names column, post-2am clean window); **NYS-50 load shape = (a)
  distinct-collapse** (provisional — architecture call, founder veto open);
  **no fleet all-codes rescan** until founder eyes that ruling;
  **Oscar/OBH entity aliases must be pre-seeded** before its manifests
  load. Founder-only: mint `oscar-obh.txt` (top staged win); June-batch
  Anthem URLs die Tue Jul 21 ~10:00 EDT — prefer re-minting the 2026-08
  ToC over racing them. `.harvest/mrf/diag39/39F0-1.csv` awaits a
  post-window load (June gz held on disk until then).
- **ops-agent** — idle-green. Belt CONFIRMED live: founder added
  DATABASE_URL 2026-07-18; nightly-rebuild dispatch runs green (2×, ~6m30s
  each, 22:18/22:35Z). NYS-149 honesty pass for run-stream.sh/run-two-pass.sh
  open.
  Tonight's 01:04 runner carries the wide-uhc-oxford rescan.
- **quality-agent** — NYS-34 merge design **DISPATCHED by the lead**
  (2026-07-18 ~22:20; founder ruling: agent makes the judgment, mechanism
  must be reversible — merge-map table, no destructive writes, tiers
  reported before any surface flips). Behind it: NYS-133 directory search
  reorder; suspect-badge (amber) on /workspace.

## Linear intents — ALL FILED (lead batch, 2026-07-19 ~07:00 by an Opus lead w/ MCP)

CLOSED: NYS-146 (SF load) · NYS-25 (Empire OOM, three-killer + 476,322 rows) ·
NYS-26 (571 net-new) · NYS-29 (HealthSparq walked) · NYS-30 (Oscar cracked) ·
NYS-34 (sql/052 applied). COMMENTED: NYS-147 (org_network_rates restored) ·
NYS-50 (broad-codes ruling). NEW: NYS-151 (load-shape decision, lead ruled
(a) distinct-collapse provisional) · NYS-152 (Healthfirst NY MRF discovery) ·
NYS-153 (Emblem INN errand) · NYS-154 (refs-last + Oscar/OBH shipped record) ·
NYS-155 (rate-intel marketing family shipped) · NYS-156 (directory.ts:257
sparser-record bug) · NYS-157 (SF cadence + docs).

## In flight (dispatched 2026-07-19 ~06:50, post-7am-reset window)

- **workspace-v3** (ui-agent) — TASK-WORKSPACE-V3, the founder's round-4
  list (9 tasks: briefing-in-summary-card, Operations-up + Work-queue-4th-tab,
  Linear row links, pinning, one Coverage&growth group deduped, night-work
  cards, Rules tabs, schema dialogs + Data Dictionary tab, label/glyph sweep).
- **data-t3** (data-agent) — TASK-DATA-T3: fill T2 placeholders, sql/053
  (571 re-key + NPPES names, GRANTED), Oscar/OBH alias pre-seed, 39F0 load
  post-cron, 2026-08 Anthem re-mint stage.
- **budget-pacing** (ops-agent) — NYS-123 fuel-gauge (ops/usage-gauge.mjs +
  docs/ops/PACING.md). Corrected: window resets **7am** NY, not 2am.

## Overnight outcome (2026-07-19 ~morning, fleet hit limits)

- **data-t3** — died at session limit, but committed most work first
  (8ef5aec/8eb4039/fe155c3). LEAD-VERIFIED on live DB: directory 106,512→
  **107,083** (+571 exactly, NYS-26 re-key); structured first/last on
  **114,718** rows (NYS-45); Empire +~21k net-new rows (39F0 load).
  **Big finding in the T2 update: CDPHP all-codes counted run = 663.9M rows,
  ×521 the 20-code volume** — hardens NYS-151 (load-shape MUST be ruled
  before any fleet all-codes rescan; distinct-collapse is not optional at
  that multiple). NO data-t3 round report (died first) → its commits are
  clean but need a close-out + the 39F0 completeness re-check on the next
  tranche. Oscar/OBH aliases pre-seeded in sql/046 tail (fe155c3) — verify
  tripwire views before minting oscar-obh.txt.
- **workspace-v3** — died at session limit having committed NOTHING; round 4
  did not land. TASK-WORKSPACE-V3.md is committed and ready — relaunch with
  the one-line kickoff on a FRESH (green) account. /workspace stays at
  round 3 (the version with the founder's flagged issues).
- **Fleet gauge RED** on brendan@nysgpt.com (both agents drove it to 100%);
  Pro accounts green. Per docs/ops/PACING.md the lead stopped dispatching on
  the RED account rather than dry it further — the exact pattern NYS-123 exists
  to prevent, now observed working.

## PUSH STATUS — DONE (2026-07-19 morning, founder greenlit "push all work")

PUSHED: `2cef29d..29ddc0f`, 31 commits, clean fast-forward (origin was strictly
behind; no divergence). Vercel deploying everything: /workspace round 4
(9/9, lead-verified: 1 H1, 0 "≈", 0 "Briefing", Data Dictionary tab, 0
overflow), the rate-intel marketing family, all supply-side data work, sql/052
merge, budget gauge, briefing fix. Fresh dev server restarted (killed 3010 +
rm -rf .next + npm run dev; Ready 403ms). Still never stage
components/rates/* or docs/UI-PUSH-2026-07-18.md (other session's).

## In flight (2026-07-19 ~morning, fleet GREEN 28%, reset 1:10pm)

- **workspace-r5** (ui-agent) — two founder additions: Docs tab
  (/workspace/docs, editable docs cards via DocSheet) + /codes index page
  (all 20 billing codes; distinguish the 5 shown in /rates from the 15 not
  yet surfaced — NYS-50 gap made visible).
- **data-t4b** (data-agent) — relaunch of TASK-DATA-T4: 39F0 load-completeness
  reconcile (June URLs die Tue Jul 21), Oscar/OBH tripwire verify (mint-ready
  gate), distinct-collapse PROOF to scratch (informs NYS-151).

## Deferred to end-of-session batch (docs-refresh action items)

- **Stale memory:** "01:04-runner-before-04:12-cron ordering load-bearing" is
  OBSOLETE post-NYS-130 (runner does the rebuild via psql; Vercel cron =
  manual/emergency). Fix leuk-harvestd, leuk-operating-model, the
  OPERATING-MODEL.md standing decision, and the Linear Operations Runbook
  Document (a reader on the old version hunts for a 04:12 cron that's gone).
- **Registry lag (NYS-115, quality-agent seam):** 8 relations render
  "Unmapped" in the dictionary (form5500_sf_filings, org_network_rates,
  provider_merge_map + entity satellites) — one metadata line each in
  lib/table-atlas.mjs. Small quality pass.
- **NYS-151 load-shape ruling** still needs founder confirmation before any
  all-codes fleet rescan (data-t4b's proof will size it).

## Founder rulings — 2026-07-19 evening (new lead session, prior lead stalled on API errors)

- **Shell reskin PUSHED** (`2e94ff7..ae2274b`, 9 commits, founder-approved
  as-is). Founder will review the deployed look after the decision queue clears.
- **NYS-151 RESOLVED + all-codes RETIRED:** distinct-collapse confirmed as the
  shape *if ever needed*, but the panel stays at the ~20 identified codes — no
  all-codes fleet harvesting, period. CDPHP proof (died at 96%) cancelled, not
  rerun; nys151 artifacts deleted (~25 GB freed). Linear: close NYS-151 with the
  ruling; comment NYS-50 (broad-code scanner stays built, harvest scope = 20).
- **Minted (founder yes):** `oscar-obh.txt` + `healthfirst-fl-obh.txt` both in
  `manifests/queue/` for tonight's 01:04 runner.
- **June Anthem leftovers DELETED** (founder yes, header rows shown): 3 shard
  files / 293 signed URLs + 39F0-1.csv/gids/chunks. 39F0 fully banked in DB.
- **Empire June-label ruling PENDING** — founder asked for a plainer
  explanation (delivered); recommendation on the table = one `empire-par-
  indemnity` canonical + primary-network rule for semicolon-joined labels.
  Blocks 2p-anthem re-mint loads only; nothing else waits on it.
- **NEW task (founder):** Azimutt schema export is useless without relational
  lines (DB declares no FKs → Azimutt draws nothing). Dispatch docs-agent:
  `scripts/azimutt-export.mjs` emitting docs/leuk-schema.azimutt.json WITH
  inferred relations from lib/table-atlas.mjs join knowledge + key conventions
  (npi/tin/ein/insurer/network/code). Dispatch as soon as the founder's
  decision review wraps.

## Founder rulings, round 2 (2026-07-19 ~22:30) + dispatches in flight

- **Empire June labels: lead's option-2 proposal REJECTED.** Founder direction:
  cross-reference our insurers/networks against Serif Health's model first
  (payer list + name/type/state network shape — inputs saved to
  docs/reference/serif-payers.txt + serif-networks-sample.txt), then rule.
  June rows stay unmapped meanwhile (harmless). Ruling re-surfaces when the
  cross-ref report lands.
- **Harvest transparency is a product requirement now:** /workspace Operations
  gets (a) 8-row fixed tables w/ manual scroll — auto-scroll animation stays
  ONLY on marketing pages; (b) an "Anthem-June" 5th tab = the 476,114 June
  39F0 rows straight from provider_rate_signals; (c) per-job anatomy dialog —
  what each harvest downloads, every schema field, green check = harvested,
  blank = ignored. Brief: docs/TASK-WORKSPACE-V4.md.
- **NOTED FOR LATER (founder, do not lose):** a Serif-style full code catalog
  menu — categories → subcategories → code chips (their Codes panel:
  "Facility-Based Behavioral Health → Mental Health → 10 codes", "Diagnostics
  & Therapeutic → Psychiatry → 30 codes"). We hold hcpcs_codes + /codes; the
  ask is the browsable menu of ALL codes, not harvesting them.
- **In flight (Agent tool, ~22:35):** ui-workspace-v4 (TASK-WORKSPACE-V4) ·
  docs-azimutt (relational Azimutt export, founder wants NOW) ·
  data-serif-crossref (→ docs/reports/2026-07-19-serif-crossref.md).
- Founder has a "big, big project" to hand over once decks are clear — keep
  lead context lean.

## PARKED LIST — now LIVES IN LINEAR: parent **NYS-159** + subs NYS-160..167
(filed 2026-07-20 ~00:05 on founder instruction; new label taxonomy =
`session/*` + `domain/*` + `seam/*`; same-seam tickets get batched into one
agent pass. Additions since the list below was written: Manifest tab w/
expiration dates = NYS-162; Anthem-June amended to 20 rows in NYS-161.)

## Original parked list (superseded by NYS-159, kept for context) — (2026-07-19 ~23:45)

1. File the OON/allowed-amounts sizing-spike Linear ticket (approved).

2. Relaunch ui-agent on TASK-WORKSPACE-V4 — **amended: Anthem-June tab = a
   simple 20-row table, NOT the 476k server-paged table**; 8-row Operations
   tables + anatomy dialog unchanged.

3. Lead's Linear batch (closes/comments/intents) — founder: "save for later."

4. **EMPIRE RULING MADE (founder yes):** 18 June labels → ~13 Serif-shaped
   named networks via the label→atom bridge, PLUS nullable `network_type` +
   `state` columns on `networks`. Execution parked (data-agent tranche when
   dispatched).

5. Fix stale docs/memory (obsolete 04:12-cron ordering) — approved, parked.

6. Quality pass: 8 unmapped Data-Dictionary relations, one registry line each
   (NYS-115) — approved, parked.

7. Push the local commits (bb2fa37 Azimutt, 310c8ba Serif report, queue notes)
   — approved, parked.

8. Tonight's 01:04 runner: Oscar-OBH + Healthfirst-FL-OBH harvest + matview
   rebuild — runs automatically, founder approved leaving it.

9. Universe table, most basic form: make the **17,149 URLs we already hold**
   (the vault inventory) a table with clickable live links. Caveat told to
   founder: signed URLs (Anthem/BCBS-style) expire — many old ones are dead
   links; stable-host ones (CDPHP, Oscar S3, etc.) work. The FULL universe
   (incl. files we skipped) is NOT on disk — needs a ToC walk, separate go.

New founder formatting rule (memorized): blank line between bullets, always.

## Lead-account note (2026-07-18 ~23:15 — RESOLVED)

Prior lead (other account) hit its session limit ~23:00; its Linear batch
did NOT file then. Now FILED (this session regained MCP). Original note: no Linear
MCP** — every intent above stays queued here until a Linear-capable lead
syncs. Firehose review + rulings above were issued by the prior lead
pre-cutoff and are recorded verbatim; founder holds the ui-agent kickoff
(TASK-WORKSPACE-V2) and will paste it directly.
