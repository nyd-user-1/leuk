-- Leuk — Jason Hilario, real practitioner (011). Adds a fifth bookable
-- practitioner (psychiatric NP, Reno NV) via the provider_profiles content
-- model from 008. Bio content is real, sourced from his public Headway
-- profile (care.headway.co/providers/jason-hilario), not authored copy.
--
-- Also removes Brendan's provider_profiles row: he's the practice admin, not
-- a public-facing provider. His users row, role, login, calendar, and
-- appointments are untouched — only his /providers/[slug] content goes away.

INSERT INTO users (id, role, name, email, password_hash, avatar_hue, phone, timezone, slug)
SELECT '00000000-0000-4000-8000-000000001007', 'practitioner', 'Jason Hilario', 'jason@leuk.demo',
  (SELECT password_hash FROM users WHERE email = 'brendan@leuk.demo'),
  'pink', '+1 775 555 0161', 'America/Los_Angeles', 'jason-hilario'
ON CONFLICT (id) DO NOTHING;

INSERT INTO provider_profiles (
  user_id, role_title, pronouns, years_experience, intro_md, approach_md, expect_md,
  identify_as, style_is, training, license_type, licensed_in, insurance_accepted,
  top_specialties, more_specialties, therapy_methods, care_types, ages_served,
  languages, location_label, nearby_areas, illustration_key
)
SELECT id, 'Psychiatric Nurse Practitioner', 'He/him', 1,
$intro$Hey there, my name's Jason, and I'm a psychiatric nurse practitioner who's here to help you feel more like you again. I work with adults who are stressed, stuck, anxious, or just trying to keep it all together. This includes those who have a history of or may feel like they have anxiety, depression, OCD, PTSD, or ADHD. My style is laid-back but curious; I like asking the right questions so we can figure things out together. We can meet with in-person in my Reno office or online anywhere in the state of Nevada. Most of my clients are navigating that "How do I manage life and still feel okay?" stage. If that's you, just know that you're not alone. I've got your back, and I'm here to help.$intro$,
$approach$My job isn't just to treat symptoms—it's to understand you. I ask a lot of questions, not to dig for problems, but to get a real feel for who you are and what matters most to you. I see this as a team effort: your story and your goals, I'm just here to help you move forward. I mix therapy and medication where and when it makes sense to do so, and I tailor everything to fit you, not the other way around. You can expect honesty, curiosity, and a no-judgment zone every step of the way. Wherever you're starting from, I'm here to meet you there.$approach$,
$expect$You might not leave every session with all the answers, but you will always leave with someone firmly in your corner. I'll be your advocate, working with you to take the steps that move you toward feeling better, even if the progress is slow or the direction isn't always clear. I'll provide you with tools and options, like GeneSight testing to help guide medication choices, Moxo.ai for more in-depth ADHD assessments, or referrals to intensive outpatient therapy programs, if/when needed. I've often been told how easy it feels to talk with me, and that means the world to me. I'm not here to judge; I'm here to listen, understand, and help. For me, success isn't perfection—it's progress, no matter how small.$expect$,
'Asian, Cisgender Man',
'Humorous, Inquisitive, Open Minded',
'MSN (Master of Science in Nursing) at Anderson University, Bachelor of Science at San Diego State University',
'APRN-CNP (Advanced Practice Registered Nurse - Certified Nurse Practitioner)',
ARRAY['Nevada'],
ARRAY['Aetna','Anthem Blue Cross and Blue Shield','Blue Cross Blue Shield of Massachusetts','Carelon Behavioral Health','Cigna','Oscar','Oxford','Providence Health Plan','United Healthcare'],
ARRAY['Anxiety','ADD/ADHD','Depression','OCD','PTSD'],
ARRAY['Family issues','Stress management','Panic disorders','Cultural & ethnic issues','Men''s issues','Relationship issues','Women''s issues','Trauma'],
ARRAY['Relational','Motivational Interviewing','Emotion Focused Therapy (EFT)','Positive Psychology','Solution Focused Brief Therapy (SFBT)','Interpersonal Psychotherapy (IPT)','Acceptance and Commitment Therapy (ACT)'],
ARRAY['Medication management','Individual therapy'],
ARRAY['Adults'],
ARRAY['English','Tagalog'],
'Reno, Nevada · also available by video across Nevada',
ARRAY['Reno','Sparks','Verdi','Damonte Ranch','Somersett','South Reno','Spanish Springs','Cold Springs'],
NULL
FROM users WHERE email = 'jason@leuk.demo'
ON CONFLICT (user_id) DO NOTHING;

-- M-F 9-5, matching the other four practitioners' schedule.
INSERT INTO availability (practitioner_id, weekday, start_time, end_time)
SELECT u.id, w, '09:00', '17:00'
FROM users u, generate_series(1, 5) AS w
WHERE u.email = 'jason@leuk.demo'
  AND NOT EXISTS (
    SELECT 1 FROM availability a WHERE a.practitioner_id = u.id AND a.weekday = w
  );

-- Brendan is the practice admin, not a public-facing provider — no bio
-- content, no /providers/brendan-stanton page. Safe to re-run.
DELETE FROM provider_profiles
WHERE user_id = (SELECT id FROM users WHERE email = 'brendan@leuk.demo');
