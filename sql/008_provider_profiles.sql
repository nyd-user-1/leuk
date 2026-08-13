-- Leuk — provider profiles (008). Adds a persisted SEO slug to users +
-- directory_providers (never the NPI — see docs-nppes-field-catalog.md), and
-- the provider_profiles content model behind /providers/[slug]. Follows 001's
-- conventions: uuid PKs, TIMESTAMPTZ, snake_case. Re-runnable (idempotent
-- ALTER/CREATE IF NOT EXISTS + WHERE ... IS NULL guards on the seed updates).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE directory_providers ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- ── provider_profiles ───────────────────────────────────────────────────────
-- Rich content for the /providers/[slug] page, 1:1 with a practitioner user.
-- Directory providers (sparse NPPES/Medicaid rows) never get one of these —
-- their profile page renders straight off directory_providers' own fields.
CREATE TABLE IF NOT EXISTS provider_profiles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title         TEXT,        -- "Therapist" | "Psychiatrist" | ...
  pronouns           TEXT,
  years_experience   INT,
  intro_md           TEXT,        -- "Great to meet you!"
  approach_md        TEXT,        -- "My approach to therapy"
  expect_md          TEXT,        -- "What you can expect from me"
  identify_as        TEXT,
  style_is           TEXT,
  training           TEXT,
  license_type       TEXT,
  licensed_in        TEXT[] NOT NULL DEFAULT '{}',
  insurance_accepted TEXT[] NOT NULL DEFAULT '{}',
  top_specialties    TEXT[] NOT NULL DEFAULT '{}',
  more_specialties   TEXT[] NOT NULL DEFAULT '{}',
  therapy_methods    TEXT[] NOT NULL DEFAULT '{}',
  care_types         TEXT[] NOT NULL DEFAULT '{}',
  ages_served        TEXT[] NOT NULL DEFAULT '{}',
  languages          TEXT[] NOT NULL DEFAULT '{}',
  location_label     TEXT,
  nearby_areas       TEXT[] NOT NULL DEFAULT '{}',
  illustration_key   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE provider_profiles IS 'Rich /providers/[slug] content for bookable Leuk practitioners, keyed 1:1 to users.id.';

-- ── slugs — the 4 seeded practitioners + Shelley (added post-seed by the ─────
-- booking session; her row may or may not exist yet — this UPDATE is a no-op
-- until it does, and idempotent (WHERE slug IS NULL) once it lands).
UPDATE users SET slug = 'brendan-stanton' WHERE email = 'brendan@leuk.demo' AND slug IS NULL;
UPDATE users SET slug = 'priya-raman'     WHERE email = 'priya@leuk.demo'   AND slug IS NULL;
UPDATE users SET slug = 'lena-whitfield'  WHERE email = 'lena@leuk.demo'    AND slug IS NULL;
UPDATE users SET slug = 'marcus-bell'     WHERE email = 'marcus@leuk.demo'  AND slug IS NULL;
UPDATE users SET slug = 'shelley-padgett' WHERE email = 'shelley@leuk.demo' AND slug IS NULL;

-- ── profiles — one INSERT ... SELECT per practitioner, keyed by email so ────
-- this runs correctly regardless of insert order relative to the booking
-- lane's Shelley script. ON CONFLICT (user_id) makes re-runs a no-op.

INSERT INTO provider_profiles (
  user_id, role_title, pronouns, years_experience, intro_md, approach_md, expect_md,
  identify_as, style_is, training, license_type, licensed_in, insurance_accepted,
  top_specialties, more_specialties, therapy_methods, care_types, ages_served,
  languages, location_label, nearby_areas, illustration_key
)
SELECT id, 'Therapist', 'He/him', 14,
$intro$Hi, I'm Brendan. I'm a licensed clinical social worker who has spent the last fourteen years helping New Yorkers work through anxiety, depression, and the kind of life transitions that don't come with a manual — a new job, a breakup, a diagnosis, a move across the country. I did my clinical training at Fordham and cut my teeth in community mental health before opening a private practice, so I've sat with people across a huge range of circumstances, and I don't rattle easily.

What I hear most from new clients is that they've been carrying something alone for a long time and just want a place to finally put it down. That's what our first few sessions are for — not diagnosing you, just understanding what your week actually looks like and what's been hardest to say out loud.$intro$,
$approach$I lean on cognitive behavioral therapy and acceptance and commitment therapy, but I'm not precious about modality — I'd rather adapt the approach to you than make you fit the approach. Early sessions are mostly listening; I want to understand your history, your support system, and what's already working before I suggest anything new.

