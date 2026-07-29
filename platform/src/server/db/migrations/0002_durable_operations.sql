ALTER TABLE operations
  DROP CONSTRAINT operations_idempotency_key_key;

ALTER TABLE operations
  ADD COLUMN workflow_run_id text UNIQUE,
  ADD COLUMN input_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN state_version integer NOT NULL DEFAULT 0 CHECK (state_version >= 0);

CREATE UNIQUE INDEX operations_actor_idempotency
  ON operations (requested_by_user_id, idempotency_key);

CREATE UNIQUE INDEX operations_one_active_mutation
  ON operations (environment_id)
  WHERE environment_id IS NOT NULL
    AND status IN ('queued', 'running')
    AND kind IN ('create_environment', 'delete_environment');

ALTER TABLE operation_steps
  ADD COLUMN logical_key text,
  ADD COLUMN error_code text,
  ADD COLUMN error_message_redacted text,
  ADD COLUMN retry_class text
    CHECK (retry_class IN ('none', 'transient', 'unknown_outcome', 'permanent')),
  ADD COLUMN compensation_status text
    CHECK (compensation_status IN ('not_required', 'pending', 'succeeded', 'failed'));

UPDATE operation_steps
SET logical_key = kind
WHERE logical_key IS NULL;

ALTER TABLE operation_steps
  ALTER COLUMN logical_key SET NOT NULL;

CREATE UNIQUE INDEX operation_steps_logical_key
  ON operation_steps (operation_id, logical_key);

ALTER TABLE domain_allocations
  DROP CONSTRAINT domain_allocations_hostname_key;

CREATE UNIQUE INDEX domain_allocations_active_hostname
  ON domain_allocations (hostname)
  WHERE status NOT IN ('released', 'deleted');

CREATE TABLE fake_provider_events (
  operation_id uuid NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operation_id, event_key)
);
