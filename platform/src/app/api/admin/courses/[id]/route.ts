import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import type { PublicationStatus } from "@/server/course/contracts";
import {
  courseError,
  courseRepositoryError,
  hasExactKeys,
  noStoreJson,
} from "@/server/course/http";
import { setCoursePublication } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return courseError(403, "CSRF", "Запрос отклонён.");
  }
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    !hasExactKeys(body, ["status"]) ||
    (body.status !== "draft" && body.status !== "published")
  ) {
    return courseError(400, "INVALID_INPUT", "Укажите состояние публикации.");
  }
  try {
    const { id } = await context.params;
    await setCoursePublication(
      getDatabase(),
      access.session,
      id,
      body.status as PublicationStatus,
    );
    return noStoreJson({ version: "course-v1", id, status: body.status });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
