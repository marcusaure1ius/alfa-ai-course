DROP INDEX operations_one_active_mutation;

CREATE UNIQUE INDEX operations_one_active_mutation
  ON operations (environment_id)
  WHERE environment_id IS NOT NULL
    AND status IN ('queued', 'running')
    AND kind IN (
      'create_environment',
      'install_environment',
      'delete_environment'
    );
