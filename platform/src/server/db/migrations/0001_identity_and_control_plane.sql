CREATE TABLE roles (
  id text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO roles (id, description)
VALUES
  ('admin', 'Администратор платформы'),
  ('student', 'Ученик')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  role_id text NOT NULL REFERENCES roles(id),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked')),
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  blocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)))
);

CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  ip_hash char(64),
  user_agent_hash char(64),
  authenticated_at timestamptz NOT NULL DEFAULT now(),
  reauthenticated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_sessions_expiry CHECK (expires_at > authenticated_at)
);

CREATE INDEX auth_sessions_user_active
  ON auth_sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE auth_factors (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  factor_type text NOT NULL CHECK (factor_type IN ('totp', 'webauthn', 'recovery')),
  label text NOT NULL,
  secret_ciphertext text,
  verified_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_factors_user_verified
  ON auth_factors (user_id)
  WHERE verified_at IS NOT NULL AND disabled_at IS NULL;

CREATE TABLE auth_bootstrap_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO auth_bootstrap_state (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE auth_rate_limits (
  bucket_key char(64) PRIMARY KEY,
  action text NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provider_connections (
  id uuid PRIMARY KEY,
  provider text NOT NULL,
  display_name text NOT NULL,
  credential_reference text NOT NULL,
  status text NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('unverified', 'ready', 'error', 'disabled')),
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_connections_reference_only
    CHECK (credential_reference !~* '(token|secret|password)[=:][^[:space:]]+')
);

CREATE TABLE infrastructure_profiles (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL,
  region_id text,
  zone_id text,
  preset_id text,
  image_id text,
  install_profile_version text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE environments (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id),
  profile_id uuid REFERENCES infrastructure_profiles(id),
  status text NOT NULL
    CHECK (status IN ('draft', 'creating', 'active', 'degraded', 'deleting', 'deleted', 'cleanup_required')),
  public_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX environments_one_live
  ON environments ((true))
  WHERE status IN ('creating', 'active', 'degraded', 'deleting', 'cleanup_required');

CREATE TABLE operations (
  id uuid PRIMARY KEY,
  environment_id uuid REFERENCES environments(id),
  kind text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'manual_confirmation_required')),
  requested_by_user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL UNIQUE,
  error_code text,
  error_message_redacted text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operation_steps (
  id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  step_order integer NOT NULL CHECK (step_order >= 0),
  kind text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  logs_redacted text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id, step_order)
);

CREATE TABLE provider_resources (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  operation_id uuid REFERENCES operations(id),
  provider text NOT NULL,
  resource_kind text NOT NULL,
  provider_resource_id text NOT NULL,
  ownership text NOT NULL CHECK (ownership IN ('platform', 'external')),
  lifecycle_status text NOT NULL,
  public_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, resource_kind, provider_resource_id)
);

CREATE TABLE domain_allocations (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  hostname text NOT NULL UNIQUE,
  zone_name text NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('A', 'AAAA', 'CNAME')),
  provider_resource_id uuid REFERENCES provider_resources(id),
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE software_installations (
  id uuid PRIMARY KEY,
  environment_id uuid NOT NULL REFERENCES environments(id),
  profile_name text NOT NULL,
  profile_version text NOT NULL,
  software_version text NOT NULL,
  status text NOT NULL,
  health_status text,
  installed_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (environment_id, profile_name)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_id text,
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  request_id text,
  ip_hash char(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT audit_metadata_is_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX audit_events_occurred_at ON audit_events (occurred_at DESC);
CREATE INDEX audit_events_actor ON audit_events (actor_user_id, occurred_at DESC);

CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;

CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
