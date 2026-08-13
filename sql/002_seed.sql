-- Leuk — demo seed (002). Re-runnable: fixed uuids + ON CONFLICT DO NOTHING.
-- "Today" for this dataset is 2026-07-04 (Sat); appointments span 2026-06-22 → 2026-07-17.
-- Uuid scheme: 00000000-0000-4000-8000-0000000TT0NN (TT = table code, NN = row).
--
-- Password for both demo logins is "demo". NOTE: the hash suggested in the build
-- brief ($2a$12$LQv3c1yq...) is valid bcrypt format but does NOT verify against
-- "demo", so the hash below was generated fresh (bcryptjs, cost 12) and verified.

-- ── users (01): 1 admin-practitioner, 3 practitioners, 1 portal client ────────
INSERT INTO users (id, role, name, email, password_hash, avatar_hue, phone, timezone) VALUES
  ('00000000-0000-4000-8000-000000001001','admin','Brendan Stanton','brendan@leuk.demo','$2b$12$u6VE5SYM19B.rkbXiFOR2.nuQR8hx3JTov74mALdnh9p0Y0JAYLl.','teal','+1 212 555 0140','America/New_York'),
  ('00000000-0000-4000-8000-000000001002','practitioner','Priya Raman','priya@leuk.demo','$2b$12$u6VE5SYM19B.rkbXiFOR2.nuQR8hx3JTov74mALdnh9p0Y0JAYLl.','amber','+1 212 555 0141','America/New_York'),
  ('00000000-0000-4000-8000-000000001004','practitioner','Lena Whitfield','lena@leuk.demo','$2b$12$u6VE5SYM19B.rkbXiFOR2.nuQR8hx3JTov74mALdnh9p0Y0JAYLl.','pink','+1 212 555 0143','America/New_York'),
  ('00000000-0000-4000-8000-000000001005','practitioner','Marcus Bell','marcus@leuk.demo','$2b$12$u6VE5SYM19B.rkbXiFOR2.nuQR8hx3JTov74mALdnh9p0Y0JAYLl.','blue','+1 212 555 0142','America/New_York'),
  ('00000000-0000-4000-8000-000000001003','client','Casey Morgan','casey@leuk.demo','$2b$12$u6VE5SYM19B.rkbXiFOR2.nuQR8hx3JTov74mALdnh9p0Y0JAYLl.','pink','+1 917 555 0182','America/New_York')
ON CONFLICT (id) DO NOTHING;

-- ── clients (02): 17, varied statuses/tags; Casey has the portal login ────────
INSERT INTO clients (id, user_id, first_name, last_name, dob, email, phone, address, gender, pronouns, status, tags, primary_practitioner_id) VALUES
  ('00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001003','Casey','Morgan','1994-03-18','casey@leuk.demo','+1 917 555 0182','48 Carmine St, Apt 3B, New York, NY 10014','Non-binary','they/them','active','{portal,anxiety,weekly}','00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000002002',NULL,'Jordan','Lee','1988-11-02','jordan.lee@example.com','+1 646 555 0113','210 E 14th St, New York, NY 10003','Male','he/him','active','{adhd,monthly}','00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000002003',NULL,'Sam','Whitaker','1979-06-25','sam.whitaker@example.com','+1 718 555 0177','77 Court St, Brooklyn, NY 11201','Male','he/him','active','{depression}','00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000002004',NULL,'Ava','Delgado','1991-01-09','ava.delgado@example.com','+1 347 555 0128','133 Kent Ave, Brooklyn, NY 11249','Female','she/her','active','{anxiety,superbill}','00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000002005',NULL,'Noah','Kim','2001-08-30','noah.kim@example.com','+1 929 555 0165','501 W 110th St, New York, NY 10025','Male','he/him','active','{med-management}','00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000002006',NULL,'Ruth','Okafor','1968-04-12','ruth.okafor@example.com','+1 212 555 0154','88 Greenwich St, New York, NY 10006','Female','she/her','active','{group,insomnia}','00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000002007',NULL,'Liam','Novak','1996-12-07','liam.novak@example.com','+1 646 555 0192','25-40 31st Ave, Astoria, NY 11106','Male','he/him','active','{telehealth}','00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000002008',NULL,'Maya','Patel','1985-09-21','maya.patel@example.com','+1 917 555 0136','300 Cathedral Pkwy, New York, NY 10026','Female','she/her','active','{telehealth,ptsd}','00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000002009',NULL,'Eli','Rosen','1999-02-14','eli.rosen@example.com','+1 718 555 0121',NULL,'Male','he/him','lead','{referral,intake-pending}','00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000002010',NULL,'Grace','Tanaka','1993-07-04','grace.tanaka@example.com','+1 347 555 0119',NULL,'Female','she/her','lead','{website-inquiry}','00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000002011',NULL,'Victor','Hughes','1972-10-16','victor.hughes@example.com','+1 212 555 0108','420 Riverside Dr, New York, NY 10025','Male','he/him','archived','{moved-away}','00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000002012',NULL,'Nina','Petrov','1990-05-27','nina.petrov@example.com','+1 929 555 0173',NULL,'Female','she/her','archived','{completed-care}','00000000-0000-4000-8000-000000001002'),
  -- Leads carry no address: nobody has taken an intake yet.
  ('00000000-0000-4000-8000-000000002013',NULL,'Omar','Haddad','1987-03-22','omar.haddad@example.com','+1 718 555 0146',NULL,'Male','he/him','lead','{referral,intake-pending}','00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000002014',NULL,'Tessa','Byrne','1995-11-13','tessa.byrne@example.com','+1 917 555 0158',NULL,'Female','she/her','lead','{online-booking}','00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000002015',NULL,'Dmitri','Volkov','1981-06-08','dmitri.volkov@example.com','+1 347 555 0184','55 Bay Ridge Ave, Brooklyn, NY 11220','Male','he/him','archived','{completed-care}','00000000-0000-4000-8000-000000001001'),
  ('00000000-0000-4000-8000-000000002016',NULL,'Aisha','Rahman','1992-09-30','aisha.rahman@example.com','+1 929 555 0167','37-15 74th St, Jackson Heights, NY 11372','Female','she/her','archived','{moved-away}','00000000-0000-4000-8000-000000001002'),
  ('00000000-0000-4000-8000-000000002017',NULL,'Colin','Fitzgerald','1975-01-19','colin.fitzgerald@example.com','+1 212 555 0193','190 Bleecker St, New York, NY 10012','Male','he/him','archived','{completed-care,superbill}','00000000-0000-4000-8000-000000001001')
