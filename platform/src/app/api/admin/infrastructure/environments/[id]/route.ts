import { start } from "@workflow/core/runtime";

import { requireFreshAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { getDatabase } from "@/server/db/client";
import {
  fakeScenario,
  hasOnlyInputKeys,
  operationError,
} from "@/server/operations/http";
import {
  attachWorkflowRun,
  operationNeedsWorkflowStart,
  OperationConflictError,
  reserveDeleteOperation,
} from "@/server/operations/repository";
import { deleteEnvironmentWorkflow } from "@/workflows/infrastructure/delete";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!verifyCsrfRequest(request)) return operationError(403, "CSRF", "Запрос отклонён.");
  const access = await requireFreshAdmin(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    !hasOnlyInputKeys(body, [
      "confirmationName",
      "confirmedLoss",
      "idempotencyKey",
      "simulation",
    ]) ||
    typeof body.confirmationName !== "string" ||
    body.confirmedLoss !== true ||
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 16 ||
    body.idempotencyKey.length > 128
  ) {
    return operationError(400, "INVALID_INPUT", "Нужно точное имя среды и idempotency key.");
  }
  const { id } = await context.params;
  const scenario = fakeScenario(body.simulation);
  try {
    const reserved = await reserveDeleteOperation(getDatabase(), access.session, {
      environmentId: id,
      confirmationName: body.confirmationName,
      confirmedLoss: body.confirmedLoss,
      idempotencyKey: body.idempotencyKey,
      scenario,
    });
    if (
      reserved.created ||
      (await operationNeedsWorkflowStart(getDatabase(), reserved.accepted.operationId))
    ) {
      const run = await start(deleteEnvironmentWorkflow, [
        { operationId: reserved.accepted.operationId, scenario },
      ]);
      await attachWorkflowRun(getDatabase(), reserved.accepted.operationId, run.runId);
    }
    return Response.json(reserved.accepted, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof OperationConflictError) {
      return operationError(409, error.code, "Среда не готова к удалению или имя не совпало.");
    }
    throw error;
  }
}
