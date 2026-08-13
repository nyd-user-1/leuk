import { registerFixtures } from "@/lib/mock";
import type { Note, NoteTemplate, Transcript } from "@/lib/types";

// Clinical-docs fixtures — mirror sql/002_seed.sql exactly (same uuids,
// titles, bodies): note_templates 7001-7003, notes 8001-8008, transcript 9001.

const T = (n: string) => `00000000-0000-4000-8000-00000000${n}`;

export const TEMPLATE_IDS = { soap: T("7001"), dap: T("7002"), progress: T("7003") };

const templates: Array<Omit<NoteTemplate, "createdAt" | "updatedAt">> = [
  {
    id: T("7001"),
    name: "SOAP Note",
    template: "soap",
    bodyMd: "## Subjective\n\n\n## Objective\n\n\n## Assessment\n\n\n## Plan\n",
    isBuiltin: true,
  },
  {
    id: T("7002"),
    name: "DAP Note",
    template: "dap",
    bodyMd: "## Data\n\n\n## Assessment\n\n\n## Plan\n",
    isBuiltin: true,
  },
  {
    id: T("7003"),
    name: "Progress Note",
    template: "progress",
    bodyMd: "## Presenting Concerns\n\n\n## Interventions\n\n\n## Response\n\n\n## Plan\n",
    isBuiltin: true,
  },
];

type NoteSeed = Omit<Note, "deletedAt" | "createdAt" | "updatedAt"> & { createdAt: string };

const notes: NoteSeed[] = [
  {
    id: T("8001"),
    clientId: T("2002"),
    appointmentId: T("6001"),
    authorId: T("1001"),
    template: "soap",
    title: "Follow-up 6/22 — med check",
    bodyMd:
      "## Subjective\nReports improved focus at work on methylphenidate ER 27 mg; appetite mildly reduced, sleep intact.\n\n## Objective\nAlert, euthymic. HR 74. No abnormal movements.\n\n## Assessment\nADHD, combined type — responding to current dose. Tolerating well.\n\n## Plan\nContinue 27 mg daily. Recheck in 4 weeks. Labs not indicated.",
    status: "signed",
    signedAt: "2026-06-22T09:40:00-04:00",
    createdAt: "2026-06-22T09:32:00-04:00",
  },
  {
    id: T("8002"),
    clientId: T("2003"),
    appointmentId: T("6002"),
    authorId: T("1002"),
    template: "dap",
    title: "Therapy 6/22",
    bodyMd:
      "## Data\nDiscussed conflict avoidance at work; completed thought record on Sunday-night dread.\n\n## Assessment\nMDD, moderate — engagement good, mood slowly lifting (PHQ-9 trending down).\n\n## Plan\nBehavioral activation homework; continue weekly.",
    status: "signed",
    signedAt: "2026-06-22T11:00:00-04:00",
    createdAt: "2026-06-22T10:48:00-04:00",
  },
  {
    id: T("8003"),
    clientId: T("2001"),
    appointmentId: T("6003"),
    authorId: T("1001"),
    template: "soap",
    title: "Telehealth check-in 6/23",
    bodyMd:
      "## Subjective\nWeek 3 on sertraline 50 mg. Mild nausea resolved; anxiety attacks down from daily to ~2/week.\n\n## Objective\nSeen via video. Appropriately groomed, good eye contact, speech normal.\n\n## Assessment\nGAD — early response at 50 mg.\n\n## Plan\nIncrease to 75 mg daily. PHQ-9 sent via portal. Follow up 7/6.",
    status: "signed",
    signedAt: "2026-06-23T11:35:00-04:00",
    createdAt: "2026-06-23T11:22:00-04:00",
  },
  {
    id: T("8004"),
    clientId: T("2005"),
    appointmentId: T("6005"),
    authorId: T("1002"),
    template: "progress",
    title: "Follow-up 6/25",
    bodyMd:
      "## Presenting Concerns\nIntrusive worry before exams; using PRN hydroxyzine ~1x/week.\n\n## Interventions\nReviewed sleep hygiene; brief exposure planning for presentation anxiety.\n\n## Response\nReceptive; agreed to reduce pre-exam caffeine.\n\n## Plan\nContinue current regimen; revisit PRN use next visit.",
    status: "signed",
    signedAt: "2026-06-25T10:15:00-04:00",
    createdAt: "2026-06-25T10:02:00-04:00",
  },
  {
    id: T("8005"),
    clientId: T("2004"),
    appointmentId: T("6007"),
    authorId: T("1001"),
    template: "soap",
    title: "Therapy 6/29",
    bodyMd:
      "## Subjective\nPanic symptoms recurred on subway Friday; used paced breathing with partial relief.\n\n## Objective\nMildly anxious affect, otherwise unremarkable.\n\n## Assessment\nPanic disorder — interoceptive avoidance re-emerging.\n\n## Plan\nResume interoceptive exposure ladder; consider propranolol PRN if no improvement.",
    status: "draft",
    signedAt: null,
    createdAt: "2026-06-29T09:47:00-04:00",
  },
  {
    id: T("8006"),
    clientId: T("2007"),
    appointmentId: T("6010"),
    authorId: T("1002"),
    template: "dap",
    title: "Therapy 6/30",
    bodyMd:
      "## Data\nExplored move-related isolation; client joined climbing gym, attended twice.\n\n## Assessment\nAdjustment disorder w/ depressed mood — improving behavioral engagement.\n\n## Plan\nMaintain activity scheduling; telehealth check-in next week.",
    status: "draft",
    signedAt: null,
    createdAt: "2026-06-30T15:50:00-04:00",
  },
  {
    id: T("8007"),
    clientId: T("2008"),
    appointmentId: T("6011"),
    authorId: T("1001"),
    template: "soap",
    title: "Telehealth check-in 7/1",
    bodyMd:
      "## Subjective\nNightmares down to 1-2/week on prazosin 2 mg; daytime hypervigilance persists in crowds.\n\n## Objective\nVideo visit. Calm, linear, future-oriented.\n\n## Assessment\nPTSD — partial response; sleep markedly better.\n\n## Plan\nTitrate prazosin to 3 mg qHS; continue weekly trauma-focused work with therapist.",
    status: "signed",
    signedAt: "2026-07-01T09:35:00-04:00",
    createdAt: "2026-07-01T09:22:00-04:00",
  },
  {
    id: T("8008"),
    clientId: T("2006"),
    appointmentId: null,
    authorId: T("1002"),
    template: "free",
    title: "Care coordination — PCP call",
    bodyMd:
      "Spoke with Dr. Adeyemi (PCP) re: trazodone/lisinopril timing; no interaction concerns. Will share insomnia group progress summary after week 6.",
    status: "draft",
    signedAt: null,
    createdAt: "2026-07-02T16:10:00-04:00",
  },
];