I'm direct but not clinical-sounding — you'll get real reactions from me, including the occasional gentle pushback if I think you're being harder on yourself than the situation calls for. Homework is optional but usually helpful: a thought log, a values exercise, sometimes just noticing a pattern for a week before we talk about it.$approach$,
$expect$Sessions are 45 minutes, weekly to start, then we adjust the cadence together once things feel more stable. I'll check in on what's changed since we last talked, follow threads that matter to you rather than sticking to a rigid agenda, and periodically zoom out to ask whether therapy is actually moving the needle — if it isn't, we change course. I respond to messages within a business day, and I'm upfront if I think a concern is outside my scope, with a referral ready rather than a dead end.$expect$,
$id2$a cisgender man, and a first-generation American — both show up in how I think about family expectations and the pressure to 'have it figured out.'$id2$,
$style$warm but direct; I'll ask the follow-up question you were hoping I'd skip.$style$,
'Fordham University Graduate School of Social Service (MSW); post-graduate training in CBT and ACT through the Beck Institute.',
'LCSW',
ARRAY['New York'],
ARRAY['Aetna','Cigna','UnitedHealthcare','Empire BCBS','Oxford','Out-of-network'],
ARRAY['Anxiety','Depression','Life transitions'],
ARRAY['Relationship issues','Grief','Work stress','Self-esteem'],
ARRAY['Cognitive Behavioral Therapy (CBT)','Acceptance and Commitment Therapy (ACT)','Motivational Interviewing'],
ARRAY['Individual therapy','Telehealth','In-person'],
ARRAY['Adults','Older adults'],
ARRAY['English'],
'Union Square, Manhattan · also available by video across New York State',
ARRAY['Union Square','Gramercy','Chelsea','East Village','Greenwich Village','Flatiron','NoHo','Kips Bay','Murray Hill','SoHo','West Village','NoMad','Stuyvesant Town','Midtown East','Lower East Side','Tribeca'],
'leuk_7h6ra17h6ra17h6r'
FROM users WHERE email = 'brendan@leuk.demo'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO provider_profiles (
  user_id, role_title, pronouns, years_experience, intro_md, approach_md, expect_md,
  identify_as, style_is, training, license_type, licensed_in, insurance_accepted,
  top_specialties, more_specialties, therapy_methods, care_types, ages_served,
  languages, location_label, nearby_areas, illustration_key
)
SELECT id, 'Therapist', 'She/her', 9,
$intro$Hi, I'm Priya. I'm a licensed mental health counselor working primarily with people navigating anxiety, trauma, and the particular pressure of being the one who's supposed to hold everything together — for a family, a partner, a job that never quite turns off.

A lot of my caseload is first- and second-generation clients balancing two sets of expectations at once, but you don't need that background to work with me — I just happen to know that terrain well. I trained at NYU and have spent my career in New York, so the stress of this specific city is not news to me.$intro$,
$approach$My approach is trauma-informed and somatic-aware — I pay attention to what's happening in your body, not just what you're saying, because anxiety rarely stays only in your thoughts. I use EMDR with clients who are ready to process specific memories, and CBT for the more day-to-day anxious-thought-spiral work.

I move at your pace. Some clients want to get into the hard material right away; others need months of relationship-building first. Both are fine with me — I'll tell you what I'm noticing, but you decide when we go deeper.$approach$,
$expect$We'll start with a longer intake session to map out your history and what brought you in, then settle into 45-minute weekly sessions. I take notes sparingly during session because I'd rather be looking at you than at a laptop. Between sessions, I'm reachable for brief check-ins if something urgent comes up, and I'll always tell you honestly if I think a different level of care — a psychiatrist for medication, a support group, an intensive program — would serve you better than more of me.$expect$,
$id2$a South Asian woman and the daughter of immigrants — I understand the specific weight of being 'the responsible one.'$id2$,
$style$steady and unhurried; I don't do crisis-voice unless it's actually a crisis.$style$,
'New York University (MA, Mental Health Counseling); EMDRIA-certified in EMDR; trained in Internal Family Systems (Level 1).',
'LMHC',
ARRAY['New York'],
ARRAY['Aetna','Cigna','Empire BCBS','Fidelis Care','Out-of-network'],
ARRAY['Anxiety','Trauma & PTSD','Cultural identity'],
ARRAY['Family conflict','Perfectionism','Burnout','First-generation stress'],
ARRAY['EMDR','Cognitive Behavioral Therapy (CBT)','Internal Family Systems (IFS)'],
ARRAY['Individual therapy','Telehealth','In-person'],
ARRAY['Adults'],
ARRAY['English','Hindi','Tamil'],
'Union Square, Manhattan · also available by video across New York State',
ARRAY['Union Square','Flatiron','Gramercy','NoHo','Murray Hill','Chelsea','East Village','Kips Bay','NoMad','Midtown South','SoHo','West Village','Greenwich Village','Stuyvesant Town','Turtle Bay','Peter Cooper Village'],
'leuk_5ziunj5ziunj5ziu'
FROM users WHERE email = 'priya@leuk.demo'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO provider_profiles (
  user_id, role_title, pronouns, years_experience, intro_md, approach_md, expect_md,
  identify_as, style_is, training, license_type, licensed_in, insurance_accepted,
  top_specialties, more_specialties, therapy_methods, care_types, ages_served,
  languages, location_label, nearby_areas, illustration_key
)
SELECT id, 'Therapist', 'She/her', 11,
$intro$Hi, I'm Lena. I work with people moving through grief, chronic illness, and the kind of major health transitions that upend a life overnight — a diagnosis, a caregiving role you didn't choose, a body that suddenly works differently than it used to. I also see a lot of clients in the thick of a difficult pregnancy, postpartum period, or fertility journey.

