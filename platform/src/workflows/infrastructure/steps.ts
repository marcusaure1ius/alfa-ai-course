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

async function adapter(
  command: WorkflowCommand,
  options: Readonly<{
    createExecutionToken?: string;
    reserveIpExecutionToken?: string;
    configureDnsExecutionToken?: string;
  }> = {},
) {
  return createInfrastructureLifecycleAdapter(command, options);
}

export async function providerSliceStep(
  command: WorkflowCommand,
): Promise<"production-deploy" | "fake-foundation"> {
  "use step";
  return (await operationUsesProductionTimeweb(command))
    ? "production-deploy"
    : "fake-foundation";
}

async function failProviderStep(
  command: WorkflowCommand,
  key: string,
  executionToken: string,
  error: Readonly<{ code: string; message: string; retryable?: boolean }>,
  retryAfterMs = 1_000,
): Promise<never> {
  const sql = getDatabase();
  const retryClass = classifyProviderError(error.code, error.retryable);
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
        key === "provider_installing" ||
        (key === "reserve_public_ip" &&
          error.code === "UNKNOWN_PUBLIC_IP_OUTCOME") ||
        (key === "create_server" &&
          error.code === "UNKNOWN_SERVER_OUTCOME")
          ? "cleanup_required"
          : "degraded",
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
      await (
        await adapter(command, { reserveIpExecutionToken: executionToken })
      ).reservePublicIp();
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
reserveIpStep.maxRetries = 9;

export async function resolvePublicIpAmbiguityStep(
  command: WorkflowCommand,
): Promise<"resolved" | "cleanup_required"> {
  "use step";
  const sql = getDatabase();
  await guardMutation(command, "delete", "public_ip");
  const step = await beginStep(
    sql,
    command.operationId,
    "resolve_public_ip_ambiguity",
    5,
  );
  if (step.alreadyCompleted) return "resolved";
  const executionToken = requireStepClaim(step);
  try {
    await (await adapter(command)).resolvePublicIpAmbiguity();
    await finishStep(
      sql,
      command.operationId,
      "resolve_public_ip_ambiguity",
      executionToken,
      { status: "succeeded" },
    );
    return "resolved";
  } catch (error) {
    const providerError = lifecycleProviderError(error);
    if (!providerError) throw error;
    const retryClass = classifyProviderError(
      providerError.code,
      "retryable" in providerError ? providerError.retryable : undefined,
    );
    const exhausted = retryClass !== "permanent" && step.attempts >= 10;
    const terminalCode = exhausted
      ? "PUBLIC_IP_AMBIGUITY_RECONCILE_EXHAUSTED"
      : providerError.code;
    await finishStep(
      sql,
      command.operationId,
      "resolve_public_ip_ambiguity",
      executionToken,
      {
        status: "failed",
        code: terminalCode,
        message: providerError.message,
        retryClass: exhausted ? "permanent" : retryClass,
      },
    );
    if (retryClass !== "permanent" && !exhausted) {
      throw new RetryableError(providerError.message, {
        retryAfter: 5_000,
      });
    }
    await transitionEnvironment(
      sql,
      command.operationId,
      "deleting",
      "cleanup_required",
    );
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: terminalCode,
      message: providerError.message,
    });
    return "cleanup_required";
  }
}
resolvePublicIpAmbiguityStep.maxRetries = 9;

export async function resolveDnsAmbiguityStep(
  command: WorkflowCommand,
): Promise<"resolved" | "cleanup_required"> {
  "use step";
  const sql = getDatabase();
  await guardMutation(command, "delete", "dns_record");
  const step = await beginStep(
    sql,
    command.operationId,
    "resolve_dns_ambiguity",
    7,
  );
  if (step.alreadyCompleted) return "resolved";
  const executionToken = requireStepClaim(step);
  try {
    await (await adapter(command)).resolveDnsAmbiguity();
    await finishStep(
      sql,
      command.operationId,
      "resolve_dns_ambiguity",
      executionToken,
      { status: "succeeded" },
    );
    return "resolved";
  } catch (error) {
    const providerError = lifecycleProviderError(error);
    if (!providerError) throw error;
    const retryClass = classifyProviderError(
      providerError.code,
      "retryable" in providerError ? providerError.retryable : undefined,
    );
    const exhausted = retryClass !== "permanent" && step.attempts >= 10;
    const terminalCode = exhausted
      ? "DNS_AMBIGUITY_RECONCILE_EXHAUSTED"
      : providerError.code;
    await finishStep(
      sql,
      command.operationId,
      "resolve_dns_ambiguity",
      executionToken,
      {
        status: "failed",
        code: terminalCode,
        message: providerError.message,
        retryClass: exhausted ? "permanent" : retryClass,
      },
    );
    if (retryClass !== "permanent" && !exhausted) {
      throw new RetryableError(providerError.message, {
        retryAfter: 5_000,
      });
    }
    await transitionEnvironment(
      sql,
      command.operationId,
      "deleting",
      "cleanup_required",
    );
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: terminalCode,
      message: providerError.message,
    });
    return "cleanup_required";
  }
}
resolveDnsAmbiguityStep.maxRetries = 9;

