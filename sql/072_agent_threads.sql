-- Agent conversations in the Inbox.
--
-- The practice agents write findings to the inbox and the clinician
-- interrogates them there (docs/TASK-PRACTICE-AGENTS.md, ruling 1: "the primary
-- output of an agent is a finding written to the inbox, with evidence. Chat is
-- how you interrogate a finding after it lands"). Until now a thread had to
-- belong to a client, so an agent had nowhere to speak from.
--
-- 071 is deliberately skipped — the brief reserves sql/071_agent_runs_findings
-- for the agent_runs / agent_findings tables. This migration is only the
-- messaging seam those findings will surface through.
--
-- Party model: a thread is EITHER a client conversation or an agent
-- conversation, never both. Keeping it strict is a safety property, not
-- tidiness — the portal lists a patient's threads by client_id, and an agent
-- thread that also carried a client_id would be one join away from showing a
-- patient the practice's internal findings about them. Agent threads reference
-- clients in prose + an href instead.

ALTER TABLE threads ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE threads ADD COLUMN IF NOT EXISTS agent_id TEXT;

ALTER TABLE threads DROP CONSTRAINT IF EXISTS threads_party_ck;
ALTER TABLE threads ADD CONSTRAINT threads_party_ck
  CHECK ((client_id IS NOT NULL) <> (agent_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_threads_agent ON threads(agent_id) WHERE agent_id IS NOT NULL;

-- Messages: an agent is not a row in `users` (it has no login, no session, no
-- password), so its turns carry sender_agent_id instead of sender_id.
ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_agent_id TEXT;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_ck;
ALTER TABLE messages ADD CONSTRAINT messages_sender_ck
  CHECK ((sender_id IS NOT NULL) <> (sender_agent_id IS NOT NULL));

COMMENT ON COLUMN threads.agent_id IS 'Practice-agent id (lib/agents/registry.ts) when this is an agent conversation; NULL for client threads.';
COMMENT ON COLUMN messages.sender_agent_id IS 'Practice-agent id when the turn was written by an agent rather than a user.';

-- ── seed: agent + client conversations ────────────────────────────────────────
-- Demo content, mirrored in lib/mock/threads.ts. Each agent's opening turn is a
-- finding with its evidence and a resolving href — the shape the runner will
-- write once sql/071 lands. Sal's findings stay inside what he can actually
-- see (published rates, the practice's own list prices); Leuk stores no
-- paid-per-code data, so nothing here claims to know what a payer remitted.

INSERT INTO threads (id, client_id, agent_id, subject, status, last_message_at) VALUES
  ('00000000-0000-4000-8000-000000017101', NULL, 'bev',    'Aetna dropped your Union Square address',      'open',   '2026-08-11 08:12-04'),
  ('00000000-0000-4000-8000-000000017102', NULL, 'sal',    'Cigna publishes 8% under Oxford for 90837',    'open',   '2026-08-10 17:40-04'),
  ('00000000-0000-4000-8000-000000017103', NULL, 'friday', 'Two notes unsigned past 72 hours',             'open',   '2026-08-11 07:05-04'),
  ('00000000-0000-4000-8000-000000017104', NULL, 'bev',    'Optum lists a disconnected phone number',      'open',   '2026-08-09 09:31-04'),
  ('00000000-0000-4000-8000-000000017105', NULL, 'sal',    'Oxford publishes 11% above Cigna for 90834',   'open',   '2026-08-08 14:02-04'),
  ('00000000-0000-4000-8000-000000017106', NULL, 'friday', 'An intake note has no diagnosis recorded',     'open',   '2026-08-07 18:44-04'),
  ('00000000-0000-4000-8000-000000017107', NULL, 'bev',    'Absent from Emblem''s 2026 behavioral directory','open',  '2026-08-06 07:58-04'),
  ('00000000-0000-4000-8000-000000017108', NULL, 'sal',    '90791 is listed below every published rate',   'closed', '2026-08-05 11:20-04'),
  ('00000000-0000-4000-8000-000000017109', '00000000-0000-4000-8000-000000002002', NULL, 'Insurance card update',    'open',   '2026-08-04 13:15-04'),
  ('00000000-0000-4000-8000-000000017110', '00000000-0000-4000-8000-000000002008', NULL, 'Telehealth link didn''t work','closed','2026-08-03 19:05-04'),
  ('00000000-0000-4000-8000-000000017111', '00000000-0000-4000-8000-000000002006', NULL, 'Group session schedule',   'open',   '2026-08-02 10:40-04')
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (id, thread_id, sender_id, sender_agent_id, body, read_at, created_at) VALUES
  ('00000000-0000-4000-8000-000000018101','00000000-0000-4000-8000-000000017101', NULL, 'bev',
   E'Aetna''s provider directory stopped listing your Union Square office this morning. It listed both addresses on 2026-08-04 and only the Brooklyn one on 2026-08-11.\n\nEvidence — Aetna Plan-Net FHIR pull, as of 2026-08-11:\n  • PractitionerRole 1720394857-aetna-01 → 115 W 30th St (present)\n  • PractitionerRole 1720394857-aetna-02 → Union Square (absent, was present 08-04)\n\nThis is the second consecutive sweep, so it is a real delisting rather than a one-night gap. Nothing changed on our side — no roster submission went out in that window.\n\n/directory/providers/1720394857',
   NULL, '2026-08-11 08:12-04'),
  ('00000000-0000-4000-8000-000000018102','00000000-0000-4000-8000-000000017102', NULL, 'sal',
   E'Cigna''s published in-network rate for 90837 sits below Oxford''s for the same code and setting.\n\nMedian, office setting, current published files:\n  • Oxford  $154.30\n  • Cigna   $142.00  — 8% lower\n\nYour list price for 90837 is $150.00, so Cigna is the one payer of the two publishing under what you charge.\n\nTo be clear about what this is: published rates, not remits. Leuk does not store paid-per-code data yet, so I cannot tell you what Cigna has actually paid you — only what it says it pays.\n\n/rates',
   NULL, '2026-08-10 16:55-04'),
  ('00000000-0000-4000-8000-000000018103','00000000-0000-4000-8000-000000017102','00000000-0000-4000-8000-000000001001', NULL,
   'Is Cigna low across the board, or just on that code?', '2026-08-10 17:40-04', '2026-08-10 17:32-04'),
  ('00000000-0000-4000-8000-000000018104','00000000-0000-4000-8000-000000017102', NULL, 'sal',
   'Across the board, but by less: 90834 is 6% under Oxford and 99214 is 3% under. 90837 is the widest gap and the code you bill most, so it is the one worth raising.',
   NULL, '2026-08-10 17:40-04'),
  ('00000000-0000-4000-8000-000000018105','00000000-0000-4000-8000-000000017103', NULL, 'friday',
   E'Two progress notes have been unsigned longer than 72 hours:\n\n  • Casey Morgan — session 2026-08-07, drafted, unsigned 4 days\n  • Jordan Lee — session 2026-08-08, drafted, unsigned 3 days\n\nBoth have complete transcripts and drafted bodies, so signing is the only step left. I have not changed either note.',
   NULL, '2026-08-11 07:05-04'),
  ('00000000-0000-4000-8000-000000018106','00000000-0000-4000-8000-000000017104', NULL, 'bev',
   E'Optum''s directory lists (212) 555-0143 for your Union Square office. That number is not on any of your practice locations in Leuk.\n\nOptum listing, as of 2026-08-09: (212) 555-0143\nLeuk locations: Union Square (212) 555-0190 · Brooklyn Heights (718) 555-0164\n\nA wrong number in a payer directory reads to a referrer as a practice that doesn''t pick up. I can''t see who submitted it or when — only what the directory currently publishes.\n\n/settings/locations',
   NULL, '2026-08-09 09:31-04'),
  ('00000000-0000-4000-8000-000000018107','00000000-0000-4000-8000-000000017105', NULL, 'sal',
   E'For 90834 (45-min therapy), Oxford''s published in-network median is $128.60 against Cigna''s $115.75 — Oxford pays about 11% more for the same code.\n\nMedian, office setting, current published files:\n  • Oxford  $128.60  (IQR $121.00–$137.40)\n  • Cigna   $115.75  (IQR $108.20–$124.00)\n\nWorth knowing before your next Cigna conversation. This is published rate only — I can''t see what either has actually remitted to you.\n\n/rates',
   NULL, '2026-08-08 14:02-04'),
  ('00000000-0000-4000-8000-000000018108','00000000-0000-4000-8000-000000017106', NULL, 'friday',
   E'An intake note from 2026-08-05 is signed but carries no diagnosis code. Every other intake in the last 90 days has one.\n\nWithout a code the superbill can''t be generated and the claim will reject on submission. The note itself is complete — this is a missing field, not a missing session.',
   NULL, '2026-08-07 18:44-04'),
  ('00000000-0000-4000-8000-000000018109','00000000-0000-4000-8000-000000017107', NULL, 'bev',
   E'You do not appear in Emblem''s 2026 behavioral-health directory. You appear in Aetna''s, Cigna''s, Oxford''s and Healthfirst''s.\n\nEmblem pull, as of 2026-08-06: no PractitionerRole for NPI 1720394857.\n\nI can see the listing is absent. I cannot see whether you are contracted with Emblem and merely unlisted, or not contracted at all — Leuk holds no contract data. If you believe you''re in-network, this is a directory problem worth escalating; if you''re not, it''s a gap worth pricing.\n\n/networks',
   NULL, '2026-08-06 07:58-04'),
  ('00000000-0000-4000-8000-000000018110','00000000-0000-4000-8000-000000017108', NULL, 'sal',
   E'Your list price for 90791 (diagnostic intake) is $180.00. Every payer we track publishes above that for the same code — the lowest is Healthfirst at $186.40, the highest Oxford at $232.15.\n\nA list price below the published in-network rate caps what you can collect from self-pay clients and anchors low in any negotiation.\n\n/catalog',
   '2026-08-05 11:25-04', '2026-08-05 11:20-04'),
  ('00000000-0000-4000-8000-000000018111','00000000-0000-4000-8000-000000017109','00000000-0000-4000-8000-000000001001', NULL,
   'Hi Jordan — we have a new Oxford card on file for you starting 8/1. Nothing needed on your end; your next session bills to the new plan automatically.',
   NULL, '2026-08-04 13:15-04'),
  ('00000000-0000-4000-8000-000000018112','00000000-0000-4000-8000-000000017110','00000000-0000-4000-8000-000000001002', NULL,
   'Sorry about the trouble getting in on Monday — the room link had expired. I''ve reissued it and the new one is on your appointment in the portal.',
   '2026-08-03 19:30-04', '2026-08-03 19:05-04'),
  ('00000000-0000-4000-8000-000000018113','00000000-0000-4000-8000-000000017111','00000000-0000-4000-8000-000000001001', NULL,
   'Hi Ruth — the Thursday insomnia group moves to 6:30 PM starting next week so people can get there after work. Same room, same eight weeks.',
   NULL, '2026-08-02 10:40-04')
ON CONFLICT (id) DO NOTHING;
