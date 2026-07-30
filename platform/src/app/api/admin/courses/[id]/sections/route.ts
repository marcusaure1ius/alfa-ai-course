import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import {
  courseError,
  courseRepositoryError,
  hasExactKeys,
  isBoundedText,
  isSlug,
  noStoreJson,
} from "@/server/course/http";
import { createSection } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function POST(
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
    !hasExactKeys(body, ["slug", "title", "position"]) ||
    !isSlug(body.slug) ||
    !isBoundedText(body.title, 2, 120) ||
    !Number.isSafeInteger(body.position) ||
    (body.position as number) < 0
  ) {
    return courseError(400, "INVALID_INPUT", "Проверьте раздел и его позицию.");
  }
  try {
    const { id: courseId } = await context.params;
    const id = await createSection(getDatabase(), access.session, {
      courseId,
      slug: body.slug,
      title: body.title.trim(),
      position: body.position as number,
    });
    return noStoreJson({ version: "course-v1", id }, 201);
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