export async function resolveServerAmbiguityStep(
  command: WorkflowCommand,
): Promise<"resolved" | "cleanup_required"> {
  "use step";
  const sql = getDatabase();
  await guardMutation(command, "delete", "server");
  const step = await beginStep(
    sql,
    command.operationId,
    "resolve_server_ambiguity",
    6,
  );
  if (step.alreadyCompleted) return "resolved";
  const executionToken = requireStepClaim(step);
  try {
    await (await adapter(command)).resolveServerAmbiguity();
    await finishStep(
      sql,
      command.operationId,
      "resolve_server_ambiguity",
      executionToken,
      { status: "succeeded" },
    );
    return "resolved";
  } catch (error) {
    const providerError = lifecycleProviderError(error);
    if (!providerError) throw error;
    const retryClass = classifyProviderError(
      providerError.code,
      "retryable" in providerError ? providerError.retryable : undefined,
    );
    const exhausted = retryClass !== "permanent" && step.attempts >= 10;
    const terminalCode = exhausted
      ? "SERVER_AMBIGUITY_RECONCILE_EXHAUSTED"
      : providerError.code;
    await finishStep(
      sql,
      command.operationId,
      "resolve_server_ambiguity",
      executionToken,
      {
        status: "failed",
        code: terminalCode,
        message: providerError.message,
        retryClass: exhausted ? "permanent" : retryClass,
      },
    );
    if (retryClass !== "permanent" && !exhausted) {
      throw new RetryableError(providerError.message, {
        retryAfter: 5_000,
      });
    }
    await transitionEnvironment(
      sql,
      command.operationId,
      "deleting",
      "cleanup_required",
    );
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: terminalCode,
      message: providerError.message,
    });
    return "cleanup_required";
  }
}
resolveServerAmbiguityStep.maxRetries = 9;

export async function createServerStep(command: WorkflowCommand): Promise<void> {
  "use step";
  const sql = getDatabase();
  await guardMutation(command, "create", "server");
  const step = await beginStep(sql, command.operationId, "create_server", 20);
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  try {
    // The adapter is idempotent. Re-entering it for an already recorded server
    // completes pending public-IP discovery without issuing another POST.
    await (
      await adapter(command, { createExecutionToken: executionToken })
    ).createServer();
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
    "provider_installing",
    30,
  );
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  try {
    await (await adapter(command)).reconcileServer();
    await finishStep(
      sql,
      command.operationId,
      "provider_installing",
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
          "provider_installing",
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
        "provider_installing",
        executionToken,
        providerError,
        15_000,
      );
    }
    throw error;
  }
}
reconcileServerStep.maxRetries = 20;

export async function configureBackupsStep(
  command: WorkflowCommand,
): Promise<void> {
  "use step";
  const sql = getDatabase();
  await guardMutation(command, "create", "server");
  const step = await beginStep(sql, command.operationId, "configure_backups", 40);
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  try {
    await (await adapter(command)).configureBackups();
    await finishStep(
      sql,
      command.operationId,
      "configure_backups",
      executionToken,
      { status: "succeeded" },
    );
  } catch (error) {
    const providerError = lifecycleProviderError(error);
    if (providerError) {
      const retryClass = classifyProviderError(
        providerError.code,
        "retryable" in providerError ? providerError.retryable : undefined,
      );
      if (retryClass !== "permanent" && step.attempts >= 4) {
        await finishStep(
          sql,
          command.operationId,
          "configure_backups",
          executionToken,
          {
            status: "failed",
            code: "BACKUP_CONFIGURATION_EXHAUSTED",
            message:
              "Timeweb не применил настройки автобэкапа за ограниченное окно.",
            retryClass: "permanent",
          },
        );
        await finishOperation(sql, command.operationId, {
          status: "failed",
          code: "BACKUP_CONFIGURATION_EXHAUSTED",
          message:
            "VPS и IPv4 требуют cleanup после исчерпания настройки автобэкапа.",
        });
        await transitionEnvironment(
          sql,
          command.operationId,
          "creating",
          "cleanup_required",
        );
        throw new FatalError(
          "Настройки автобэкапа не применены; требуется cleanup.",
        );
      }
      await failProviderStep(
        command,
        "configure_backups",
        executionToken,
        providerError,
        5_000,
      );
    }
    throw error;
  }
}
configureBackupsStep.maxRetries = 4;

