import { requireSession } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import {
  courseError,
  courseRepositoryError,
  hasExactKeys,
  noStoreJson,
} from "@/server/course/http";
import { saveMaterialProgress } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  context: { params: Promise<{ material: string }> },
): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return courseError(403, "CSRF", "Запрос отклонён.");
  }
  const access = await requireSession(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    !hasExactKeys(body, ["lastPosition", "completed"]) ||
    (body.lastPosition !== null &&
      (typeof body.lastPosition !== "string" || body.lastPosition.length > 160)) ||
    typeof body.completed !== "boolean"
  ) {
    return courseError(400, "INVALID_INPUT", "Проверьте прогресс материала.");
  }
  try {
    const { material: materialId } = await context.params;
    await saveMaterialProgress(getDatabase(), access.session.userId, {
      materialId,
      lastPosition: body.lastPosition as string | null,
      completed: body.completed,
    });
    return noStoreJson({ version: "course-v1", materialId });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
