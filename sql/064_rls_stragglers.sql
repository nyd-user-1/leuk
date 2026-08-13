-- 064 — RLS on the two tables the Neon Data API left exposed.
--
-- WHY: the project has Neon's auto-generated Data API enabled on `main`
-- (https://ep-….apirest.…/neondb/rest/v1). That endpoint is a SECOND door into
-- this database — it bypasses the app entirely and grants read/write on any
-- table WITHOUT row-level security to any Neon-Auth-authenticated caller.
-- Nothing in Leuk uses it (no references to the Data API, Neon Auth, or
-- Stack anywhere in app/ or lib/), so it is pure attack surface.
--
-- `clients`, `notes`, `appointments`, `invoices`, `messages` and `users`
-- already carry RLS for exactly this reason. Two tables were missed:
--   · note_amendments — append-only corrections to SIGNED CLINICAL NOTES (PHI)
--   · notifications   — titles/bodies that can quote client context
--
-- HOW IT PROTECTS: the app connects as `neondb_owner`, which OWNS these tables
-- and carries rolbypassrls, so enabling RLS costs the app nothing. Any other
-- role (the Data API's) hits RLS with no policy defined and sees zero rows.
-- Deliberately NO policies and NO FORCE — same shape as clients/notes.
--
-- Disabling the Data API in the Neon console is still the right primary fix;
-- this is defence in depth so a future re-enable can't quietly re-expose PHI.

ALTER TABLE note_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications   ENABLE ROW LEVEL SECURITY;
