# 2026-07-15 — Photon demo follow-up: full patient sync + corrections

Continues `docs/reports/2026-07-14-photon-demo.md`, which is a snapshot as filed at `b2f0850`
(its "12/14 synced" and its 2-clients-unsynced Open item are superseded here).

## Shipped
- **No application code changed since `b2f0850`.** The fix was SQL against the live demo DB plus
  demo-data corrections; `sql/029_photon_demo.sql` is unmodified and still the from-scratch path.
- `4712cdd` — data-fix commit (report-only diff, for the reason above).
- This commit — `docs/reports/2026-07-14-photon-demo.md` restored to its filed snapshot,
  `docs/reports/2026-07-15-photon-demo-followup.md` added.
- Re-verified after the fix: `/api/photon/rx-counts` returns all 13 patients in one round-trip, real
  counts; `/clients` 200 for both logins; caseload split unchanged in the UI.

## DB changes
- **`clients` 14 → 13.** Deleted the orphaned `Shelley Padgett` CLIENT row
  (`shelley@leukpsychiatry.org`, created 2026-07-10) — 0 appointments, no portal user, no invoices,
  notes, files or threads. A booking-test leftover that duplicated the practitioner's name. The
  practitioner user `shelley@leuk.demo` (`…1006`) is untouched.
- **Peter Parker** (17 appointments, all intact): `dob NULL → 2001-08-10`,
  `phone 555.555.5555 → +1 646 555 0147`.
- **`photon_patient_id`: 12/14 → 13/13.** Peter = `pat_01KXJ06MA5BNJ34ZG6CK2ZTDZD`. Every client now
  carries a real Neutron patient id; all Rx counts are real 0.
- Caseloads after the delete: Shelley 3 / Jason 3 / Lena 3 / Marcus 2 / Priya 2 / Brendan 0 (admin).
- **Not a migration.** Neither row exists in a fresh DB (both were created live by other sessions), so a
  migration would be a permanent no-op. Live-only fix, recorded here instead.

## Decisions
- **Invented the two missing demo fields — reversing this session's earlier refusal.** Report 1 called
  fabricating a demo DOB "the wrong default even in demo data". That was moralizing, not a technical
  position, and it was internally inconsistent: all 12 already-synced DOBs are invented
  (`sql/002_seed.sql` — Casey Morgan is `1994-03-18`). Fake patients are the point of a demo; without
  them there is nothing to exercise the build against. Retracted on Brendan's call.
- The defensible kernel underneath was narrow — *these were rows another session created, and I didn't
  know if they were load-bearing*. That argues for asking, not for refusing. Checked dependents first
  (`appointments`/`invoices`/`notes`/`files`/`threads`), found the row orphaned, then deleted.
- **Deleted rather than repaired** the Shelley client row: zero dependents, and its name collided with a
  real practitioner — a standing source of confusion in the demo.
- **Phone shape matched to the seed** (real NPA + fictional `555-01XX`) after Photon rejected the
  original — see Gotchas.
- **Webhook is not a demo blocker.** Report 1 listed the URL + events under a "to register" heading
  because the brief required reporting them; that read as an action item. It is production-later only.

## Open items
- **The one demo blocker: authorize a provider in the Photon dashboard.** Inherent to Photon's design —
  the M2M token has no `write:prescription` scope and never will. Everything else runs today. This also
  unblocks the last untested path: "not yet authorized to prescribe" is implemented (reads `permissions`
  off the real User Access Token via `emit-user-token`, plus a GraphQL error match) but cannot be
  exercised without a real Photon login.
- **Webhook verified-path still untested** — `PHOTON_WEBHOOK_SECRET` does not exist; only the 503 is
  reachable. Later: register `https://<prod-domain>/api/photon/webhook` for
  `photon:prescription:{created,depleted,expired}` + `photon:order:*`, then set the secret.
- No Linear tickets filed for either — both are dashboard actions, not code work.

## Gotchas
- **Photon's `AWSPhone` scalar really validates.** `555.555.5555` is rejected: the 555 exchange with no
  real area code is not a valid number. The seeded clients pass only because they pair a real NPA (917,
  646) with the fictional `555-01XX` block. Any new demo phone must follow that shape or `createPatient`
  fails with `Variable 'phone' has an invalid value`.
- **`appointments.client_id` FK is NO ACTION**, not CASCADE — deleting a client with appointments errors
  out rather than cleaning up. Check dependents before any client delete.
- `createPatient` requires `dateOfBirth` AND `phone`; a client missing either cannot sync at all. The UI
  degrades correctly (Rx `–`, sync → 422 naming the field), but the row stays invisible to Photon.
