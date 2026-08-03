ALTER TABLE tool_access
  ADD COLUMN gateway_generation uuid;

ALTER TABLE tool_gateway_tickets
  ADD COLUMN assignment_generation uuid;
ALTER TABLE tool_gateway_sessions
  ADD COLUMN assignment_generation uuid;
