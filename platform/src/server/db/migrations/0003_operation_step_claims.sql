ALTER TABLE operation_steps
  ADD COLUMN execution_token uuid,
  ADD COLUMN lease_expires_at timestamptz;

CREATE INDEX operation_steps_active_claim
  ON operation_steps (operation_id, logical_key, lease_expires_at)
  WHERE status = 'running' AND execution_token IS NOT NULL;