I came to this work after several years in medical social work at a hospital, so I'm comfortable with the practical and the emotional at the same time — happy to talk through how to have a hard conversation with a doctor and how to sit with the grief underneath it.$intro$,
$approach$My style blends mindfulness-based approaches with straightforward grief and health psychology frameworks. I don't believe grief is something to 'get through' on a schedule, so we won't rush it — but I will help you build the daily-functioning skills you need while it's still heavy.

I bring in breathing and grounding techniques often, not as an add-on but because a dysregulated nervous system makes everything else harder to work on. Expect some quiet in our sessions; I'm not afraid of it.$approach$,
$expect$Sessions run 45 minutes, and I keep the structure loose in the early weeks of any big transition — some weeks we'll problem-solve logistics, others we'll just sit with how hard it is. As things stabilize, I'll introduce more structure and skills work. I coordinate with other providers (a physician, a hospice team, a fertility clinic) when a client wants that, with your written consent.$expect$,
$id2$a cisgender woman and a former hospital social worker — medical systems, and how exhausting they are to navigate, are genuinely familiar territory for me.$id2$,
$style$calm and unhurried, with a practical streak — I'll help with the logistics, not just the feelings.$style$,
'Columbia University School of Social Work (MSW); certificate in Hospice and Palliative Care Social Work; trained in Mindfulness-Based Stress Reduction (MBSR).',
'LCSW',
ARRAY['New York','New Jersey'],
ARRAY['Aetna','UnitedHealthcare','Empire BCBS','Healthfirst','Out-of-network'],
ARRAY['Grief & loss','Chronic illness','Reproductive & maternal mental health'],
ARRAY['Caregiver stress','Health anxiety','Life transitions'],
ARRAY['Mindfulness-Based Stress Reduction (MBSR)','Grief-focused therapy','Acceptance and Commitment Therapy (ACT)'],
ARRAY['Individual therapy','Telehealth','In-person'],
ARRAY['Adults','Older adults'],
ARRAY['English'],
'Union Square, Manhattan · also available by video across New York and New Jersey',
ARRAY['Union Square','Flatiron','Gramercy','Kips Bay','Murray Hill','Chelsea','East Village','NoHo','Stuyvesant Town','Peter Cooper Village','NoMad','Midtown East','West Village','SoHo','Hoboken, NJ','Jersey City, NJ'],
'maya-2'
FROM users WHERE email = 'lena@leuk.demo'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO provider_profiles (
  user_id, role_title, pronouns, years_experience, intro_md, approach_md, expect_md,
  identify_as, style_is, training, license_type, licensed_in, insurance_accepted,
  top_specialties, more_specialties, therapy_methods, care_types, ages_served,
  languages, location_label, nearby_areas, illustration_key
)
SELECT id, 'Therapist', 'He/him', 7,
$intro$Hi, I'm Marcus. I work mostly with men navigating anger, career stress, and the general challenge of talking about feelings when you were never really taught how. A good chunk of my caseload is guys in their late twenties through forties dealing with burnout, a rocky relationship, or a temper that's starting to cost them something.

I'm not going to hand you a worksheet and call it a day. I played competitive sports through college, and a lot of what I do borrows from that world — building a routine, tracking what actually helps, treating your mental health like something you train, not just something you fix when it breaks.$intro$,
$approach$I use cognitive behavioral therapy as the backbone, with a lot of direct, structured skill-building for anger and stress specifically — noticing your build-up cues, practicing the pause, changing the story you're telling yourself in the moment. I also draw on motivational interviewing when someone's ambivalent about change, which is most people, honestly.

