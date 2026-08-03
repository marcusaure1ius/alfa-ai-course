CREATE TABLE tool_access (
  tool_type text NOT NULL
    CHECK (tool_type IN ('n8n')),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz NOT NULL,
  license_evidence_mode text NOT NULL
    CHECK (license_evidence_mode IN ('written_permission', 'commercial_agreement')),
  license_evidence_reference text NOT NULL,
  granted_by_user_id uuid NOT NULL REFERENCES users(id),
  revoked_by_user_id uuid REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tool_type, user_id),
  CONSTRAINT tool_access_evidence_reference_bounded
    CHECK (
      length(btrim(license_evidence_reference)) BETWEEN 3 AND 500
      AND license_evidence_reference !~ '[[:cntrl:]]'
    ),
  CONSTRAINT tool_access_revocation_consistent
    CHECK (
      (status = 'active' AND revoked_at IS NULL AND revoked_by_user_id IS NULL)
      OR
      (status = 'revoked' AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
    )
);

CREATE INDEX tool_access_active_environment
  ON tool_access (environment_id, user_id)
  WHERE status = 'active';
