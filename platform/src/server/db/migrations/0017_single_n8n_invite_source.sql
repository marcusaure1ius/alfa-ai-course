ALTER TABLE tool_gateway_tickets
  DROP CONSTRAINT tool_gateway_ticket_redirect_ciphertext,
  DROP COLUMN redirect_path_ciphertext;
