ALTER TABLE tool_access
  ADD COLUMN n8n_invite_path_ciphertext text;

ALTER TABLE tool_access
  ADD CONSTRAINT tool_access_n8n_invite_ciphertext
    CHECK (
      n8n_invite_path_ciphertext IS NULL
      OR (
        tool_type = 'n8n'
        AND length(n8n_invite_path_ciphertext) BETWEEN 16 AND 6000
      )
    );

ALTER TABLE tool_gateway_tickets
  ADD COLUMN redirect_path_ciphertext text;

ALTER TABLE tool_gateway_tickets
  ADD CONSTRAINT tool_gateway_ticket_redirect_ciphertext
    CHECK (
      redirect_path_ciphertext IS NULL
      OR (
        subject_role = 'student'
        AND length(redirect_path_ciphertext) BETWEEN 16 AND 6000
      )
    );
