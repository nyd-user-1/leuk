-- 076 — directory_providers.focus: what each clinician's taxonomy codes say
-- they focus on, ALL codes, not just the primary.
--
-- sql/006 derived `subspecialty` from the primary code alone. 23,854 rows carry
-- secondary codes we never read — Addiction (Substance Use Disorder) counsellors,
-- Clinical Child & Adolescent psychologists, Cognitive & Behavioral, … — so a
-- clinician who declared a focus was searchable only if it happened to be their
-- first code. `focus` is the de-duplicated set of NUCC specialisations across
-- primary + secondary codes, minus the generic ones that describe the license
-- rather than a focus (Clinical, Mental Health, Psychiatry, …).
--
-- Re-runnable. Idempotent. Applies to leuk-public.

ALTER TABLE directory_providers ADD COLUMN IF NOT EXISTS focus TEXT[] NOT NULL DEFAULT '{}';

WITH per AS (
  SELECT d.id,
         ARRAY(
           SELECT DISTINCT n.specialization
           FROM unnest(COALESCE(d.taxonomies, '{}'::text[]) || COALESCE(ARRAY[d.primary_taxonomy], '{}'::text[])) AS t(code)
           JOIN nucc_taxonomy n ON n.code = t.code
           WHERE n.specialization IS NOT NULL
             AND n.specialization <> ''
             -- behavioral-health focus only. A multi-specialty organisation's
             -- cardiology code is not a mental-health focus; its sleep-medicine,
             -- pain, addiction, developmental-pediatrics or geriatric code is.
             AND (
               n.grouping = 'Behavioral Health & Social Service Providers'
               OR n.specialization ILIKE '%psychiat%'
               OR n.specialization ILIKE '%mental health%'
               OR n.specialization ILIKE '%addiction%'
               OR n.specialization ILIKE '%substance use%'
               OR n.specialization IN (
                 'Psychosomatic Medicine', 'Sleep Medicine', 'Pain Medicine',
                 'Developmental - Behavioral Pediatrics', 'Adolescent Medicine',
                 'Gerontology', 'Geriatric Medicine', 'Behavioral Neurology & Neuropsychiatry'
               )
             )
             AND n.specialization NOT IN (
               'Clinical', 'Mental Health', 'Psychiatry', 'Psychiatric/Mental Health',
               'Health', 'Health Service', 'Prescribing (Medical)', 'Counseling', 'Professional',
               'Adult Health', 'Mental Health (Including Community Mental Health Center)',
               'Psychiatric/Mental Health, Adult'
             )
           ORDER BY 1
         ) AS f
  FROM directory_providers d
)
UPDATE directory_providers d SET focus = per.f
FROM per WHERE per.id = d.id AND d.focus IS DISTINCT FROM per.f;

CREATE INDEX IF NOT EXISTS idx_dir_providers_focus ON directory_providers USING GIN (focus);
