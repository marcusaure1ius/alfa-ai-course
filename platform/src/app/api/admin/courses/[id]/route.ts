import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import type { PublicationStatus } from "@/server/course/contracts";
import {
  courseError,
  courseRepositoryError,
  hasExactKeys,
  isBoundedText,
  isSlug,
  noStoreJson,
} from "@/server/course/http";
import {
  deleteCourse,
  setCoursePublication,
  updateCourse,
} from "@/server/course/repository";
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
  const statusIsValid = body?.status === "draft" || body?.status === "published";
  const isPublicationOnly = Boolean(
    body && Object.keys(body).length === 1 && hasExactKeys(body, ["status"]),
  );
  const isFullUpdate = Boolean(
    body &&
      Object.keys(body).length === 4 &&
      hasExactKeys(body, ["slug", "title", "description", "status"]) &&
      isSlug(body.slug) &&
      isBoundedText(body.title, 2, 120) &&
      isBoundedText(body.description, 0, 500) &&
      statusIsValid,
  );
  if (!body || !statusIsValid || (!isPublicationOnly && !isFullUpdate)) {
    return courseError(
      400,
      "INVALID_INPUT",
      "Проверьте название, адрес, описание и видимость курса.",
    );
  }
  try {
    const { id } = await context.params;
    if (isPublicationOnly) {
      await setCoursePublication(
        getDatabase(),
        access.session,
        id,
        body.status as PublicationStatus,
      );
      return noStoreJson({ version: "course-v1", id, status: body.status });
    }
    await updateCourse(
      getDatabase(),
      access.session,
      id,
      {
        slug: body.slug as string,
        title: (body.title as string).trim(),
        description: (body.description as string).trim(),
        status: body.status as PublicationStatus,
      },
      { requestId: request.headers.get("x-vercel-id") ?? undefined },
    );
    return noStoreJson({
      version: "course-v1",
      id,
      slug: body.slug,
      title: (body.title as string).trim(),
      description: (body.description as string).trim(),
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
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    Object.keys(body).length !== 1 ||
    !hasExactKeys(body, ["confirmationTitle"]) ||
    !isBoundedText(body.confirmationTitle, 2, 120)
  ) {
    return courseError(400, "INVALID_INPUT", "Введите название курса для подтверждения.");
  }
  try {
    const { id } = await context.params;
    await deleteCourse(
      getDatabase(),
      access.session,
      id,
      (body.confirmationTitle as string).trim(),
      { requestId: request.headers.get("x-vercel-id") ?? undefined },
    );
    return noStoreJson({ version: "course-v1", id, deleted: true });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
