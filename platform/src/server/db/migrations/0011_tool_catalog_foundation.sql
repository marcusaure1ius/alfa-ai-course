ALTER TABLE environments
  ADD COLUMN tool_type text NOT NULL DEFAULT 'n8n';

ALTER TABLE environments
  ADD CONSTRAINT environments_tool_type_format
  CHECK (tool_type ~ '^[a-z][a-z0-9_-]{1,63}$');

DROP INDEX environments_one_live;

CREATE UNIQUE INDEX environments_one_live_per_tool
  ON environments (tool_type)
  WHERE status IN ('creating', 'active', 'degraded', 'deleting', 'cleanup_required');

ALTER TABLE environments
  ADD CONSTRAINT environments_id_tool_type_unique UNIQUE (id, tool_type);

CREATE TABLE tool_service_settings (
  tool_type text PRIMARY KEY
    CHECK (tool_type ~ '^[a-z][a-z0-9_-]{1,63}$'),
  student_access_enabled boolean NOT NULL DEFAULT true,
  updated_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tool_service_settings (tool_type, student_access_enabled)
VALUES ('n8n', true);

ALTER TABLE tool_access
  DROP CONSTRAINT tool_access_tool_type_check,
  DROP CONSTRAINT tool_access_environment_id_fkey,
  DROP CONSTRAINT tool_access_license_evidence_mode_check,
  DROP CONSTRAINT tool_access_evidence_reference_bounded;

ALTER TABLE tool_access
  ALTER COLUMN environment_id DROP NOT NULL,
  ALTER COLUMN license_evidence_mode DROP NOT NULL,
  ALTER COLUMN license_evidence_reference DROP NOT NULL;

ALTER TABLE tool_access
  ADD CONSTRAINT tool_access_tool_type_format
    CHECK (tool_type ~ '^[a-z][a-z0-9_-]{1,63}$'),
  ADD CONSTRAINT tool_access_environment_matches_tool
    FOREIGN KEY (environment_id, tool_type)
    REFERENCES environments (id, tool_type) ON DELETE CASCADE,
  ADD CONSTRAINT tool_access_n8n_environment_required
    CHECK (tool_type <> 'n8n' OR environment_id IS NOT NULL),
  ADD CONSTRAINT tool_access_license_evidence_mode_check
    CHECK (
      license_evidence_mode IS NULL
      OR license_evidence_mode IN (
        'written_permission',
        'commercial_agreement',
        'product_owner_risk_acceptance'
      )
    ),
  ADD CONSTRAINT tool_access_evidence_consistent
    CHECK (
      (
        tool_type = 'n8n'
        AND license_evidence_mode IS NOT NULL
        AND license_evidence_reference IS NOT NULL
        AND length(btrim(license_evidence_reference)) BETWEEN 3 AND 500
        AND license_evidence_reference !~ '[[:cntrl:]]'
      )
      OR
      (
        tool_type <> 'n8n'
        AND (
          license_evidence_reference IS NULL
          OR (
            length(btrim(license_evidence_reference)) BETWEEN 3 AND 500
            AND license_evidence_reference !~ '[[:cntrl:]]'
          )
        )
      )
    );

CREATE INDEX tool_access_active_tool
  ON tool_access (tool_type, expires_at)
  WHERE status = 'active';
