import { DEMO_PRACTITIONER_ID, registerFixtures } from "@/lib/mock";
import { PRIYA_PRACTITIONER_ID } from "@/lib/mock/clients";
import "@/lib/mock/services"; // registers Lena + Marcus as users
import type { ProviderProfile } from "@/lib/types";

// Provider-profile content fixtures — mirrors sql/008_provider_profiles.sql
// (same content, same user ids). Shelley Padgett isn't seeded here: her user
// record is the booking lane's fixture to add, if/when mock parity for her
// is needed; this repo only authors profiles for practitioners already in
// the mock store.

const T = "2026-06-15T09:00:00.000Z";
const LENA_ID = "00000000-0000-4000-8000-000000001004";
const MARCUS_ID = "00000000-0000-4000-8000-000000001005";

const profiles: ProviderProfile[] = [
  {
    id: "00000000-0000-4000-8000-000000006001",
    userId: DEMO_PRACTITIONER_ID,
    roleTitle: "Therapist",
    pronouns: "He/him",
    yearsExperience: 14,
    introMd:
      "Hi, I'm Brendan. I'm a licensed clinical social worker who has spent the last fourteen years helping New Yorkers work through anxiety, depression, and the kind of life transitions that don't come with a manual — a new job, a breakup, a diagnosis, a move across the country. I did my clinical training at Fordham and cut my teeth in community mental health before opening a private practice, so I've sat with people across a huge range of circumstances, and I don't rattle easily.\n\nWhat I hear most from new clients is that they've been carrying something alone for a long time and just want a place to finally put it down. That's what our first few sessions are for — not diagnosing you, just understanding what your week actually looks like and what's been hardest to say out loud.",
    approachMd:
      "I lean on cognitive behavioral therapy and acceptance and commitment therapy, but I'm not precious about modality — I'd rather adapt the approach to you than make you fit the approach. Early sessions are mostly listening; I want to understand your history, your support system, and what's already working before I suggest anything new.\n\nI'm direct but not clinical-sounding — you'll get real reactions from me, including the occasional gentle pushback if I think you're being harder on yourself than the situation calls for. Homework is optional but usually helpful: a thought log, a values exercise, sometimes just noticing a pattern for a week before we talk about it.",
    expectMd:
      "Sessions are 45 minutes, weekly to start, then we adjust the cadence together once things feel more stable. I'll check in on what's changed since we last talked, follow threads that matter to you rather than sticking to a rigid agenda, and periodically zoom out to ask whether therapy is actually moving the needle — if it isn't, we change course. I respond to messages within a business day, and I'm upfront if I think a concern is outside my scope, with a referral ready rather than a dead end.",
    identifyAs: "a cisgender man, and a first-generation American — both show up in how I think about family expectations and the pressure to 'have it figured out.'",
    styleIs: "warm but direct; I'll ask the follow-up question you were hoping I'd skip.",
    training: "Fordham University Graduate School of Social Service (MSW); post-graduate training in CBT and ACT through the Beck Institute.",
    licenseType: "LCSW",
    licensedIn: ["New York"],
    insuranceAccepted: ["Aetna", "Cigna", "UnitedHealthcare", "Empire BCBS", "Oxford", "Out-of-network"],
    topSpecialties: ["Anxiety", "Depression", "Life transitions"],
    moreSpecialties: ["Relationship issues", "Grief", "Work stress", "Self-esteem"],
    therapyMethods: ["Cognitive Behavioral Therapy (CBT)", "Acceptance and Commitment Therapy (ACT)", "Motivational Interviewing"],
    careTypes: ["Individual therapy", "Telehealth", "In-person"],
    agesServed: ["Adults", "Older adults"],
    languages: ["English"],
    locationLabel: "Union Square, Manhattan · also available by video across New York State",
    nearbyAreas: [
      "Union Square", "Gramercy", "Chelsea", "East Village", "Greenwich Village", "Flatiron", "NoHo", "Kips Bay",
      "Murray Hill", "SoHo", "West Village", "NoMad", "Stuyvesant Town", "Midtown East", "Lower East Side", "Tribeca",
    ],
    illustrationKey: "leuk_7h6ra17h6ra17h6r",
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "00000000-0000-4000-8000-000000006002",
    userId: PRIYA_PRACTITIONER_ID,
    roleTitle: "Therapist",
    pronouns: "She/her",
    yearsExperience: 9,
    introMd:
      "Hi, I'm Priya. I'm a licensed mental health counselor working primarily with people navigating anxiety, trauma, and the particular pressure of being the one who's supposed to hold everything together — for a family, a partner, a job that never quite turns off.\n\nA lot of my caseload is first- and second-generation clients balancing two sets of expectations at once, but you don't need that background to work with me — I just happen to know that terrain well. I trained at NYU and have spent my career in New York, so the stress of this specific city is not news to me.",
    approachMd:
      "My approach is trauma-informed and somatic-aware — I pay attention to what's happening in your body, not just what you're saying, because anxiety rarely stays only in your thoughts. I use EMDR with clients who are ready to process specific memories, and CBT for the more day-to-day anxious-thought-spiral work.\n\nI move at your pace. Some clients want to get into the hard material right away; others need months of relationship-building first. Both are fine with me — I'll tell you what I'm noticing, but you decide when we go deeper.",
    expectMd:
      "We'll start with a longer intake session to map out your history and what brought you in, then settle into 45-minute weekly sessions. I take notes sparingly during session because I'd rather be looking at you than at a laptop. Between sessions, I'm reachable for brief check-ins if something urgent comes up, and I'll always tell you honestly if I think a different level of care — a psychiatrist for medication, a support group, an intensive program — would serve you better than more of me.",
    identifyAs: "a South Asian woman and the daughter of immigrants — I understand the specific weight of being 'the responsible one.'",
    styleIs: "steady and unhurried; I don't do crisis-voice unless it's actually a crisis.",
    training: "New York University (MA, Mental Health Counseling); EMDRIA-certified in EMDR; trained in Internal Family Systems (Level 1).",
    licenseType: "LMHC",
    licensedIn: ["New York"],
    insuranceAccepted: ["Aetna", "Cigna", "Empire BCBS", "Fidelis Care", "Out-of-network"],
    topSpecialties: ["Anxiety", "Trauma & PTSD", "Cultural identity"],
    moreSpecialties: ["Family conflict", "Perfectionism", "Burnout", "First-generation stress"],
    therapyMethods: ["EMDR", "Cognitive Behavioral Therapy (CBT)", "Internal Family Systems (IFS)"],
    careTypes: ["Individual therapy", "Telehealth", "In-person"],
    agesServed: ["Adults"],
    languages: ["English", "Hindi", "Tamil"],
    locationLabel: "Union Square, Manhattan · also available by video across New York State",
    nearbyAreas: [
      "Union Square", "Flatiron", "Gramercy", "NoHo", "Murray Hill", "Chelsea", "East Village", "Kips Bay",
      "NoMad", "Midtown South", "SoHo", "West Village", "Greenwich Village", "Stuyvesant Town", "Turtle Bay", "Peter Cooper Village",
    ],
    illustrationKey: "leuk_5ziunj5ziunj5ziu",
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "00000000-0000-4000-8000-000000006003",
    userId: LENA_ID,
    roleTitle: "Therapist",
    pronouns: "She/her",
    yearsExperience: 11,
    introMd:
      "Hi, I'm Lena. I work with people moving through grief, chronic illness, and the kind of major health transitions that upend a life overnight — a diagnosis, a caregiving role you didn't choose, a body that suddenly works differently than it used to. I also see a lot of clients in the thick of a difficult pregnancy, postpartum period, or fertility journey.\n\nI came to this work after several years in medical social work at a hospital, so I'm comfortable with the practical and the emotional at the same time — happy to talk through how to have a hard conversation with a doctor and how to sit with the grief underneath it.",
    approachMd:
      "My style blends mindfulness-based approaches with straightforward grief and health psychology frameworks. I don't believe grief is something to 'get through' on a schedule, so we won't rush it — but I will help you build the daily-functioning skills you need while it's still heavy.\n\nI bring in breathing and grounding techniques often, not as an add-on but because a dysregulated nervous system makes everything else harder to work on. Expect some quiet in our sessions; I'm not afraid of it.",
    expectMd:
      "Sessions run 45 minutes, and I keep the structure loose in the early weeks of any big transition — some weeks we'll problem-solve logistics, others we'll just sit with how hard it is. As things stabilize, I'll introduce more structure and skills work. I coordinate with other providers (a physician, a hospice team, a fertility clinic) when a client wants that, with your written consent.",
    identifyAs: "a cisgender woman and a former hospital social worker — medical systems, and how exhausting they are to navigate, are genuinely familiar territory for me.",
    styleIs: "calm and unhurried, with a practical streak — I'll help with the logistics, not just the feelings.",
    training: "Columbia University School of Social Work (MSW); certificate in Hospice and Palliative Care Social Work; trained in Mindfulness-Based Stress Reduction (MBSR).",
    licenseType: "LCSW",
    licensedIn: ["New York", "New Jersey"],
    insuranceAccepted: ["Aetna", "UnitedHealthcare", "Empire BCBS", "Healthfirst", "Out-of-network"],
    topSpecialties: ["Grief & loss", "Chronic illness", "Reproductive & maternal mental health"],
    moreSpecialties: ["Caregiver stress", "Health anxiety", "Life transitions"],
    therapyMethods: ["Mindfulness-Based Stress Reduction (MBSR)", "Grief-focused therapy", "Acceptance and Commitment Therapy (ACT)"],
    careTypes: ["Individual therapy", "Telehealth", "In-person"],
    agesServed: ["Adults", "Older adults"],
    languages: ["English"],
    locationLabel: "Union Square, Manhattan · also available by video across New York and New Jersey",
    nearbyAreas: [
      "Union Square", "Flatiron", "Gramercy", "Kips Bay", "Murray Hill", "Chelsea", "East Village", "NoHo",
      "Stuyvesant Town", "Peter Cooper Village", "NoMad", "Midtown East", "West Village", "SoHo", "Hoboken, NJ", "Jersey City, NJ",
    ],
    illustrationKey: "maya-2",
    createdAt: T,
    updatedAt: T,
  },
  {
    id: "00000000-0000-4000-8000-000000006004",
    userId: MARCUS_ID,
    roleTitle: "Therapist",
    pronouns: "He/him",
    yearsExperience: 7,
    introMd:
      "Hi, I'm Marcus. I work mostly with men navigating anger, career stress, and the general challenge of talking about feelings when you were never really taught how. A good chunk of my caseload is guys in their late twenties through forties dealing with burnout, a rocky relationship, or a temper that's starting to cost them something.\n\nI'm not going to hand you a worksheet and call it a day. I played competitive sports through college, and a lot of what I do borrows from that world — building a routine, tracking what actually helps, treating your mental health like something you train, not just something you fix when it breaks.",
    approachMd:
      "I use cognitive behavioral therapy as the backbone, with a lot of direct, structured skill-building for anger and stress specifically — noticing your build-up cues, practicing the pause, changing the story you're telling yourself in the moment. I also draw on motivational interviewing when someone's ambivalent about change, which is most people, honestly.\n\nSessions with me feel more like a working conversation than a soft-lit therapy-office cliché. I'll challenge you. I'll also tell you when you're being too hard on yourself, which happens more than people expect.",
    expectMd:
      "45-minute sessions, usually weekly at the start. I'll ask you to track specific things between sessions — triggers, sleep, what set off a bad week — because patterns are easier to see on paper than in memory. I keep things practical: if a technique isn't working after a few honest tries, we drop it and try something else instead of forcing it.",
    identifyAs: "a Black man, and a former college athlete — I think a lot about how masculinity and performance culture shape what men feel allowed to say out loud.",
    styleIs: "direct, a little irreverent, and allergic to therapy-speak.",
    training: "Hunter College (MS, Mental Health Counseling); trained in Anger Management (National Anger Management Association) and Motivational Interviewing.",
    licenseType: "LMHC",
    licensedIn: ["New York"],
    insuranceAccepted: ["Cigna", "UnitedHealthcare", "Oxford", "Out-of-network"],
    topSpecialties: ["Anger management", "Men's mental health", "Career & burnout"],
    moreSpecialties: ["Relationship conflict", "ADHD", "Stress management"],
    therapyMethods: ["Cognitive Behavioral Therapy (CBT)", "Motivational Interviewing", "Anger management skills training"],
    careTypes: ["Individual therapy", "Telehealth", "In-person"],
    agesServed: ["Adults"],
    languages: ["English"],
    locationLabel: "Union Square, Manhattan · also available by video across New York State",
    nearbyAreas: [
      "Union Square", "East Village", "NoHo", "Chelsea", "Gramercy", "Flatiron", "Murray Hill", "Kips Bay",
      "Greenwich Village", "SoHo", "West Village", "NoMad", "Lower East Side", "Tribeca", "Midtown South", "Stuyvesant Town",
    ],
    illustrationKey: "maya-1",
    createdAt: T,
    updatedAt: T,
  },
];

registerFixtures("provider-profiles", (store) => {
  for (const p of profiles) store.providerProfiles.set(p.id, p);
});
