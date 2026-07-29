ALTER TABLE operations
  ADD COLUMN requested_by_session_id uuid REFERENCES auth_sessions(id);

CREATE INDEX operations_request_session
  ON operations (requested_by_session_id)
  WHERE requested_by_session_id IS NOT NULL;
