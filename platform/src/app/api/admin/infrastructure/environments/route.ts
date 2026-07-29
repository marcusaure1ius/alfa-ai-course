import { start } from "@workflow/core/runtime";

import { requireFreshAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { getDatabase } from "@/server/db/client";
import { fakeScenario, operationError } from "@/server/operations/http";
import {
  attachWorkflowRun,
  operationNeedsWorkflowStart,
  OperationConflictError,
  reserveCreateOperation,
} from "@/server/operations/repository";
import { createEnvironmentWorkflow } from "@/workflows/infrastructure/create";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) return operationError(403, "CSRF", "Запрос отклонён.");
  const access = await requireFreshAdmin(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.name !== "string" ||
    body.name.trim().length < 2 ||
    body.name.length > 80 ||
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 16 ||
    body.idempotencyKey.length > 128
  ) {
    return operationError(400, "INVALID_INPUT", "Проверьте имя и idempotency key.");
  }
  const scenario = fakeScenario(body.simulation);
  try {
    const reserved = await reserveCreateOperation(getDatabase(), access.session, {
      name: body.name.trim(),
      idempotencyKey: body.idempotencyKey,
      scenario,
    });
    if (
      reserved.created ||
      (await operationNeedsWorkflowStart(getDatabase(), reserved.accepted.operationId))
    ) {
      const run = await start(createEnvironmentWorkflow, [
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
      return operationError(409, error.code, "Активная среда или операция уже существует.");
    }
    throw error;
  }
}
