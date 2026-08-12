import { DEMO_CLIENT_USER_ID, DEMO_PRACTITIONER_ID, registerFixtures } from "@/lib/mock";
import type { Message, Thread } from "@/lib/types";

// Mirrors sql/002_seed.sql — threads (17) + messages (18): same uuids,
// subjects, bodies, timestamps.
//
// Sender-id bridge (mock mode only): the seed's users are 00…1001 (Brendan),
// 00…1002 (Priya) and 00…1003 (Casey — portal login casey@leuk.demo,
// linked to the Casey Morgan client row 00…2001 via clients.user_id). The
// foundation mock store seeds the demo logins under different ids, so here
// seed 1001 → DEMO_PRACTITIONER_ID and seed 1003 → DEMO_CLIENT_USER_ID (the
// clients fixture already points client 2001.userId at DEMO_CLIENT_USER_ID).
// Priya keeps her seed id. In DB mode none of this applies: sql/002_seed.sql
// ids are used as-is and casey@leuk.demo IS users 00…1003.

const T = (n: string) => `00000000-0000-4000-8000-00000000${n}`;

const BRENDAN = DEMO_PRACTITIONER_ID; // seed 00…1001
const PRIYA = T("1002");
const CASEY = DEMO_CLIENT_USER_ID; // seed 00…1003

// `agentId`/`senderAgentId` default in at registration so the client-thread
// fixtures below stay as they were written.
type ThreadFixture = Omit<Thread, "createdAt" | "updatedAt" | "agentId"> & { agentId?: string | null };
type MessageFixture = Omit<Message, "senderId" | "senderAgentId"> & {
  senderId?: string;
  senderAgentId?: string | null;
};

const threads: ThreadFixture[] = [
  { id: T("17001"), clientId: T("2001"), subject: "Sertraline refill", status: "open", lastMessageAt: "2026-07-02T14:38:00-04:00" },
  { id: T("17002"), clientId: T("2001"), subject: "Rescheduling next week", status: "closed", lastMessageAt: "2026-06-27T10:12:00-04:00" },
  { id: T("17003"), clientId: T("2004"), subject: "Superbill for June sessions", status: "open", lastMessageAt: "2026-07-03T16:20:00-04:00" },
  { id: T("17004"), clientId: T("2009"), subject: "Intake paperwork reminder", status: "open", lastMessageAt: "2026-07-01T09:05:00-04:00" },
];

const messages: MessageFixture[] = [
  {
    id: T("18001"),
    threadId: T("17001"),
    senderId: CASEY,
    body: "Hi Dr. Stanton — my pharmacy says I have no refills left on the sertraline and I take my last dose Sunday. Could you send a new script to the CVS on Hudson St?",
    readAt: "2026-07-02T09:15:00-04:00",
    createdAt: "2026-07-02T08:47:00-04:00",
  },
  {
    id: T("18002"),
    threadId: T("17001"),
    senderId: BRENDAN,
    body: "Good catch — I just sent 75 mg (the new dose we discussed) with 2 refills to CVS Hudson St. It should be ready this afternoon. See you Monday.",
    readAt: "2026-07-02T14:40:00-04:00",
    createdAt: "2026-07-02T14:32:00-04:00",
  },
  {
    id: T("18003"),
    threadId: T("17001"),
    senderId: CASEY,
    body: "Got it, thank you!",
    readAt: null,
    createdAt: "2026-07-02T14:38:00-04:00",
  },
  {
    id: T("18004"),
    threadId: T("17002"),
    senderId: CASEY,
    body: "Is there any chance we could move next week's session earlier in the day? Something came up at work Monday afternoon.",
    readAt: "2026-06-26T15:20:00-04:00",
    createdAt: "2026-06-26T14:55:00-04:00",
  },
  {
    id: T("18005"),
    threadId: T("17002"),
    senderId: BRENDAN,
    body: "Done — moved you to Monday 7/6 at 9:00 AM at the office. You will get a confirmation from the portal.",
    readAt: "2026-06-27T10:15:00-04:00",
    createdAt: "2026-06-27T10:12:00-04:00",
  },
  {
    id: T("18006"),
    threadId: T("17003"),
    senderId: BRENDAN,
    body: "Hi Ava — your June superbill is attached under Records > Documents. It includes the 6/29 session; submit it to Aetna with your member ID and let us know if they need anything else.",
    readAt: null,
    createdAt: "2026-07-03T16:20:00-04:00",
  },
  {
    id: T("18007"),
    threadId: T("17004"),
    senderId: PRIYA,
    body: "Hi Eli — looking forward to meeting you on Monday 7/6 at 11:00 AM. The intake form in your invite takes about 10 minutes; completing it beforehand lets us spend the whole hour on you.",
    readAt: null,
    createdAt: "2026-07-01T09:05:00-04:00",
  },
];

