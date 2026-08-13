# HANDOFF — agents, the Inbox, and the database move (2026-08-11 → 08-13)

Branch `bedrock-clinical-notes`. The agent surfaces are built and polished. **The
database move is not started and is the thing that matters most.**

---

## 1. START HERE — evacuate `liminal`

Leuk's reference corpus (23 GB: rates, directory, orgs) is serving today out of
`liminal`, a project inside a **Vercel-managed Neon organization** attached to a
Vercel account that is **blocked for fair-use**.

```
2525 LLC (scale)             leuk-public   ~31 MB   ← destination, still empty
                             leuk-phi      hipaa: true ✓
                             44b-nysgpt    149 GB ✓
Vercel: nyd-user-1 (launch)  liminal       23 GB    managed_by: "vercel"  ← live dependency
```

Three facts that shape the job:

- **Project transfer is impossible.** Neon's docs: *"Vercel-managed organizations
  are not supported as source or destination."* Structural, not permission —
  unblocking Vercel does not change it.
- **Uninstalling the Vercel Neon integration permanently deletes the org and
  every database in it.** Do not tidy Vercel before the copy completes.
- Both endpoints are `us-east-1.aws.neon.tech`, so this is an in-region copy.

**Blockers to clear before starting:**

| Problem | Fix |
|---|---|
| `pg_dump` is **14.18**, source server is **17.10** | `brew install postgresql@18` (target `leuk-public` is pg 18) |
| **9.6 GB free disk**, database is 23 GB | Stream it: `pg_dump -Fc … \| pg_restore … -d "$DEST"` — never lands on disk |

Non-destructive: `liminal` keeps serving until `DATABASE_URL` is repointed and
row counts are verified on both sides. Then the seven small GPT projects, then
drop the legacy 90 GB `44b` once `44b-nysgpt` is confirmed as its successor.

---

## 2. Settled architecture

Cloudflare (DNS + WAF + bot management) → AWS container running `next start`.

- **Leuk**: its own AWS account, ECS Fargate, private subnets, ALB public.
- **Other nine**: shared account, ECS Express Mode, one shared ALB (up to 25
  services, so the $16/mo baseline amortises).
