ALTER TABLE tool_access
  ADD COLUMN n8n_identity_id text,
  ADD COLUMN n8n_identity_email text;

ALTER TABLE tool_access
  ADD CONSTRAINT tool_access_n8n_identity_pair
    CHECK (
      (n8n_identity_id IS NULL AND n8n_identity_email IS NULL)
      OR
      (
        tool_type = 'n8n'
        AND length(btrim(n8n_identity_id)) BETWEEN 1 AND 200
        AND n8n_identity_email = lower(btrim(n8n_identity_email))
        AND length(n8n_identity_email) BETWEEN 3 AND 320
      )
    );

CREATE UNIQUE INDEX tool_access_n8n_identity_unique
  ON tool_access (environment_id, n8n_identity_id)
  WHERE tool_type = 'n8n' AND n8n_identity_id IS NOT NULL;

CREATE UNIQUE INDEX tool_access_n8n_email_unique
  ON tool_access (environment_id, n8n_identity_email)
  WHERE tool_type = 'n8n' AND n8n_identity_email IS NOT NULL;

CREATE TABLE tool_gateway_tickets (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  environment_id uuid NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_role text NOT NULL CHECK (subject_role IN ('admin', 'student')),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tool_gateway_ticket_expiry CHECK (expires_at > created_at)
);

CREATE INDEX tool_gateway_tickets_active
  ON tool_gateway_tickets (token_hash, expires_at)
  WHERE consumed_at IS NULL;

CREATE TABLE tool_gateway_sessions (
  id uuid PRIMARY KEY,
  token_hash char(64) NOT NULL UNIQUE,
  environment_id uuid NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  subject_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_role text NOT NULL CHECK (subject_role IN ('admin', 'student')),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_authorized_at timestamptz,
  CONSTRAINT tool_gateway_session_expiry CHECK (expires_at > created_at)
);

CREATE INDEX tool_gateway_sessions_active
  ON tool_gateway_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;