Sessions with me feel more like a working conversation than a soft-lit therapy-office cliché. I'll challenge you. I'll also tell you when you're being too hard on yourself, which happens more than people expect.$approach$,
$expect$45-minute sessions, usually weekly at the start. I'll ask you to track specific things between sessions — triggers, sleep, what set off a bad week — because patterns are easier to see on paper than in memory. I keep things practical: if a technique isn't working after a few honest tries, we drop it and try something else instead of forcing it.$expect$,
$id2$a Black man, and a former college athlete — I think a lot about how masculinity and performance culture shape what men feel allowed to say out loud.$id2$,
$style$direct, a little irreverent, and allergic to therapy-speak.$style$,
'Hunter College (MS, Mental Health Counseling); trained in Anger Management (National Anger Management Association) and Motivational Interviewing.',
'LMHC',
ARRAY['New York'],
ARRAY['Cigna','UnitedHealthcare','Oxford','Out-of-network'],
ARRAY['Anger management','Men''s mental health','Career & burnout'],
ARRAY['Relationship conflict','ADHD','Stress management'],
ARRAY['Cognitive Behavioral Therapy (CBT)','Motivational Interviewing','Anger management skills training'],
ARRAY['Individual therapy','Telehealth','In-person'],
ARRAY['Adults'],
ARRAY['English'],
'Union Square, Manhattan · also available by video across New York State',
ARRAY['Union Square','East Village','NoHo','Chelsea','Gramercy','Flatiron','Murray Hill','Kips Bay','Greenwich Village','SoHo','West Village','NoMad','Lower East Side','Tribeca','Midtown South','Stuyvesant Town'],
'maya-1'
FROM users WHERE email = 'marcus@leuk.demo'
ON CONFLICT (user_id) DO NOTHING;

-- Shelley Padgett — psychiatrist (medication management). Her user record is
-- the booking lane's fixture; this INSERT ... SELECT is a no-op until it
-- exists and picks it up automatically (idempotent) once it does. Her real
-- Headway profile (care.headway.co/providers/shelley-padgett-2) 403'd on
-- fetch, so this is authored in Leuk's voice like the others, not copied.
INSERT INTO provider_profiles (
  user_id, role_title, pronouns, years_experience, intro_md, approach_md, expect_md,
  identify_as, style_is, training, license_type, licensed_in, insurance_accepted,
  top_specialties, more_specialties, therapy_methods, care_types, ages_served,
  languages, location_label, nearby_areas, illustration_key
)
SELECT id, 'Psychiatrist', 'She/her', 16,
$intro$Hi, I'm Dr. Padgett. I'm a board-certified psychiatrist focused on medication management for mood disorders, anxiety, ADHD, and sleep problems — the kind of things that often respond well to the right medication alongside good therapy, but rarely to either alone. I did my residency in New York and have spent the past sixteen years split between hospital psychiatry and outpatient private practice.

Most people who come to me have already tried therapy, or are in it now, and want to know whether medication could help too. My first job is always to actually figure out what's going on — not to reach for a prescription pad in the first ten minutes.$intro$,
$approach$I practice conservatively: start low, go slow, and change one thing at a time so we can actually tell what's working. I spend real time on the diagnostic picture before medication ever comes up, including screening for the things that get missed — thyroid issues, sleep apnea, substance use, ADHD hiding underneath anxiety.

I work collaboratively with a client's therapist when they have one, and I'm comfortable coordinating with a primary care doctor too. I see medication as one tool among several, not the whole plan.$approach$,
$expect$The first appointment is 60 minutes — a full psychiatric evaluation, not a rushed checklist. Follow-ups are 25 minutes and spaced out as things stabilize, usually monthly or longer once a medication is working well. I'm available by secure message between visits for side-effect questions or a needed adjustment, and I'll always explain the reasoning behind a medication change, not just the change itself.$expect$,
$id2$a woman and a physician who spent years in hospital psychiatry before moving to outpatient care — I've seen what happens when medication is rushed, and I practice deliberately because of it.$id2$,
$style$measured and thorough; I'd rather take an extra visit to get the diagnosis right than guess.$style$,
'Icahn School of Medicine at Mount Sinai (MD); psychiatry residency, NewYork-Presbyterian; board-certified, American Board of Psychiatry and Neurology.',
'MD, board-certified psychiatrist',
ARRAY['New York'],
ARRAY['Aetna','Cigna','UnitedHealthcare','Empire BCBS','Out-of-network'],
ARRAY['Medication management','Mood disorders','ADHD'],
ARRAY['Anxiety','Sleep disorders','Perinatal psychiatry'],
ARRAY[]::TEXT[],
ARRAY['Medication management','Telehealth'],
ARRAY['Adults'],
ARRAY['English'],
'Telehealth across New York State',
ARRAY['Union Square','Gramercy','Flatiron','Murray Hill','Chelsea','East Village','NoHo','Kips Bay','NoMad','SoHo','West Village','Greenwich Village','Midtown East','Stuyvesant Town','Turtle Bay','Peter Cooper Village'],
'leuk_e0mhvxe0mhvxe0mh'
FROM users WHERE email = 'shelley@leuk.demo'
ON CONFLICT (user_id) DO NOTHING;
