ALTER TABLE software_installations
  ADD COLUMN managed_gateway_verified_at timestamptz;

COMMENT ON COLUMN software_installations.managed_gateway_verified_at IS
  'Set only after the public managed-gateway boundary passes its fail-closed probe.';
