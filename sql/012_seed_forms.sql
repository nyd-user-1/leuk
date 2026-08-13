-- Six additional real, usable form templates (GAD-7, Consent to Treatment &
-- Privacy, Telehealth Consent, Release of Information, Financial Policy /
-- Card-on-File, Medication History) alongside the existing New Client Intake
-- (...10001) and PHQ-9 (...10002) from 002_seed.sql. Same block shape
-- (schema.blocks = [{id,type,label,options,required}]). Idempotent — safe to
-- re-run. Mirrored in lib/mock/forms.ts.

INSERT INTO forms (id, title, description, schema, status) VALUES
  ('00000000-0000-4000-8000-000000010003','GAD-7 Anxiety Screen','Over the last 2 weeks, how often have you been bothered by the following problems?',
   '{"blocks":[
     {"id":"scoring","type":"info","label":"Answer each item 0-3: 0 = Not at all, 1 = Several days, 2 = More than half the days, 3 = Nearly every day. Total score: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-21 severe.","required":false},
     {"id":"q1","type":"scale","label":"Feeling nervous, anxious, or on edge","options":["0","1","2","3"],"required":true},
     {"id":"q2","type":"scale","label":"Not being able to stop or control worrying","options":["0","1","2","3"],"required":true},
     {"id":"q3","type":"scale","label":"Worrying too much about different things","options":["0","1","2","3"],"required":true},
     {"id":"q4","type":"scale","label":"Trouble relaxing","options":["0","1","2","3"],"required":true},
     {"id":"q5","type":"scale","label":"Being so restless that it is hard to sit still","options":["0","1","2","3"],"required":true},
     {"id":"q6","type":"scale","label":"Becoming easily annoyed or irritable","options":["0","1","2","3"],"required":true},
     {"id":"q7","type":"scale","label":"Feeling afraid as if something awful might happen","options":["0","1","2","3"],"required":true}
   ]}','published'),
  ('00000000-0000-4000-8000-000000010004','Consent to Treatment & Privacy','Please review and sign before your first visit.',
   '{"blocks":[
     {"id":"intro","type":"info","label":"This form documents your consent to be evaluated and treated by your Leuk care team, and your acknowledgment of our privacy practices.","required":false},
     {"id":"full_name","type":"text","label":"Full legal name","required":true},
     {"id":"date","type":"date","label":"Date","required":true},
     {"id":"consent_treatment","type":"checkbox","label":"I consent to psychiatric and/or therapeutic evaluation and treatment by my care team at Leuk.","required":true},
     {"id":"privacy_ack","type":"checkbox","label":"I have received and reviewed Leuk''s Notice of Privacy Practices describing how my health information may be used and disclosed.","required":true},
     {"id":"revoke_ack","type":"checkbox","label":"I understand I may revoke this consent in writing at any time, except to the extent my care team has already relied on it.","required":true},
     {"id":"signature","type":"signature","label":"Signature","required":true}
   ]}','published'),
  ('00000000-0000-4000-8000-000000010005','Telehealth Consent','Please review before your first telehealth visit.',
   '{"blocks":[
     {"id":"intro","type":"info","label":"Telehealth lets you meet with your provider by live video or audio instead of in person. It carries some differences from in-person care worth understanding before your first session.","required":false},
     {"id":"location","type":"text","label":"City/state you will typically be located in for telehealth visits","required":true},
     {"id":"emergency_plan","type":"radio","label":"Telehealth is not appropriate for psychiatric emergencies. Have you discussed an emergency/crisis plan (nearest ER, 988) with your provider?","options":["Yes, we have discussed a plan","No, I would like to discuss this before my first telehealth visit"],"required":true},
     {"id":"tech_limits","type":"checkbox","label":"I understand telehealth visits may have technical limitations (audio/video interruptions, connectivity issues) and that privacy on my end of the connection is my responsibility.","required":true},
     {"id":"consent_telehealth","type":"checkbox","label":"I consent to receive psychiatric and/or therapy services by live video or audio telehealth.","required":true},
     {"id":"signature","type":"signature","label":"Signature","required":true}
   ]}','published'),
  ('00000000-0000-4000-8000-000000010006','Release of Information','Authorize Leuk to send or request records on your behalf.',
   '{"blocks":[
     {"id":"intro","type":"info","label":"Use this form to authorize Leuk to release your records to, or request records from, another person or organization.","required":false},
     {"id":"client_name","type":"text","label":"Client full legal name","required":true},
     {"id":"dob","type":"date","label":"Date of birth","required":true},
     {"id":"recipient","type":"textarea","label":"Name, organization, and contact information of who information will be released to or obtained from","required":true},
     {"id":"info_types","type":"checkbox","label":"Information to be released","options":["Diagnosis","Treatment summary","Medication list","Progress/therapy notes","Full record"],"required":true},
     {"id":"purpose","type":"select","label":"Purpose of release","options":["Continuity of care","Coordination with another provider","Legal/insurance request","Personal request","Other"],"required":true},
     {"id":"expires","type":"date","label":"This authorization expires on (leave blank for 1 year from signing)","required":false},
     {"id":"signature","type":"signature","label":"Signature","required":true}
   ]}','published'),
  ('00000000-0000-4000-8000-000000010007','Financial Policy & Card-on-File Authorization','Please review our financial policy and authorize a card on file.',
   '{"blocks":[
     {"id":"policy","type":"info","label":"Payment is due at time of service. Cancellations or reschedules within 24 hours of an appointment, and no-shows, are billed a $75 fee. Leuk is out-of-network with most insurers; we can provide a superbill for self-submission. A valid card is kept on file (collected securely through our payment portal, never through this form) for copays, coinsurance, and fees.","required":false},
     {"id":"policy_ack","type":"checkbox","label":"I have read and agree to the financial policy above, including the $75 late-cancellation/no-show fee.","required":true},
     {"id":"card_auth","type":"checkbox","label":"I authorize Leuk to keep a card on file and charge it for copays, coinsurance, and no-show fees per this policy.","required":true},
     {"id":"cardholder_name","type":"text","label":"Name on card","required":true},
     {"id":"signature","type":"signature","label":"Signature","required":true}
   ]}','published'),
  ('00000000-0000-4000-8000-000000010008','Medication History','Current and past medications, allergies, and pharmacy.',
   '{"blocks":[
     {"id":"intro","type":"info","label":"This helps your prescriber understand what you have tried before and avoid interactions or repeat trials.","required":false},
     {"id":"current_meds","type":"textarea","label":"Current medications, doses, and prescribing provider","required":false},
     {"id":"past_meds","type":"textarea","label":"Past psychiatric medications tried (include response/side effects if known)","required":false},
     {"id":"allergies","type":"text","label":"Medication allergies or intolerances","required":false},
     {"id":"pharmacy","type":"text","label":"Preferred pharmacy (name + location)","required":false},
     {"id":"otc","type":"radio","label":"Do you take any over-the-counter medications, vitamins, or supplements?","options":["No","Yes"],"required":true},
     {"id":"otc_detail","type":"textarea","label":"If yes, please list","required":false}
   ]}','published')
ON CONFLICT (id) DO NOTHING;
