ALTER TABLE auth_sessions
  ADD COLUMN mfa_authenticated_at timestamptz;

CREATE INDEX auth_sessions_recent_mfa
  ON auth_sessions (user_id, mfa_authenticated_at)
  WHERE revoked_at IS NULL AND mfa_authenticated_at IS NOT NULL;
