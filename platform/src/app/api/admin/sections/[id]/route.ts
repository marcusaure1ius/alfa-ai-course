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
import { deleteSection, updateSection } from "@/server/course/repository";
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
    !hasExactKeys(body, ["slug", "title", "status"]) ||
    !isSlug(body.slug) ||
    !isBoundedText(body.title, 2, 120) ||
    (body.status !== "draft" && body.status !== "published")
  ) {
    return courseError(400, "INVALID_INPUT", "Проверьте название, адрес и публикацию раздела.");
  }
  try {
    const { id } = await context.params;
    await updateSection(
      getDatabase(),
      access.session,
      id,
      {
        slug: body.slug,
        title: body.title.trim(),
        status: body.status,
      },
    );
    return noStoreJson({
      version: "course-v1",
      id,
      slug: body.slug,
      title: body.title.trim(),
      status: body.status,
    });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return courseError(403, "CSRF", "Запрос отклонён.");
  }
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  try {
    const { id } = await context.params;
    await deleteSection(getDatabase(), access.session, id, {
      requestId: request.headers.get("x-vercel-id") ?? undefined,
    });
    return noStoreJson({ version: "course-v1", id, deleted: true });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
