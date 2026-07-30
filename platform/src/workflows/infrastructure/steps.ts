import { FatalError, RetryableError } from "@workflow/core";

import { getDatabase } from "@/server/db/client";
import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  authorizeMutationStep,
  beginStep,
  completeOperationStep,
  finishOperation,
  finishStep,
  transitionEnvironment,
} from "@/server/operations/repository";
import {
  MUTATION_COMMAND_VERSION,
  type MutationResourceKind,
} from "@/server/operations/contracts";
import { classifyProviderError } from "@/server/operations/state";
import {
  createInfrastructureLifecycleAdapter,
  lifecycleProviderError,
  operationUsesProductionTimeweb,
} from "@/server/providers/timeweb/lifecycle";

async function adapter(command: WorkflowCommand) {
  return createInfrastructureLifecycleAdapter(command);
}

export async function providerSliceStep(
  command: WorkflowCommand,
): Promise<"production-1a" | "fake-foundation"> {
  "use step";
  return (await operationUsesProductionTimeweb(command))
    ? "production-1a"
    : "fake-foundation";
}

async function failProviderStep(
  command: WorkflowCommand,
  key: string,
  executionToken: string,
  error: Readonly<{ code: string; message: string }>,
  retryAfterMs = 1_000,
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
      await transitionEnvironment(
        sql,
        command.operationId,
        "creating",
        key === "reconcile_server" ? "cleanup_required" : "degraded",
      );
    } catch {
      // A replay may already have moved the environment to its terminal state.
    }
    throw new FatalError(error.message);
  }
  throw new RetryableError(error.message, { retryAfter: retryAfterMs });
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
    const providerError = lifecycleProviderError(error);
    if (providerError) {
      await failProviderStep(
        command,
        "reserve_public_ip",
        executionToken,
        providerError,
      );
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
    const providerError = lifecycleProviderError(error);
    if (providerError) {
      await failProviderStep(
        command,
        "create_server",
        executionToken,
        providerError,
      );
    }
    throw error;
  }
}
createServerStep.maxRetries = 2;

export async function reconcileServerStep(
  command: WorkflowCommand,
): Promise<void> {
  "use step";
  const sql = getDatabase();
  await guardMutation(command, "create", "server");
  const step = await beginStep(
    sql,
    command.operationId,
    "reconcile_server",
    30,
  );
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  try {
    await (await adapter(command)).reconcileServer();
    await finishStep(
      sql,
      command.operationId,
      "reconcile_server",
      executionToken,
      { status: "succeeded" },
    );
  } catch (error) {
    const providerError = lifecycleProviderError(error);
    if (providerError) {
      if (
        providerError.code === "SERVER_NOT_READY" &&
        step.attempts >= 20
      ) {
        await finishStep(
          sql,
          command.operationId,
          "reconcile_server",
          executionToken,
          {
            status: "failed",
            code: "RECONCILE_EXHAUSTED",
            message:
              "Timeweb VPS не перешёл в ready за ограниченное окно reconciliation.",
            retryClass: "permanent",
          },
        );
        await finishOperation(sql, command.operationId, {
          status: "failed",
          code: "RECONCILE_EXHAUSTED",
          message:
            "Timeweb VPS требует cleanup после исчерпания reconciliation.",
        });
        await transitionEnvironment(
          sql,
          command.operationId,
          "creating",
          "cleanup_required",
        );
        throw new FatalError(
          "Timeweb VPS не перешёл в ready; требуется cleanup.",
        );
      }
      await failProviderStep(
        command,
        "reconcile_server",
        executionToken,
        providerError,
        15_000,
      );
    }
    throw error;
  }
}
reconcileServerStep.maxRetries = 20;

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
    const providerError = lifecycleProviderError(error);
    if (!providerError) throw error;
    await finishStep(sql, command.operationId, "configure_dns", executionToken, {
      status: "failed",
      code: providerError.code,
      message: providerError.message,
      retryClass: "permanent",
    });
    await transitionEnvironment(sql, command.operationId, "creating", "degraded");
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: providerError.code,
      message: providerError.message,
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
    const providerError = lifecycleProviderError(error);
    if (!providerError) throw error;
    await finishStep(sql, command.operationId, "verify_tls", executionToken, {
      status: "failed",
      code: providerError.code,
      message: providerError.message,
      retryClass: "permanent",
    });
    await transitionEnvironment(sql, command.operationId, "creating", "degraded");
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: providerError.code,
      message: providerError.message,
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
    const providerError = lifecycleProviderError(error);
    if (!providerError) throw error;
    const retryClass = classifyProviderError(providerError.code);
    await finishStep(sql, command.operationId, key, executionToken, {
      status: "failed",
      code: providerError.code,
      message: providerError.message,
      retryClass,
    });
    if (retryClass !== "permanent") {
      throw new RetryableError(providerError.message, { retryAfter: 500 });
    }
    await transitionEnvironment(sql, command.operationId, "deleting", "cleanup_required");
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: providerError.code,
      message: providerError.message,
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
