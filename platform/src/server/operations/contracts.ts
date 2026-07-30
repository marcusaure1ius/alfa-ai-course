import "server-only";

export const OPERATIONS_DTO_VERSION = "v1" as const;
export const MUTATION_COMMAND_VERSION = "timeweb-mutation-v1" as const;

export type FakeScenario =
  | "success"
  | "timeout_after_create"
  | "insufficient_funds"
  | "dns_failure"
  | "tls_failure"
  | "backup_unavailable"
  | "partial_cleanup";

export type OperationKind = "create_environment" | "delete_environment";
export type OperationStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "manual_confirmation_required";

export type WorkflowCommand = Readonly<{
  operationId: string;
  scenario: FakeScenario;
}>;

export type MutationResourceKind = "server" | "public_ip" | "dns_record";

/**
 * Exact internal command. Environment and provider resource IDs are resolved
 * from PostgreSQL and therefore cannot be supplied by a browser request.
 */
export type GuardedMutationCommand = Readonly<{
  version: typeof MUTATION_COMMAND_VERSION;
  operationId: string;
  action: "create" | "delete";
  resourceKind: MutationResourceKind;
}>;

export type MutationAccepted = Readonly<{
  version: typeof OPERATIONS_DTO_VERSION;
  operationId: string;
}>;

export type TimelineStep = Readonly<{
  key: string;
  status: string;
  attempts: number;
  error?: { code: string; message: string };
}>;
