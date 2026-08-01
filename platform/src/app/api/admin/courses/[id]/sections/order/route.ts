import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import {
  courseError,
  courseRepositoryError,
  hasExactKeys,
  noStoreJson,
} from "@/server/course/http";
import { reorderCourseSections } from "@/server/course/repository";
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
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (
    !body ||
    !hasExactKeys(body, ["sectionIds"]) ||
    !Array.isArray(body.sectionIds) ||
    body.sectionIds.length > 500 ||
    !body.sectionIds.every(
      (value) => typeof value === "string" && value.length <= 100,
    )
  ) {
    return courseError(400, "INVALID_INPUT", "Передайте полный порядок разделов.");
  }
  try {
    const { id: courseId } = await context.params;
    await reorderCourseSections(
      getDatabase(),
      access.session,
      courseId,
      body.sectionIds,
      { requestId: request.headers.get("x-vercel-id") ?? undefined },
    );
    return noStoreJson({
      version: "course-v1",
      courseId,
      sectionIds: body.sectionIds,
    });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
