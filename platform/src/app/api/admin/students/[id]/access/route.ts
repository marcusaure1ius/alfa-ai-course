import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import {
  courseError,
  courseRepositoryError,
  hasExactKeys,
  noStoreJson,
} from "@/server/course/http";
import { setStudentCourseAccess } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function PUT(
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
    !hasExactKeys(body, ["courseId", "granted"]) ||
    typeof body.courseId !== "string" ||
    typeof body.granted !== "boolean"
  ) {
    return courseError(400, "INVALID_INPUT", "Укажите курс и состояние доступа.");
  }
  try {
    const { id: studentUserId } = await context.params;
    await setStudentCourseAccess(
      getDatabase(),
      access.session,
      { courseId: body.courseId, studentUserId, granted: body.granted },
      { requestId: request.headers.get("x-vercel-id") ?? undefined },
    );
    return noStoreJson({ version: "course-v1", studentUserId, granted: body.granted });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
