import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { courseError, hasExactKeys, noStoreJson } from "@/server/course/http";
import { getDatabase } from "@/server/db/client";
import {
  setToolServiceAccess,
  ToolServiceAccessError,
} from "@/server/tools/service-access";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ toolType: string }> },
): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return courseError(403, "CSRF", "Запрос отклонён.");
  }
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || !hasExactKeys(body, ["enabled"]) || typeof body.enabled !== "boolean") {
    return courseError(400, "INVALID_INPUT", "Проверьте состояние доступа.");
  }
  try {
    const { toolType } = await context.params;
    const result = await setToolServiceAccess(
      getDatabase(),
      access.session,
      { toolType, enabled: body.enabled },
      { requestId: request.headers.get("x-vercel-id") ?? undefined },
    );
    return noStoreJson({ version: "tool-service-access-v1", ...result });
  } catch (error) {
    if (error instanceof ToolServiceAccessError) {
      return courseError(
        error.code === "FORBIDDEN" ? 403 : 404,
        error.code,
        error.code === "FORBIDDEN" ? "Доступ запрещён." : "Сервис не найден.",
      );
    }
    throw error;
  }
}