ON CONFLICT (id) DO NOTHING;

-- ── services (03) ─────────────────────────────────────────────────────────────
INSERT INTO services (id, name, duration_min, price_cents, color, telehealth, active) VALUES
  ('00000000-0000-4000-8000-000000003001','Initial Evaluation',60,25000,'teal',false,true),
  ('00000000-0000-4000-8000-000000003002','Follow-up',30,12500,'blue',false,true),
  ('00000000-0000-4000-8000-000000003003','Therapy',45,17500,'amber',false,true),
  ('00000000-0000-4000-8000-000000003004','Telehealth Check-in',30,7500,'pink',true,true),
  ('00000000-0000-4000-8000-000000003005','Group Session',90,6000,'purple',false,true)
ON CONFLICT (id) DO NOTHING;

-- ── locations (04) ────────────────────────────────────────────────────────────
INSERT INTO locations (id, name, address, kind) VALUES
  ('00000000-0000-4000-8000-000000004001','Union Square Office','31 E 17th St, Suite 402, New York, NY 10003','office'),
  ('00000000-0000-4000-8000-000000004002','Telehealth',NULL,'telehealth')
ON CONFLICT (id) DO NOTHING;

-- ── availability (05): M-F 9-5, both practitioners ────────────────────────────
INSERT INTO availability (id, practitioner_id, weekday, start_time, end_time) VALUES
  ('00000000-0000-4000-8000-000000005001','00000000-0000-4000-8000-000000001001',1,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005002','00000000-0000-4000-8000-000000001001',2,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005003','00000000-0000-4000-8000-000000001001',3,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005004','00000000-0000-4000-8000-000000001001',4,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005005','00000000-0000-4000-8000-000000001001',5,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005006','00000000-0000-4000-8000-000000001002',1,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005007','00000000-0000-4000-8000-000000001002',2,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005008','00000000-0000-4000-8000-000000001002',3,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005009','00000000-0000-4000-8000-000000001002',4,'09:00','17:00'),
  ('00000000-0000-4000-8000-000000005010','00000000-0000-4000-8000-000000001002',5,'09:00','17:00')
ON CONFLICT (id) DO NOTHING;