- **Databases stay on Neon** — sequencing, not permanent. Move compute first,
  hold data still, so a failure has one cause. Revisit triggers: a second Neon
  incident *after* the ingest driver is fixed, Bedrock Knowledge Bases becoming
  central (that's Aurora, not RDS), or Neon cost crossing RDS + ops.
- **App Runner is closed to new customers** (April 2026). Amplify Hosting is
  HIPAA-eligible and a legitimate faster path for the nine; containers win for
  Leuk on Next-16 adapter risk.
- Neon Scale includes **Private Link and IP Allow**, so VPC isolation is not an
  argument for RDS.

**Portability today:** `output: "standalone"` is set, no edge runtime anywhere.
Vercel lock-in is four things — `@vercel/blob` (`lib/blob.ts` only),
`@vercel/connect` (one harvest route), `@vercel/speed-insights`, and Vercel Cron.

---

## 3. Neon cost — done, and what to watch

`44b-nysgpt`'s compute floor was **2 CU**; the workload sits near 0.25 with rare
bursts. Dropped to **1 CU** (max 8, autosuspend 5 min, endpoint named `serving`).
Worth ~**$50–70/month**.

- `44b/ops/cu-watch.mjs` + `com.44b.cu-watch` LaunchAgent, daily 09:10 → `cu-watch.csv`.
- It reads the **billing API**, never the database: polling LFC hit-rate would
  wake the compute every 15 minutes and cost more than the saving.
- Read `avg_cu_awake` — it isolates the floor from traffic volume. If it settles
  near 1.0 and `active_hours` doesn't climb, try 0.5 CU for another ~$25.
- **Next lever:** a separate ingest endpoint. One compute currently serves both
  query and bulk-load workloads, so its cache is sized for the harder one. Split
  them and ingest also gets its own unpooled host.

**The shard deaths were the pooler.** `-pooler` is PgBouncer; `server_lifetime`
recycles by connection age (~60 min), which is why lowering concurrency didn't
help. Nothing in Leuk uses the unpooled endpoint; 44b does in three scripts. Fix
is `scripts/lib/db.mjs` on the **unpooled** URL with `pool.on('error')` — Node
rethrows an unhandled `error` event and kills the process before any promise
rejects, which is why retry wrappers never ran.

---

## 4. What shipped (today, uncommitted → now committed)

**One renderer, three surfaces.** `components/agents/assistant-message.tsx` was
extracted from `/chat`; `/chat`, the Inbox agent threads and the dock all import
it. Reasoning accordion, grouped tool lines, markdown, footer, follow-ups, orb.

**Inbox agent threads stream** (`agent-thread-view.tsx`) via `useChat` against
the agent's endpoint. Stored history seeds it, so a reopened thread reads the
same as a live one. Turns persist through `/api/messages`, which now accepts
`agentId` — staff only, and only when `thread.agent_id` matches.

**Composer** (`chat-input.tsx`) is now shared by all three surfaces plus patient
threads. Model picker, settings gear and sample prompts each hide when their
handler is absent. `@` resolves records (providers carry their NPI into the
text, which is what stopped agents asking for it); `/` opens the skills
catalogue. Both engines live in `composer-menu.ts`. Tokens highlight teal via a
mirror div — **the mirror's typography must match the textarea exactly or they
drift.**

**Skills in the database.** 27 chosen from CaseMark's 400 med skills, mapped to
agents — Friday 17 (documentation, assessment, care planning, medication), Sal 6
(coding, revenue cycle), Bev 4 (credentialing, compliance, 42 CFR Part 2).
`sql/073_agent_skills.sql`, `lib/repos/agent-skills.ts`,
`GET /api/agent-skills`. Adding a skill is an INSERT, not a deploy.

**Fixed:** the full-screen blank when switching threads (`RevealFx` was keyed on
the whole pathname, remounting the surface for every URL change — now keyed per
section, plus a thread-pane `loading.tsx`); name normalisation in `/api/search`
so "PADGETT SHELLEY" reads properly (⌘K benefits too); `sql/074` reseeded the 13
live agent messages as markdown, since `sql/072`'s `ON CONFLICT DO NOTHING` left
the old plain text in place.

---

## 5. Open

| Item | Note |
|---|---|
| **Move `liminal`** | §1. Everything else is secondary. |
| Vercel block | External. Gates deploys and env vars. |
| Production env vars | The three `LEUK_BEDROCK_*` plus Stripe/email never made the LIMINAL→LEUK rename. |
| Skill titles | Read as slug text — "Managing adhd assessments". One `UPDATE` on `agent_skills.title`. |
| `/` commands are prompts, not procedures | Picking one inserts text. Real dispatch needs a `skill` field on the routes; the composer won't change. |
| Agent runner | Inbox findings are seeded, not generated. `sql/071` still reserved for `agent_runs`/`agent_findings`. |
| Mentions in patient threads | Deliberately off. One prop if you want them. |
| Read vs. open rows | Both washed teal, different opacity. May need a left border to separate. |
| Transcription | `/api/ai/transcribe` is a stub — replays a script, doesn't listen. |
| Sal can't see remits | `invoice_items` is free text with no code or payer. Own ticket. |
| `force-dynamic` on 74 pages | Public bot-facing pages re-query Postgres per request. Likely a bigger compute saving than the CU floor, and free. |

---

## 6. Gotchas

- **`brendan@leuk.demo` / `demo` is mock-mode only.** No agent can sign in
  against live, so anything UI-level on real data needs you at the keyboard.
- Two `next dev` instances collide on `.next/dev`; run one.
- The Neon MCP can read the 2525 org but has **no endpoint-write tool**. Writes
  go through the REST API with `NEON_API_KEY_2525` (in `44b/.env.local`) — the
  key in Leuk's `.env.local` is scoped to the Vercel org and 404s.
- `Artifact` is denied in `~/.claude/settings.json`. Deliverables go in
  `docs/HANDOFF-*.md`.
