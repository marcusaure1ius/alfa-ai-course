UPDATE tool_access
SET gateway_generation = gen_random_uuid()
WHERE tool_type = 'n8n'
  AND n8n_identity_id IS NOT NULL
  AND gateway_generation IS NULL;

ALTER TABLE tool_access
  ADD CONSTRAINT tool_access_n8n_gateway_generation
    CHECK (
      tool_type <> 'n8n'
      OR n8n_identity_id IS NULL
      OR gateway_generation IS NOT NULL
    );

ALTER TABLE tool_gateway_tickets
  ADD CONSTRAINT tool_gateway_ticket_student_generation
    CHECK (subject_role = 'admin' OR assignment_generation IS NOT NULL)
    NOT VALID;
ALTER TABLE tool_gateway_sessions
  ADD CONSTRAINT tool_gateway_session_student_generation
    CHECK (subject_role = 'admin' OR assignment_generation IS NOT NULL)
    NOT VALID;