-- ── appointments (06): 25 across 2026-06-22 → 2026-07-17 (EDT, -04) ───────────
INSERT INTO appointments (id, client_id, practitioner_id, service_id, location_id, starts_at, ends_at, status, video_room, booked_via, notes_brief, cancelled_reason) VALUES
  -- two weeks ago (completed)
  ('00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000004001','2026-06-22 09:00-04','2026-06-22 09:30-04','completed',NULL,'staff','Med check — stimulant response',NULL),
  ('00000000-0000-4000-8000-000000006002','00000000-0000-4000-8000-000000002003','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000004001','2026-06-22 10:00-04','2026-06-22 10:45-04','completed',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006003','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003004','00000000-0000-4000-8000-000000004002','2026-06-23 11:00-04','2026-06-23 11:20-04','completed','lim-ac01','portal','Check-in re: sertraline titration',NULL),
  ('00000000-0000-4000-8000-000000006004','00000000-0000-4000-8000-000000002009','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000004001','2026-06-24 14:00-04','2026-06-24 15:00-04','no_show',NULL,'link','New patient — referral from Dr. Feld',NULL),
  ('00000000-0000-4000-8000-000000006005','00000000-0000-4000-8000-000000002005','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000004001','2026-06-25 09:30-04','2026-06-25 10:00-04','completed',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006006','00000000-0000-4000-8000-000000002006','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003005','00000000-0000-4000-8000-000000004001','2026-06-26 13:00-04','2026-06-26 14:30-04','completed',NULL,'staff','Insomnia skills group, week 4',NULL),
  -- this week, Mon Jun 29 – Fri Jul 3 (past relative to Sat Jul 4)
  ('00000000-0000-4000-8000-000000006007','00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000004001','2026-06-29 09:00-04','2026-06-29 09:45-04','completed',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006008','00000000-0000-4000-8000-000000002006','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000004001','2026-06-29 10:00-04','2026-06-29 10:30-04','completed',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006009','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000004001','2026-06-30 11:00-04','2026-06-30 11:30-04','completed',NULL,'portal',NULL,NULL),
  ('00000000-0000-4000-8000-000000006010','00000000-0000-4000-8000-000000002007','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000004001','2026-06-30 15:00-04','2026-06-30 15:45-04','completed',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006011','00000000-0000-4000-8000-000000002008','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003004','00000000-0000-4000-8000-000000004002','2026-07-01 09:00-04','2026-07-01 09:20-04','completed','lim-ac02','portal','Recorded with consent — scribe demo',NULL),
  ('00000000-0000-4000-8000-000000006012','00000000-0000-4000-8000-000000002010','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000004001','2026-07-01 13:00-04','2026-07-01 14:00-04','cancelled',NULL,'link',NULL,'Client requested reschedule'),
  ('00000000-0000-4000-8000-000000006013','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000004001','2026-07-02 10:00-04','2026-07-02 10:45-04','completed',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006014','00000000-0000-4000-8000-000000002005','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003004','00000000-0000-4000-8000-000000004002','2026-07-02 14:00-04','2026-07-02 14:20-04','completed','lim-ac03','staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006015','00000000-0000-4000-8000-000000002003','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000004001','2026-07-03 09:30-04','2026-07-03 10:00-04','completed',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006016','00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000004001','2026-07-03 11:00-04','2026-07-03 11:30-04','cancelled',NULL,'staff',NULL,'Practice closed early for holiday weekend'),
  -- next week, Jul 6-10 (upcoming)
  ('00000000-0000-4000-8000-000000006017','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000004001','2026-07-06 09:00-04','2026-07-06 09:45-04','confirmed',NULL,'portal',NULL,NULL),
  ('00000000-0000-4000-8000-000000006018','00000000-0000-4000-8000-000000002009','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000004001','2026-07-06 11:00-04','2026-07-06 12:00-04','confirmed',NULL,'link','Rescheduled after 6/24 no-show',NULL),
  ('00000000-0000-4000-8000-000000006019','00000000-0000-4000-8000-000000002006','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000004001','2026-07-07 10:00-04','2026-07-07 10:30-04','confirmed',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006020','00000000-0000-4000-8000-000000002007','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003004','00000000-0000-4000-8000-000000004002','2026-07-08 14:00-04','2026-07-08 14:20-04','scheduled','lim-ac04','portal',NULL,NULL),
  ('00000000-0000-4000-8000-000000006021','00000000-0000-4000-8000-000000002008','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003003','00000000-0000-4000-8000-000000004001','2026-07-09 09:00-04','2026-07-09 09:45-04','scheduled',NULL,'staff',NULL,NULL),
  ('00000000-0000-4000-8000-000000006022','00000000-0000-4000-8000-000000002005','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003005','00000000-0000-4000-8000-000000004001','2026-07-10 13:00-04','2026-07-10 14:30-04','scheduled',NULL,'staff','Insomnia skills group, week 6',NULL),
  -- week after, Jul 13-17
  ('00000000-0000-4000-8000-000000006023','00000000-0000-4000-8000-000000002010','00000000-0000-4000-8000-000000001002','00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000004001','2026-07-13 10:00-04','2026-07-13 11:00-04','scheduled',NULL,'link',NULL,NULL),
  ('00000000-0000-4000-8000-000000006024','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003004','00000000-0000-4000-8000-000000004002','2026-07-15 11:00-04','2026-07-15 11:20-04','scheduled','lim-ac05','portal',NULL,NULL),
  ('00000000-0000-4000-8000-000000006025','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000003002','00000000-0000-4000-8000-000000004001','2026-07-17 09:00-04','2026-07-17 09:30-04','scheduled',NULL,'staff',NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── note_templates (07) ───────────────────────────────────────────────────────
INSERT INTO note_templates (id, name, template, body_md, is_builtin) VALUES
  ('00000000-0000-4000-8000-000000007001','SOAP Note','soap',E'## Subjective\n\n\n## Objective\n\n\n## Assessment\n\n\n## Plan\n',true),
  ('00000000-0000-4000-8000-000000007002','DAP Note','dap',E'## Data\n\n\n## Assessment\n\n\n## Plan\n',true),
  ('00000000-0000-4000-8000-000000007003','Progress Note','progress',E'## Presenting Concerns\n\n\n## Interventions\n\n\n## Response\n\n\n## Plan\n',true)
ON CONFLICT (id) DO NOTHING;

-- ── notes (08): 8, mixed drafts + signed ──────────────────────────────────────
INSERT INTO notes (id, client_id, appointment_id, author_id, template, title, body_md, status, signed_at) VALUES
  ('00000000-0000-4000-8000-000000008001','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000006001','00000000-0000-4000-8000-000000001001','soap','Follow-up 6/22 — med check',E'## Subjective\nReports improved focus at work on methylphenidate ER 27 mg; appetite mildly reduced, sleep intact.\n\n## Objective\nAlert, euthymic. HR 74. No abnormal movements.\n\n## Assessment\nADHD, combined type — responding to current dose. Tolerating well.\n\n## Plan\nContinue 27 mg daily. Recheck in 4 weeks. Labs not indicated.','signed','2026-06-22 09:40-04'),
  ('00000000-0000-4000-8000-000000008002','00000000-0000-4000-8000-000000002003','00000000-0000-4000-8000-000000006002','00000000-0000-4000-8000-000000001002','dap','Therapy 6/22',E'## Data\nDiscussed conflict avoidance at work; completed thought record on Sunday-night dread.\n\n## Assessment\nMDD, moderate — engagement good, mood slowly lifting (PHQ-9 trending down).\n\n## Plan\nBehavioral activation homework; continue weekly.','signed','2026-06-22 11:00-04'),
  ('00000000-0000-4000-8000-000000008003','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000006003','00000000-0000-4000-8000-000000001001','soap','Telehealth check-in 6/23',E'## Subjective\nWeek 3 on sertraline 50 mg. Mild nausea resolved; anxiety attacks down from daily to ~2/week.\n\n## Objective\nSeen via video. Appropriately groomed, good eye contact, speech normal.\n\n## Assessment\nGAD — early response at 50 mg.\n\n## Plan\nIncrease to 75 mg daily. PHQ-9 sent via portal. Follow up 7/6.','signed','2026-06-23 11:35-04'),
  ('00000000-0000-4000-8000-000000008004','00000000-0000-4000-8000-000000002005','00000000-0000-4000-8000-000000006005','00000000-0000-4000-8000-000000001002','progress','Follow-up 6/25',E'## Presenting Concerns\nIntrusive worry before exams; using PRN hydroxyzine ~1x/week.\n\n## Interventions\nReviewed sleep hygiene; brief exposure planning for presentation anxiety.\n\n## Response\nReceptive; agreed to reduce pre-exam caffeine.\n\n## Plan\nContinue current regimen; revisit PRN use next visit.','signed','2026-06-25 10:15-04'),
  ('00000000-0000-4000-8000-000000008005','00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000006007','00000000-0000-4000-8000-000000001001','soap','Therapy 6/29',E'## Subjective\nPanic symptoms recurred on subway Friday; used paced breathing with partial relief.\n\n## Objective\nMildly anxious affect, otherwise unremarkable.\n\n## Assessment\nPanic disorder — interoceptive avoidance re-emerging.\n\n## Plan\nResume interoceptive exposure ladder; consider propranolol PRN if no improvement.','draft',NULL),
  ('00000000-0000-4000-8000-000000008006','00000000-0000-4000-8000-000000002007','00000000-0000-4000-8000-000000006010','00000000-0000-4000-8000-000000001002','dap','Therapy 6/30',E'## Data\nExplored move-related isolation; client joined climbing gym, attended twice.\n\n## Assessment\nAdjustment disorder w/ depressed mood — improving behavioral engagement.\n\n## Plan\nMaintain activity scheduling; telehealth check-in next week.','draft',NULL),
  ('00000000-0000-4000-8000-000000008007','00000000-0000-4000-8000-000000002008','00000000-0000-4000-8000-000000006011','00000000-0000-4000-8000-000000001001','soap','Telehealth check-in 7/1',E'## Subjective\nNightmares down to 1-2/week on prazosin 2 mg; daytime hypervigilance persists in crowds.\n\n## Objective\nVideo visit. Calm, linear, future-oriented.\n\n## Assessment\nPTSD — partial response; sleep markedly better.\n\n## Plan\nTitrate prazosin to 3 mg qHS; continue weekly trauma-focused work with therapist.','signed','2026-07-01 09:35-04'),
  ('00000000-0000-4000-8000-000000008008','00000000-0000-4000-8000-000000002006',NULL,'00000000-0000-4000-8000-000000001002','free','Care coordination — PCP call',E'Spoke with Dr. Adeyemi (PCP) re: trazodone/lisinopril timing; no interaction concerns. Will share insomnia group progress summary after week 6.','draft',NULL)
ON CONFLICT (id) DO NOTHING;

-- ── transcripts (09): 1 ready transcript on the 7/1 telehealth visit ──────────
INSERT INTO transcripts (id, appointment_id, segments, summary_md, status) VALUES
  ('00000000-0000-4000-8000-000000009001','00000000-0000-4000-8000-000000006011',
   '[{"t0":0,"t1":6,"speaker":"practitioner","text":"Good morning, Maya. How has sleep been since we raised the prazosin?"},
     {"t0":6,"t1":15,"speaker":"client","text":"Honestly, a lot better. Maybe one nightmare this week instead of every night."},
     {"t0":15,"t1":22,"speaker":"practitioner","text":"That is real progress. Any dizziness in the morning or when you stand up?"},
     {"t0":22,"t1":27,"speaker":"client","text":"A little lightheaded the first two days, then it went away."},
     {"t0":27,"t1":38,"speaker":"practitioner","text":"Good. Let us go up to three milligrams at bedtime and keep everything else the same. Crowds still hard?"},
     {"t0":38,"t1":46,"speaker":"client","text":"Yeah, the subway at rush hour is still rough. I am using the grounding stuff, it helps some."}]',
   E'## Visit summary\nSleep markedly improved on prazosin 2 mg (nightmares ~1/wk, transient orthostatic lightheadedness resolved). Daytime hypervigilance in crowds persists; grounding skills partially effective.\n\n## Plan\n- Increase prazosin to 3 mg qHS\n- Continue weekly trauma-focused therapy\n- Follow up 7/9','ready')
ON CONFLICT (id) DO NOTHING;

-- ── forms (10): Intake + PHQ-9, spec block shape ──────────────────────────────
INSERT INTO forms (id, title, description, schema, status) VALUES
  ('00000000-0000-4000-8000-000000010001','New Client Intake','Demographics, history, and consent — please complete before your first visit.',
   '{"blocks":[
     {"id":"intro","type":"info","label":"Welcome to Leuk Psychiatry. Your answers are confidential and reviewed only by your care team.","required":false},
     {"id":"full_name","type":"text","label":"Full legal name","required":true},
     {"id":"dob","type":"date","label":"Date of birth","required":true},
     {"id":"gender","type":"select","label":"Gender","options":["Female","Male","Non-binary","Prefer to self-describe","Prefer not to say"],"required":false},
     {"id":"pronouns","type":"text","label":"Pronouns","required":false},
     {"id":"reason","type":"textarea","label":"What brings you in? What would you like help with?","required":true},
     {"id":"psych_history","type":"textarea","label":"Previous psychiatric or therapy care (providers, diagnoses, hospitalizations)","required":false},
     {"id":"medications","type":"textarea","label":"Current medications and doses (including supplements)","required":false},
     {"id":"allergies","type":"text","label":"Medication allergies","required":false},
     {"id":"safety","type":"radio","label":"In the past month, have you had thoughts of harming yourself?","options":["No","Yes","Prefer to discuss in session"],"required":true},
     {"id":"consent","type":"checkbox","label":"I consent to evaluation and treatment and have reviewed the practice policies and privacy notice.","required":true},
     {"id":"signature","type":"signature","label":"Signature","required":true}
   ]}','published'),
  ('00000000-0000-4000-8000-000000010002','PHQ-9 Depression Screen','Over the last 2 weeks, how often have you been bothered by the following problems?',
   '{"blocks":[
     {"id":"scoring","type":"info","label":"Answer each item 0-3: 0 = Not at all, 1 = Several days, 2 = More than half the days, 3 = Nearly every day. Total score: 0-4 minimal, 5-9 mild, 10-14 moderate, 15-19 moderately severe, 20-27 severe.","required":false},
     {"id":"q1","type":"scale","label":"Little interest or pleasure in doing things","options":["0","1","2","3"],"required":true},
     {"id":"q2","type":"scale","label":"Feeling down, depressed, or hopeless","options":["0","1","2","3"],"required":true},
     {"id":"q3","type":"scale","label":"Trouble falling or staying asleep, or sleeping too much","options":["0","1","2","3"],"required":true},
     {"id":"q4","type":"scale","label":"Feeling tired or having little energy","options":["0","1","2","3"],"required":true},
     {"id":"q5","type":"scale","label":"Poor appetite or overeating","options":["0","1","2","3"],"required":true},
     {"id":"q6","type":"scale","label":"Feeling bad about yourself — or that you are a failure or have let yourself or your family down","options":["0","1","2","3"],"required":true},
     {"id":"q7","type":"scale","label":"Trouble concentrating on things, such as reading the newspaper or watching television","options":["0","1","2","3"],"required":true},
     {"id":"q8","type":"scale","label":"Moving or speaking so slowly that other people could have noticed — or the opposite, being so fidgety or restless that you have been moving around a lot more than usual","options":["0","1","2","3"],"required":true},
     {"id":"q9","type":"scale","label":"Thoughts that you would be better off dead or of hurting yourself in some way","options":["0","1","2","3"],"required":true}
   ]}','published')
ON CONFLICT (id) DO NOTHING;

-- ── form_responses (11): Casey submitted PHQ-9; intake sent to lead Eli ───────
INSERT INTO form_responses (id, form_id, client_id, answers, status, submitted_at) VALUES
  ('00000000-0000-4000-8000-000000011001','00000000-0000-4000-8000-000000010002','00000000-0000-4000-8000-000000002001',
   '{"q1":1,"q2":1,"q3":2,"q4":1,"q5":0,"q6":1,"q7":1,"q8":0,"q9":0}','submitted','2026-06-24 19:42-04'),
  ('00000000-0000-4000-8000-000000011002','00000000-0000-4000-8000-000000010001','00000000-0000-4000-8000-000000002009',
   '{}','sent',NULL)
ON CONFLICT (id) DO NOTHING;

-- ── payers (12) + insurance_policies (13): coverage for half the clients ──────
INSERT INTO payers (id, name, payer_code) VALUES
  ('00000000-0000-4000-8000-000000012001','Aetna','60054'),
  ('00000000-0000-4000-8000-000000012002','UnitedHealthcare','87726'),
  ('00000000-0000-4000-8000-000000012003','Cigna','62308')
ON CONFLICT (id) DO NOTHING;

INSERT INTO insurance_policies (id, client_id, payer_id, member_id, group_id, kind, status, copay_cents) VALUES
  ('00000000-0000-4000-8000-000000013001','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000012001','W442918203','GRP-88410','primary','verified',2500),
  ('00000000-0000-4000-8000-000000013002','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000012003','U01772345',NULL,'secondary','unverified',NULL),
  ('00000000-0000-4000-8000-000000013003','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000012002','918274655','GRP-10275','primary','verified',3000),
  ('00000000-0000-4000-8000-000000013004','00000000-0000-4000-8000-000000002003','00000000-0000-4000-8000-000000012003','U88320117','GRP-55201','primary','unverified',NULL),
  ('00000000-0000-4000-8000-000000013005','00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000012001','W105583920','GRP-88410','primary','verified',2000),
  ('00000000-0000-4000-8000-000000013006','00000000-0000-4000-8000-000000002005','00000000-0000-4000-8000-000000012002','904415872',NULL,'primary','unverified',2500),
  ('00000000-0000-4000-8000-000000013007','00000000-0000-4000-8000-000000002006','00000000-0000-4000-8000-000000012003','U55418290','GRP-31007','primary','inactive',NULL)
ON CONFLICT (id) DO NOTHING;

-- ── invoices (14): INV-2026-0001…0010, mixed lifecycle ────────────────────────
INSERT INTO invoices (id, number, client_id, appointment_id, status, issued_on, due_on, subtotal_cents, tax_cents, total_cents, stripe_checkout_id) VALUES
  ('00000000-0000-4000-8000-000000014001','INV-2026-0001','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000006001','paid','2026-06-22','2026-07-06',12500,0,12500,'cs_test_demo_0001'),
  ('00000000-0000-4000-8000-000000014002','INV-2026-0002','00000000-0000-4000-8000-000000002003','00000000-0000-4000-8000-000000006002','paid','2026-06-22','2026-07-06',17500,0,17500,'cs_test_demo_0002'),
  ('00000000-0000-4000-8000-000000014003','INV-2026-0003','00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000006007','paid','2026-06-29','2026-07-13',17500,0,17500,NULL),
  ('00000000-0000-4000-8000-000000014004','INV-2026-0004','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000006009','sent','2026-07-01','2026-07-15',12500,0,12500,NULL),
  ('00000000-0000-4000-8000-000000014005','INV-2026-0005','00000000-0000-4000-8000-000000002005','00000000-0000-4000-8000-000000006005','overdue','2026-06-25','2026-07-02',12500,0,12500,NULL),
  ('00000000-0000-4000-8000-000000014006','INV-2026-0006','00000000-0000-4000-8000-000000002006','00000000-0000-4000-8000-000000006008','paid','2026-06-29','2026-07-13',12500,0,12500,'cs_test_demo_0006'),
  ('00000000-0000-4000-8000-000000014007','INV-2026-0007','00000000-0000-4000-8000-000000002007','00000000-0000-4000-8000-000000006010','sent','2026-07-01','2026-07-15',17500,0,17500,NULL),
  ('00000000-0000-4000-8000-000000014008','INV-2026-0008','00000000-0000-4000-8000-000000002008',NULL,'overdue','2026-06-10','2026-06-24',17500,0,17500,NULL),
  ('00000000-0000-4000-8000-000000014009','INV-2026-0009','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000006013','draft','2026-07-03',NULL,25000,0,25000,NULL),
  ('00000000-0000-4000-8000-000000014010','INV-2026-0010','00000000-0000-4000-8000-000000002011',NULL,'void','2026-05-12','2026-05-26',25000,0,25000,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── invoice_items (15) ────────────────────────────────────────────────────────
INSERT INTO invoice_items (id, invoice_id, description, qty, unit_cents, amount_cents) VALUES
  ('00000000-0000-4000-8000-000000015001','00000000-0000-4000-8000-000000014001','Follow-up (30 min) — 6/22/2026',1,12500,12500),
  ('00000000-0000-4000-8000-000000015002','00000000-0000-4000-8000-000000014002','Therapy (45 min) — 6/22/2026',1,17500,17500),
  ('00000000-0000-4000-8000-000000015003','00000000-0000-4000-8000-000000014003','Therapy (45 min) — 6/29/2026',1,17500,17500),
  ('00000000-0000-4000-8000-000000015004','00000000-0000-4000-8000-000000014004','Follow-up (30 min) — 6/30/2026',1,12500,12500),
  ('00000000-0000-4000-8000-000000015005','00000000-0000-4000-8000-000000014005','Follow-up (30 min) — 6/25/2026',1,12500,12500),
  ('00000000-0000-4000-8000-000000015006','00000000-0000-4000-8000-000000014006','Follow-up (30 min) — 6/29/2026',1,12500,12500),
  ('00000000-0000-4000-8000-000000015007','00000000-0000-4000-8000-000000014007','Therapy (45 min) — 6/30/2026',1,17500,17500),
  ('00000000-0000-4000-8000-000000015008','00000000-0000-4000-8000-000000014008','Telehealth Check-in (20 min) — 6/3/2026',1,7500,7500),
  ('00000000-0000-4000-8000-000000015009','00000000-0000-4000-8000-000000014008','Therapy (45 min, sliding scale) — 6/9/2026',1,10000,10000),
  ('00000000-0000-4000-8000-000000015010','00000000-0000-4000-8000-000000014009','Therapy (45 min) — 7/2/2026',1,17500,17500),
  ('00000000-0000-4000-8000-000000015011','00000000-0000-4000-8000-000000014009','Telehealth Check-in (20 min) — 7/2/2026',1,7500,7500),
  ('00000000-0000-4000-8000-000000015012','00000000-0000-4000-8000-000000014010','Initial Evaluation (60 min) — 5/12/2026',1,25000,25000)
ON CONFLICT (id) DO NOTHING;

-- ── payments (16) ─────────────────────────────────────────────────────────────
INSERT INTO payments (id, invoice_id, amount_cents, method, stripe_payment_intent, paid_at) VALUES
  ('00000000-0000-4000-8000-000000016001','00000000-0000-4000-8000-000000014001',12500,'card','pi_demo_0001','2026-06-23 08:12-04'),
  ('00000000-0000-4000-8000-000000016002','00000000-0000-4000-8000-000000014002',17500,'card','pi_demo_0002','2026-06-24 17:31-04'),
  ('00000000-0000-4000-8000-000000016003','00000000-0000-4000-8000-000000014003',17500,'insurance',NULL,'2026-07-02 10:00-04'),
  ('00000000-0000-4000-8000-000000016004','00000000-0000-4000-8000-000000014006',12500,'card','pi_demo_0006','2026-06-30 12:05-04'),
  ('00000000-0000-4000-8000-000000016005','00000000-0000-4000-8000-000000014005',5000,'cash',NULL,'2026-07-01 09:00-04')
ON CONFLICT (id) DO NOTHING;

-- ── threads (17) + messages (18): secure messaging ────────────────────────────
INSERT INTO threads (id, client_id, subject, status, last_message_at) VALUES
  ('00000000-0000-4000-8000-000000017001','00000000-0000-4000-8000-000000002001','Sertraline refill','open','2026-07-02 14:38-04'),
  ('00000000-0000-4000-8000-000000017002','00000000-0000-4000-8000-000000002001','Rescheduling next week','closed','2026-06-27 10:12-04'),
  ('00000000-0000-4000-8000-000000017003','00000000-0000-4000-8000-000000002004','Superbill for June sessions','open','2026-07-03 16:20-04'),
  ('00000000-0000-4000-8000-000000017004','00000000-0000-4000-8000-000000002009','Intake paperwork reminder','open','2026-07-01 09:05-04')
ON CONFLICT (id) DO NOTHING;

INSERT INTO messages (id, thread_id, sender_id, body, read_at, created_at) VALUES
  ('00000000-0000-4000-8000-000000018001','00000000-0000-4000-8000-000000017001','00000000-0000-4000-8000-000000001003','Hi Dr. Stanton — my pharmacy says I have no refills left on the sertraline and I take my last dose Sunday. Could you send a new script to the CVS on Hudson St?','2026-07-02 09:15-04','2026-07-02 08:47-04'),
  ('00000000-0000-4000-8000-000000018002','00000000-0000-4000-8000-000000017001','00000000-0000-4000-8000-000000001001','Good catch — I just sent 75 mg (the new dose we discussed) with 2 refills to CVS Hudson St. It should be ready this afternoon. See you Monday.','2026-07-02 14:40-04','2026-07-02 14:32-04'),
  ('00000000-0000-4000-8000-000000018003','00000000-0000-4000-8000-000000017001','00000000-0000-4000-8000-000000001003','Got it, thank you!',NULL,'2026-07-02 14:38-04'),
  ('00000000-0000-4000-8000-000000018004','00000000-0000-4000-8000-000000017002','00000000-0000-4000-8000-000000001003','Is there any chance we could move next week''s session earlier in the day? Something came up at work Monday afternoon.','2026-06-26 15:20-04','2026-06-26 14:55-04'),
  ('00000000-0000-4000-8000-000000018005','00000000-0000-4000-8000-000000017002','00000000-0000-4000-8000-000000001001','Done — moved you to Monday 7/6 at 9:00 AM at the office. You will get a confirmation from the portal.','2026-06-27 10:15-04','2026-06-27 10:12-04'),
  ('00000000-0000-4000-8000-000000018006','00000000-0000-4000-8000-000000017003','00000000-0000-4000-8000-000000001001','Hi Ava — your June superbill is attached under Records > Documents. It includes the 6/29 session; submit it to Aetna with your member ID and let us know if they need anything else.',NULL,'2026-07-03 16:20-04'),
  ('00000000-0000-4000-8000-000000018007','00000000-0000-4000-8000-000000017004','00000000-0000-4000-8000-000000001002','Hi Eli — looking forward to meeting you on Monday 7/6 at 11:00 AM. The intake form in your invite takes about 10 minutes; completing it beforehand lets us spend the whole hour on you.',NULL,'2026-07-01 09:05-04')
ON CONFLICT (id) DO NOTHING;

-- ── files (19) ────────────────────────────────────────────────────────────────
INSERT INTO files (id, client_id, uploader_id, name, mime, size_bytes, url, kind) VALUES
  ('00000000-0000-4000-8000-000000019001','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001003','insurance-card-front.jpg','image/jpeg',482113,'/uploads/insurance-card-front.jpg','upload'),
  ('00000000-0000-4000-8000-000000019002','00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001001','phq9-2026-06-24.pdf','application/pdf',88220,'/uploads/phq9-2026-06-24.pdf','form_pdf'),
  ('00000000-0000-4000-8000-000000019003','00000000-0000-4000-8000-000000002004','00000000-0000-4000-8000-000000001001','superbill-june-2026.pdf','application/pdf',104330,'/uploads/superbill-june-2026.pdf','superbill'),
  ('00000000-0000-4000-8000-000000019004','00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000001001','prior-records-dr-feld.pdf','application/pdf',1204551,'/uploads/prior-records-dr-feld.pdf','upload')
ON CONFLICT (id) DO NOTHING;

-- ── audit_events: a handful, with fixed ids so the seed is re-runnable ────────
INSERT INTO audit_events (id, actor_id, action, entity, entity_id, meta, at) VALUES
  (1,'00000000-0000-4000-8000-000000001001','auth.login','user','00000000-0000-4000-8000-000000001001','{"ip":"203.0.113.14"}','2026-07-01 08:55-04'),
  (2,'00000000-0000-4000-8000-000000001001','client.view','client','00000000-0000-4000-8000-000000002008','{"tab":"documentation"}','2026-07-01 08:58-04'),
  (3,'00000000-0000-4000-8000-000000001001','note.sign','note','00000000-0000-4000-8000-000000008007','{"template":"soap"}','2026-07-01 09:35-04'),
  (4,'00000000-0000-4000-8000-000000001003','form.submit','form_response','00000000-0000-4000-8000-000000011001','{"form":"PHQ-9 Depression Screen","score":7}','2026-06-24 19:42-04'),
  (5,'00000000-0000-4000-8000-000000001001','invoice.send','invoice','00000000-0000-4000-8000-000000014004','{"number":"INV-2026-0004","total_cents":12500}','2026-07-01 10:20-04'),
  (6,'00000000-0000-4000-8000-000000001002','message.send','message','00000000-0000-4000-8000-000000018007','{"thread":"00000000-0000-4000-8000-000000017004"}','2026-07-01 09:05-04')
ON CONFLICT (id) DO NOTHING;
SELECT setval('audit_events_id_seq', GREATEST((SELECT COALESCE(MAX(id),1) FROM audit_events), 1));