// ── agent conversations ───────────────────────────────────────────────────────
// Mirrors the seed block in sql/072_agent_threads.sql. Each opening turn is a
// finding with its evidence and a resolving href — the shape the agent runner
// will write once sql/071_agent_runs_findings lands. Client threads carry a
// clientId; these carry an agentId instead, never both.

const agentThreads: ThreadFixture[] = [
  { id: T("17101"), clientId: "", agentId: "bev", subject: "Aetna dropped your Union Square address", status: "open", lastMessageAt: "2026-08-11T08:12:00-04:00" },
  { id: T("17102"), clientId: "", agentId: "sal", subject: "Cigna publishes 8% under Oxford for 90837", status: "open", lastMessageAt: "2026-08-10T17:40:00-04:00" },
  { id: T("17103"), clientId: "", agentId: "friday", subject: "Two notes unsigned past 72 hours", status: "open", lastMessageAt: "2026-08-11T07:05:00-04:00" },
];

const agentMessages: MessageFixture[] = [
  {
    id: T("18101"),
    threadId: T("17101"),
    senderAgentId: "bev",
    body: `Aetna's provider directory stopped listing your Union Square office this morning. It listed both addresses on 2026-08-04 and only the Brooklyn one on 2026-08-11.

Evidence — Aetna Plan-Net FHIR pull, as of 2026-08-11:
  • PractitionerRole 1720394857-aetna-01 → 115 W 30th St (present)
  • PractitionerRole 1720394857-aetna-02 → Union Square (absent, was present 08-04)

This is the second consecutive sweep, so it is a real delisting rather than a one-night gap. Nothing changed on our side — no roster submission went out in that window.

/directory/providers/1720394857`,
    readAt: null,
    createdAt: "2026-08-11T08:12:00-04:00",
  },
  {
    id: T("18102"),
    threadId: T("17102"),
    senderAgentId: "sal",
    body: `Cigna's published in-network rate for 90837 sits below Oxford's for the same code and setting.

Median, office setting, current published files:
  • Oxford  $154.30
  • Cigna   $142.00  — 8% lower

Your list price for 90837 is $150.00, so Cigna is the one payer of the two publishing under what you charge.

To be clear about what this is: published rates, not remits. Leuk does not store paid-per-code data yet, so I cannot tell you what Cigna has actually paid you — only what it says it pays.

/rates`,
    readAt: null,
    createdAt: "2026-08-10T16:55:00-04:00",
  },
  {
    id: T("18103"),
    threadId: T("17102"),
    senderId: BRENDAN,
    body: "Is Cigna low across the board, or just on that code?",
    readAt: "2026-08-10T17:40:00-04:00",
    createdAt: "2026-08-10T17:32:00-04:00",
  },
  {
    id: T("18104"),
    threadId: T("17102"),
    senderAgentId: "sal",
    body: "Across the board, but by less: 90834 is 6% under Oxford and 99214 is 3% under. 90837 is the widest gap and the code you bill most, so it is the one worth raising.",
    readAt: null,
    createdAt: "2026-08-10T17:40:00-04:00",
  },
  {
    id: T("18105"),
    threadId: T("17103"),
    senderAgentId: "friday",
    body: `Two progress notes have been unsigned longer than 72 hours:

  • Casey Morgan — session 2026-08-07, drafted, unsigned 4 days
  • Jordan Lee — session 2026-08-08, drafted, unsigned 3 days

Both have complete transcripts and drafted bodies, so signing is the only step left. I have not changed either note.`,
    readAt: null,
    createdAt: "2026-08-11T07:05:00-04:00",
  },
];

// A second batch — enough volume that the list actually scrolls, and enough
// variety that agent findings and client messages interleave by recency the
// way they will in use.
const moreThreads: ThreadFixture[] = [
  { id: T("17104"), clientId: "", agentId: "bev", subject: "Optum lists a disconnected phone number", status: "open", lastMessageAt: "2026-08-09T09:31:00-04:00" },
  { id: T("17105"), clientId: "", agentId: "sal", subject: "Oxford publishes 11% above Cigna for 90834", status: "open", lastMessageAt: "2026-08-08T14:02:00-04:00" },
  { id: T("17106"), clientId: "", agentId: "friday", subject: "An intake note has no diagnosis recorded", status: "open", lastMessageAt: "2026-08-07T18:44:00-04:00" },
  { id: T("17107"), clientId: "", agentId: "bev", subject: "Absent from Emblem's 2026 behavioral directory", status: "open", lastMessageAt: "2026-08-06T07:58:00-04:00" },
  { id: T("17108"), clientId: "", agentId: "sal", subject: "90791 is listed below every published rate", status: "closed", lastMessageAt: "2026-08-05T11:20:00-04:00" },
  { id: T("17109"), clientId: T("2002"), subject: "Insurance card update", status: "open", lastMessageAt: "2026-08-04T13:15:00-04:00" },
  { id: T("17110"), clientId: T("2008"), subject: "Telehealth link didn't work", status: "closed", lastMessageAt: "2026-08-03T19:05:00-04:00" },
  { id: T("17111"), clientId: T("2006"), subject: "Group session schedule", status: "open", lastMessageAt: "2026-08-02T10:40:00-04:00" },
];

