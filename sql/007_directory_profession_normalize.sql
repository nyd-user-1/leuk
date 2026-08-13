-- Leuk — 007: normalize the profession vocabulary across sources.
--
-- Medicaid stored raw uppercase service categories ("CLINICAL SOCIAL WORKER")
-- while NPPES stores clean discipline labels ("Clinical Social Worker"), so the
-- profession facet showed each discipline twice. Map the Medicaid rows onto the
-- canonical NPPES vocabulary. Idempotent; the ingest applies the same map going
-- forward (PROFESSION_CANON in scripts/ingest-directory.mjs).

UPDATE directory_providers SET profession = CASE profession
    WHEN 'CLINICAL SOCIAL WORKER'      THEN 'Clinical Social Worker'
    WHEN 'CLINICAL PSYCHOLOGIST'       THEN 'Psychologist'
    WHEN 'MENTAL HEALTH COUNSELORS'    THEN 'Mental Health Counselor'
    WHEN 'MARRIAGE & FAMILY THERAPIST' THEN 'Marriage & Family Therapist'
    WHEN 'LICENSED BEHAVIOR ANALYST'   THEN 'Behavior Analyst'
    WHEN 'MENTAL HEALTH REHABILITATION' THEN 'Mental Health Rehabilitation'
    ELSE profession
  END
WHERE source = 'medicaid'
  AND profession IN (
    'CLINICAL SOCIAL WORKER','CLINICAL PSYCHOLOGIST','MENTAL HEALTH COUNSELORS',
    'MARRIAGE & FAMILY THERAPIST','LICENSED BEHAVIOR ANALYST','MENTAL HEALTH REHABILITATION'
  );
