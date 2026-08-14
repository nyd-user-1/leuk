-- 075: appointments.booked_via learns 'mcp'.
--
-- The MCP server (app/api/mcp/route.ts) lets someone find a clinician and book
-- an appointment from inside Claude. Those bookings arrive through the same
-- POST /api/book as the public booking page, so without a fourth enum value
-- they would be indistinguishable from a /book/[slug] booking and the one
-- question worth asking about a new channel — is anyone using it — would have
-- no answer in the data.
--
-- Additive and idempotent: the constraint is dropped by name and recreated with
-- the wider set. Existing rows all carry one of the original three, so nothing
-- can fail validation on the way through.
--
-- (071 remains reserved for agent_runs/agent_findings — see docs/HANDOFF-AGENTS.md.)

ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_booked_via_check;

ALTER TABLE appointments ADD CONSTRAINT appointments_booked_via_check
  CHECK (booked_via IN ('staff', 'portal', 'link', 'mcp'));

COMMENT ON COLUMN appointments.booked_via IS
  'How the appointment was created: staff (calendar), portal (client reschedule), link (public /book page), mcp (an assistant via /api/mcp).';
