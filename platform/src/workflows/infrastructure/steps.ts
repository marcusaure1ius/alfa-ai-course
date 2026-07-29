import { FatalError, RetryableError } from "@workflow/core";

import { getDatabase } from "@/server/db/client";
import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  beginStep,
  finishOperation,
  finishStep,
  operationEnvironmentId,
  transitionEnvironment,
} from "@/server/operations/repository";
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
  error: FakeProviderError,
): Promise<never> {
  const sql = getDatabase();
  const retryClass = classifyProviderError(error.code);
  await finishStep(sql, command.operationId, key, {
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

export async function reserveIpStep(command: WorkflowCommand): Promise<void> {
  "use step";
  const sql = getDatabase();
  const step = await beginStep(sql, command.operationId, "reserve_public_ip", 10);
  if (step.alreadyCompleted) return;
  try {
    await (await adapter(command)).reservePublicIp();
    await finishStep(sql, command.operationId, "reserve_public_ip", { status: "succeeded" });
  } catch (error) {
    if (error instanceof FakeProviderError) {
      await failProviderStep(command, "reserve_public_ip", error);
    }
    throw error;
  }
}

export async function createServerStep(command: WorkflowCommand): Promise<void> {
  "use step";
  const sql = getDatabase();
  const step = await beginStep(sql, command.operationId, "create_server", 20);
  if (step.alreadyCompleted) return;
  try {
    await (await adapter(command)).createServer();
    await finishStep(sql, command.operationId, "create_server", { status: "succeeded" });
  } catch (error) {
    if (error instanceof FakeProviderError) {
      await failProviderStep(command, "create_server", error);
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
  const step = await beginStep(sql, command.operationId, "configure_dns", 30);
  if (step.alreadyCompleted) return "ready";
  try {
    await (await adapter(command)).configureDns();
    await finishStep(sql, command.operationId, "configure_dns", { status: "succeeded" });
    return "ready";
  } catch (error) {
    if (!(error instanceof FakeProviderError)) throw error;
    await finishStep(sql, command.operationId, "configure_dns", {
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
  try {
    await (await adapter(command)).verifyTls();
    await finishStep(sql, command.operationId, "verify_tls", { status: "succeeded" });
    return "ready";
  } catch (error) {
    if (!(error instanceof FakeProviderError)) throw error;
    await finishStep(sql, command.operationId, "verify_tls", {
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
  await transitionEnvironment(sql, command.operationId, "creating", "active");
  await finishStep(sql, command.operationId, "complete", { status: "succeeded" });
  await finishOperation(sql, command.operationId, { status: "succeeded" });
}

export async function deleteResourceStep(
  command: WorkflowCommand,
  kind: "dns_record" | "server" | "public_ip",
  order: number,
): Promise<"deleted" | "cleanup_required"> {
  "use step";
  const sql = getDatabase();
  const key = `delete_${kind}`;
  const step = await beginStep(sql, command.operationId, key, order);
  if (step.alreadyCompleted) return "deleted";
  try {
    await (await adapter(command)).deleteKind(kind);
    await finishStep(sql, command.operationId, key, { status: "succeeded" });
    return "deleted";
  } catch (error) {
    if (!(error instanceof FakeProviderError)) throw error;
    await finishStep(sql, command.operationId, key, {
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
  await transitionEnvironment(sql, command.operationId, "deleting", "deleted");
  await finishStep(sql, command.operationId, "complete_delete", { status: "succeeded" });
  await finishOperation(sql, command.operationId, { status: "succeeded" });
}
