import { FatalError, RetryableError } from "@workflow/core";

import { getDatabase } from "@/server/db/client";
import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  authorizeMutationStep,
  beginStep,
  completeOperationStep,
  finishOperation,
  finishStep,
  operationEnvironmentId,
  transitionEnvironment,
} from "@/server/operations/repository";
import {
  MUTATION_COMMAND_VERSION,
  type MutationResourceKind,
} from "@/server/operations/contracts";
import { classifyProviderError } from "@/server/operations/state";
import {
  FakeProviderError,
  FakeTimewebAdapter,
} from "@/server/providers/timeweb/fake";

async function adapter(command: WorkflowCommand): Promise<FakeTimewebAdapter> {
  const sql = getDatabase();
  return new FakeTimewebAdapter(
    sql,
    command.operationId,
    await operationEnvironmentId(sql, command.operationId),
    command.scenario,
  );
}

async function failProviderStep(
  command: WorkflowCommand,
  key: string,
  executionToken: string,
  error: FakeProviderError,
): Promise<never> {
  const sql = getDatabase();
  const retryClass = classifyProviderError(error.code);
  await finishStep(sql, command.operationId, key, executionToken, {
    status: "failed",
    code: error.code,
    message: error.message,
    retryClass,
  });
  if (retryClass === "permanent") {
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: error.code,
      message: error.message,
    });
    try {
      await transitionEnvironment(sql, command.operationId, "creating", "degraded");
    } catch {
      // A replay may already have moved the environment to its terminal state.
    }
    throw new FatalError(error.message);
  }
  throw new RetryableError(error.message, { retryAfter: 50 });
}

function requireStepClaim(step: {
  claimed: boolean;
  executionToken: string | null;
}): string {
  if (!step.claimed || !step.executionToken) {
    throw new RetryableError("Шаг уже выполняется другим worker.", {
      retryAfter: 250,
    });
  }
  return step.executionToken;
}

async function guardMutation(
  command: WorkflowCommand,
  action: "create" | "delete",
  resourceKind: MutationResourceKind,
) {
  return authorizeMutationStep(getDatabase(), {
    version: MUTATION_COMMAND_VERSION,
    operationId: command.operationId,
    action,
    resourceKind,
  });
}

export async function reserveIpStep(command: WorkflowCommand): Promise<void> {
  "use step";
  const sql = getDatabase();
  const authorization = await guardMutation(command, "create", "public_ip");
  const step = await beginStep(sql, command.operationId, "reserve_public_ip", 10);
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  try {
    if (authorization.resource.state !== "active") {
      await (await adapter(command)).reservePublicIp();
    }
    await finishStep(
      sql,
      command.operationId,
      "reserve_public_ip",
      executionToken,
      { status: "succeeded" },
    );
  } catch (error) {
    if (error instanceof FakeProviderError) {
      await failProviderStep(command, "reserve_public_ip", executionToken, error);
    }
    throw error;
  }
}

export async function createServerStep(command: WorkflowCommand): Promise<void> {
  "use step";
  const sql = getDatabase();
  const authorization = await guardMutation(command, "create", "server");
  const step = await beginStep(sql, command.operationId, "create_server", 20);
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  try {
    if (authorization.resource.state !== "active") {
      await (await adapter(command)).createServer();
    }
    await finishStep(
      sql,
      command.operationId,
      "create_server",
      executionToken,
      { status: "succeeded" },
    );
  } catch (error) {
    if (error instanceof FakeProviderError) {
      await failProviderStep(command, "create_server", executionToken, error);
    }
    throw error;
  }
}
createServerStep.maxRetries = 2;

export async function configureDnsStep(
  command: WorkflowCommand,
): Promise<"ready" | "degraded"> {
  "use step";
  const sql = getDatabase();
  const authorization = await guardMutation(command, "create", "dns_record");
  const step = await beginStep(sql, command.operationId, "configure_dns", 30);
  if (step.alreadyCompleted) return "ready";
  const executionToken = requireStepClaim(step);
  try {
    if (authorization.resource.state !== "active") {
      await (await adapter(command)).configureDns();
    }
    await finishStep(
      sql,
      command.operationId,
      "configure_dns",
      executionToken,
      { status: "succeeded" },
    );
    return "ready";
  } catch (error) {
    if (!(error instanceof FakeProviderError)) throw error;
    await finishStep(sql, command.operationId, "configure_dns", executionToken, {
      status: "failed",
      code: error.code,
      message: error.message,
      retryClass: "permanent",
    });
    await transitionEnvironment(sql, command.operationId, "creating", "degraded");
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: error.code,
      message: error.message,
    });
    return "degraded";
  }
}

export async function verifyTlsStep(
  command: WorkflowCommand,
): Promise<"ready" | "degraded"> {
  "use step";
  const sql = getDatabase();
  const step = await beginStep(sql, command.operationId, "verify_tls", 40);
  if (step.alreadyCompleted) return "ready";
  const executionToken = requireStepClaim(step);
  try {
    await (await adapter(command)).verifyTls();
    await finishStep(
      sql,
      command.operationId,
      "verify_tls",
      executionToken,
      { status: "succeeded" },
    );
    return "ready";
  } catch (error) {
    if (!(error instanceof FakeProviderError)) throw error;
    await finishStep(sql, command.operationId, "verify_tls", executionToken, {
      status: "failed",
      code: error.code,
      message: error.message,
      retryClass: "permanent",
    });
    await transitionEnvironment(sql, command.operationId, "creating", "degraded");
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: error.code,
      message: error.message,
    });
    return "degraded";
  }
}

export async function completeCreateStep(command: WorkflowCommand): Promise<void> {
  "use step";
  const sql = getDatabase();
  const step = await beginStep(sql, command.operationId, "complete", 50);
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  await completeOperationStep(
    sql,
    command.operationId,
    "complete",
    executionToken,
    "creating",
    "active",
  );
}

export async function deleteResourceStep(
  command: WorkflowCommand,
  kind: "dns_record" | "server" | "public_ip",
  order: number,
): Promise<"deleted" | "cleanup_required"> {
  "use step";
  const sql = getDatabase();
  const authorization = await guardMutation(command, "delete", kind);
  const key = `delete_${kind}`;
  const step = await beginStep(sql, command.operationId, key, order);
  if (step.alreadyCompleted) return "deleted";
  const executionToken = requireStepClaim(step);
  try {
    if (authorization.resource.state === "active") {
      await (await adapter(command)).deleteOwnedResource(
        authorization.resource.value,
      );
    }
    await finishStep(sql, command.operationId, key, executionToken, {
      status: "succeeded",
    });
    return "deleted";
  } catch (error) {
    if (!(error instanceof FakeProviderError)) throw error;
    await finishStep(sql, command.operationId, key, executionToken, {
      status: "failed",
      code: error.code,
      message: error.message,
      retryClass: "permanent",
    });
    await transitionEnvironment(sql, command.operationId, "deleting", "cleanup_required");
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: error.code,
      message: error.message,
    });
    return "cleanup_required";
  }
}

export async function completeDeleteStep(command: WorkflowCommand): Promise<void> {
  "use step";
  const sql = getDatabase();
  const step = await beginStep(sql, command.operationId, "complete_delete", 50);
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  await completeOperationStep(
    sql,
    command.operationId,
    "complete_delete",
    executionToken,
    "deleting",
    "deleted",
  );
}