export async function configureDnsStep(
  command: WorkflowCommand,
): Promise<"ready" | "degraded"> {
  "use step";
  const sql = getDatabase();
  const authorization = await guardMutation(command, "create", "dns_record");
  const step = await beginStep(sql, command.operationId, "configure_dns", 15);
  if (step.alreadyCompleted) return "ready";
  const executionToken = requireStepClaim(step);
  try {
    if (authorization.resource.state !== "active") {
      await (
        await adapter(command, {
          configureDnsExecutionToken: executionToken,
        })
      ).configureDns();
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
    const retryClass = classifyProviderError(
      providerError.code,
      "retryable" in providerError ? providerError.retryable : undefined,
    );
    if (retryClass !== "permanent" && step.attempts < 10) {
      await finishStep(
        sql,
        command.operationId,
        "configure_dns",
        executionToken,
        {
          status: "failed",
          code: providerError.code,
          message: providerError.message,
          retryClass,
        },
      );
      throw new RetryableError(providerError.message, { retryAfter: 5_000 });
    }
    const terminalCode =
      retryClass === "permanent"
        ? providerError.code
        : "DNS_RECONCILE_EXHAUSTED";
    await finishStep(sql, command.operationId, "configure_dns", executionToken, {
      status: "failed",
      code: terminalCode,
      message: providerError.message,
      retryClass: "permanent",
    });
    await transitionEnvironment(
      sql,
      command.operationId,
      "creating",
      providerError.code === "UNKNOWN_DNS_OUTCOME"
        ? "cleanup_required"
        : "degraded",
    );
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: terminalCode,
      message: providerError.message,
    });
    return "degraded";
  }
}
configureDnsStep.maxRetries = 9;

type ReadinessAction =
  | "verifyBootstrapReachable"
  | "waitForDns"
  | "verifyTls"
  | "verifyN8nHealth";

async function runReadinessStage(
  command: WorkflowCommand,
  key: string,
  order: number,
  action: ReadinessAction,
): Promise<"ready" | "degraded"> {
  const sql = getDatabase();
  const step = await beginStep(sql, command.operationId, key, order);
  if (step.alreadyCompleted) return "ready";
  const executionToken = requireStepClaim(step);
  try {
    await (await adapter(command))[action]();
    await finishStep(sql, command.operationId, key, executionToken, {
      status: "succeeded",
    });
    return "ready";
  } catch (error) {
    const providerError = lifecycleProviderError(error);
    if (!providerError) throw error;
    const retryClass = classifyProviderError(
      providerError.code,
      "retryable" in providerError ? providerError.retryable : undefined,
    );
    if (retryClass !== "permanent" && step.attempts < 20) {
      await finishStep(sql, command.operationId, key, executionToken, {
        status: "failed",
        code: providerError.code,
        message: providerError.message,
        retryClass,
      });
      throw new RetryableError(providerError.message, {
        retryAfter: 15_000,
      });
    }
    const terminalCode =
      retryClass === "permanent"
        ? providerError.code
        : `${key.toUpperCase()}_EXHAUSTED`;
    await finishStep(sql, command.operationId, key, executionToken, {
      status: "failed",
      code: terminalCode,
      message: providerError.message,
      retryClass: "permanent",
    });
    await transitionEnvironment(sql, command.operationId, "creating", "degraded");
    await finishOperation(sql, command.operationId, {
      status: "failed",
      code: terminalCode,
      message: providerError.message,
    });
    return "degraded";
  }
}

export async function bootstrappingStep(
  command: WorkflowCommand,
): Promise<"ready" | "degraded"> {
  "use step";
  return runReadinessStage(
    command,
    "bootstrapping",
    40,
    "verifyBootstrapReachable",
  );
}
bootstrappingStep.maxRetries = 19;

export async function waitingDnsStep(
  command: WorkflowCommand,
): Promise<"ready" | "degraded"> {
  "use step";
  return runReadinessStage(command, "waiting_dns", 50, "waitForDns");
}
waitingDnsStep.maxRetries = 19;

export async function issuingTlsStep(
  command: WorkflowCommand,
): Promise<"ready" | "degraded"> {
  "use step";
  return runReadinessStage(command, "issuing_tls", 60, "verifyTls");
}
issuingTlsStep.maxRetries = 19;

export async function healthCheckStep(
  command: WorkflowCommand,
): Promise<"ready" | "degraded"> {
  "use step";
  return runReadinessStage(command, "health_check", 70, "verifyN8nHealth");
}
healthCheckStep.maxRetries = 19;

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
  const step = await beginStep(sql, command.operationId, "complete", 80);
  if (step.alreadyCompleted) return;
  const executionToken = requireStepClaim(step);
  await (await adapter(command)).recordReadyInstallation();
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
    const retryClass = classifyProviderError(
      providerError.code,
      "retryable" in providerError ? providerError.retryable : undefined,
    );
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
