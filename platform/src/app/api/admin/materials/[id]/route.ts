import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import {
  courseError,
  courseRepositoryError,
  isMaterialInput,
  noStoreJson,
} from "@/server/course/http";
import { updateMaterial } from "@/server/course/repository";
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
  if (!isMaterialInput(body)) {
    return courseError(400, "INVALID_INPUT", "Проверьте поля материала.");
  }
  try {
    const { id } = await context.params;
    await updateMaterial(
      getDatabase(),
      access.session,
      id,
      {
        sectionId: body.sectionId,
        slug: body.slug,
        kind: body.kind,
        title: body.title.trim(),
        summary: body.summary.trim(),
        bodyMarkdown: body.bodyMarkdown,
        position: body.position,
        estimatedMinutes: body.estimatedMinutes,
        status: body.status,
      },
      { requestId: request.headers.get("x-vercel-id") ?? undefined },
    );
    return noStoreJson({ version: "course-v1", id });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