const transcript: Omit<Transcript, "createdAt" | "updatedAt"> = {
  id: T("9001"),
  appointmentId: T("6011"),
  segments: [
    { t0: 0, t1: 6, speaker: "practitioner", text: "Good morning, Maya. How has sleep been since we raised the prazosin?" },
    { t0: 6, t1: 15, speaker: "client", text: "Honestly, a lot better. Maybe one nightmare this week instead of every night." },
    { t0: 15, t1: 22, speaker: "practitioner", text: "That is real progress. Any dizziness in the morning or when you stand up?" },
    { t0: 22, t1: 27, speaker: "client", text: "A little lightheaded the first two days, then it went away." },
    {
      t0: 27,
      t1: 38,
      speaker: "practitioner",
      text: "Good. Let us go up to three milligrams at bedtime and keep everything else the same. Crowds still hard?",
    },
    {
      t0: 38,
      t1: 46,
      speaker: "client",
      text: "Yeah, the subway at rush hour is still rough. I am using the grounding stuff, it helps some.",
    },
  ],
  summaryMd:
    "## Visit summary\nSleep markedly improved on prazosin 2 mg (nightmares ~1/wk, transient orthostatic lightheadedness resolved). Daytime hypervigilance in crowds persists; grounding skills partially effective.\n\n## Plan\n- Increase prazosin to 3 mg qHS\n- Continue weekly trauma-focused therapy\n- Follow up 7/9",
  status: "ready",
};

registerFixtures("notes", (store) => {
  const now = new Date().toISOString();
  for (const t of templates) store.noteTemplates.set(t.id, { ...t, createdAt: now, updatedAt: now });
  for (const n of notes) store.notes.set(n.id, { ...n, deletedAt: null, updatedAt: n.signedAt ?? n.createdAt });
  store.transcripts.set(transcript.id, { ...transcript, createdAt: now, updatedAt: now });

  // Seed-authored notes reference practitioners 1001/1002 (sql seed uuid
  // scheme). Register them for author display if no sibling fixture has —
  // never overwrite existing rows.
  const authors = [
    { id: T("1001"), name: "Brendan Stanton", email: "brendan.seed@leuk.demo", avatarHue: "teal" as const },
    { id: T("1002"), name: "Priya Raman", email: "priya@leuk.demo", avatarHue: "amber" as const },
  ];
  for (const a of authors) {
    if (store.users.has(a.id)) continue;
    store.users.set(a.id, {
      ...a,
      role: "practitioner",
      passwordHash: "",
      phone: null,
      timezone: "America/New_York",
      slug: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }
});
