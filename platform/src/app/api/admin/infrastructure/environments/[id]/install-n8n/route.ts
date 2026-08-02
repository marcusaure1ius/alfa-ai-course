import { start } from "@workflow/core/runtime";

import { requireFreshAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { getDatabase } from "@/server/db/client";
import { environmentBelongsToTool } from "@/server/tools/catalog";
import {
  fakeScenario,
  hasOnlyInputKeys,
  operationError,
} from "@/server/operations/http";
import {
  attachWorkflowRun,
  getInstallTarget,
  operationNeedsWorkflowStart,
  OperationConflictError,
  reserveInstallOperation,
  resumeInterruptedInstallOperation,
} from "@/server/operations/repository";
import { getTimewebInstallPreview } from "@/server/providers/timeweb/installation";
import { readCloudProviderRuntime } from "@/server/providers/runtime";
import { installEnvironmentWorkflow } from "@/workflows/infrastructure/install";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return operationError(403, "CSRF", "Запрос отклонён.");
  }
  const access = await requireFreshAdmin(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (
    !body ||
    !hasOnlyInputKeys(body, [
      "confirmationName",
      "toolType",
      "confirmedLoss",
      "idempotencyKey",
      "simulation",
    ]) ||
    typeof body.confirmationName !== "string" ||
    body.toolType !== "n8n" ||
    body.confirmedLoss !== true ||
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 16 ||
    body.idempotencyKey.length > 128
  ) {
    return operationError(
      400,
      "INVALID_INPUT",
      "Нужно точное имя среды и подтверждение переустановки.",
    );
  }
  const { id } = await context.params;
  const scenario = fakeScenario(body.simulation);
  try {
    const sql = getDatabase();
    if (!(await environmentBelongsToTool(sql, "n8n", id))) {
      return operationError(409, "TOOL_ENVIRONMENT_MISMATCH", "Среда n8n не найдена.");
    }
    const target = await getInstallTarget(sql, id);
    if (!target) {
      return operationError(
        409,
        "INVALID_STATE",
        "Среда не готова к установке n8n.",
      );
    }
    const providerRuntime = readCloudProviderRuntime();
    if (
      process.env.VERCEL_ENV === "production" &&
      process.env.PLATFORM_PROVIDER !== "fake" &&
      providerRuntime.mode !== "provider"
    ) {
      return operationError(
        409,
        "MUTATION_GATE_CLOSED",
        "Установка n8n временно недоступна.",
      );
    }
    const preview = await getTimewebInstallPreview(process.env, fetch, target);
    if (!preview.ok) {
      return operationError(409, preview.code, preview.message);
    }
    const interrupted = await resumeInterruptedInstallOperation(
      sql,
      access.session,
      {
        environmentId: id,
        confirmationName: body.confirmationName,
        confirmedLoss: true,
      },
    );
    if (interrupted) {
      const run = await start(installEnvironmentWorkflow, [
        { operationId: interrupted.accepted.operationId, scenario },
      ]);
      await attachWorkflowRun(sql, interrupted.accepted.operationId, run.runId);
      return Response.json(interrupted.accepted, {
        status: 202,
        headers: { "cache-control": "no-store" },
      });
    }
    const reserved = await reserveInstallOperation(sql, access.session, {
      environmentId: id,
      confirmationName: body.confirmationName,
      confirmedLoss: true,
      idempotencyKey: body.idempotencyKey,
      scenario,
      installPlan: preview.plan,
    });
    if (
      reserved.created ||
      (await operationNeedsWorkflowStart(sql, reserved.accepted.operationId))
    ) {
      const run = await start(installEnvironmentWorkflow, [
        { operationId: reserved.accepted.operationId, scenario },
      ]);
      await attachWorkflowRun(sql, reserved.accepted.operationId, run.runId);
    }
    return Response.json(reserved.accepted, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof OperationConflictError) {
      return operationError(
        409,
        error.code,
        error.code === "DNS_CONFLICT"
          ? "Адрес n8n.neurokurs.ru уже занят чужой средой."
          : "Среда не готова к переустановке или имя не совпало.",
      );
    }
    throw error;
  }
}
