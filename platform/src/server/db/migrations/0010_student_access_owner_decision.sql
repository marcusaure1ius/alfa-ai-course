ALTER TABLE tool_access
  DROP CONSTRAINT IF EXISTS tool_access_license_evidence_mode_check;

ALTER TABLE tool_access
  ADD CONSTRAINT tool_access_license_evidence_mode_check
  CHECK (
    license_evidence_mode IN (
      'written_permission',
      'commercial_agreement',
      'product_owner_risk_acceptance'
    )
  );