const moreMessages: MessageFixture[] = [
  {
    id: T("18106"),
    threadId: T("17104"),
    senderAgentId: "bev",
    body: `Optum's directory lists (212) 555-0143 for your Union Square office. That number is not on any of your practice locations in Leuk.

Optum listing, as of 2026-08-09: (212) 555-0143
Leuk locations: Union Square (212) 555-0190 · Brooklyn Heights (718) 555-0164

A wrong number in a payer directory reads to a referrer as a practice that doesn't pick up. I can't see who submitted it or when — only what the directory currently publishes.

/settings/locations`,
    readAt: null,
    createdAt: "2026-08-09T09:31:00-04:00",
  },
  {
    id: T("18107"),
    threadId: T("17105"),
    senderAgentId: "sal",
    body: `For 90834 (45-min therapy), Oxford's published in-network median is $128.60 against Cigna's $115.75 — Oxford pays about 11% more for the same code.

Median, office setting, current published files:
  • Oxford  $128.60  (IQR $121.00–$137.40)
  • Cigna   $115.75  (IQR $108.20–$124.00)

Worth knowing before your next Cigna conversation. This is published rate only — I can't see what either has actually remitted to you.

/rates`,
    readAt: null,
    createdAt: "2026-08-08T14:02:00-04:00",
  },
  {
    id: T("18108"),
    threadId: T("17106"),
    senderAgentId: "friday",
    body: `An intake note from 2026-08-05 is signed but carries no diagnosis code. Every other intake in the last 90 days has one.

Without a code the superbill can't be generated and the claim will reject on submission. The note itself is complete — this is a missing field, not a missing session.`,
    readAt: null,
    createdAt: "2026-08-07T18:44:00-04:00",
  },
  {
    id: T("18109"),
    threadId: T("17107"),
    senderAgentId: "bev",
    body: `You do not appear in Emblem's 2026 behavioral-health directory. You appear in Aetna's, Cigna's, Oxford's and Healthfirst's.

Emblem pull, as of 2026-08-06: no PractitionerRole for NPI 1720394857.

I can see the listing is absent. I cannot see whether you are contracted with Emblem and merely unlisted, or not contracted at all — Leuk holds no contract data. If you believe you're in-network, this is a directory problem worth escalating; if you're not, it's a gap worth pricing.

/networks`,
    readAt: null,
    createdAt: "2026-08-06T07:58:00-04:00",
  },
  {
    id: T("18110"),
    threadId: T("17108"),
    senderAgentId: "sal",
    body: `Your list price for 90791 (diagnostic intake) is $180.00. Every payer we track publishes above that for the same code — the lowest is Healthfirst at $186.40, the highest Oxford at $232.15.

A list price below the published in-network rate caps what you can collect from self-pay clients and anchors low in any negotiation.

/catalog`,
    readAt: "2026-08-05T11:25:00-04:00",
    createdAt: "2026-08-05T11:20:00-04:00",
  },
  {
    id: T("18111"),
    threadId: T("17109"),
    senderId: BRENDAN,
    body: "Hi Jordan — we have a new Oxford card on file for you starting 8/1. Nothing needed on your end; your next session bills to the new plan automatically.",
    readAt: null,
    createdAt: "2026-08-04T13:15:00-04:00",
  },
  {
    id: T("18112"),
    threadId: T("17110"),
    senderId: PRIYA,
    body: "Sorry about the trouble getting in on Monday — the room link had expired. I've reissued it and the new one is on your appointment in the portal.",
    readAt: "2026-08-03T19:30:00-04:00",
    createdAt: "2026-08-03T19:05:00-04:00",
  },
  {
    id: T("18113"),
    threadId: T("17111"),
    senderId: BRENDAN,
    body: "Hi Ruth — the Thursday insomnia group moves to 6:30 PM starting next week so people can get there after work. Same room, same eight weeks.",
    readAt: null,
    createdAt: "2026-08-02T10:40:00-04:00",
  },
];

registerFixtures("threads", (store) => {
  for (const t of [...threads, ...agentThreads, ...moreThreads]) {
    const stamp = t.lastMessageAt ?? "2026-06-26T14:55:00-04:00";
    store.threads.set(t.id, { agentId: null, ...t, createdAt: stamp, updatedAt: stamp });
  }
  for (const m of [...messages, ...agentMessages, ...moreMessages]) {
    store.messages.set(m.id, { senderId: "", senderAgentId: null, ...m });
  }
});
