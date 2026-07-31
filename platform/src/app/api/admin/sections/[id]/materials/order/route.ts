import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import {
  courseError,
  courseRepositoryError,
  hasExactKeys,
  noStoreJson,
} from "@/server/course/http";
import { reorderSectionMaterials } from "@/server/course/repository";
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
    !hasExactKeys(body, ["materialIds"]) ||
    !Array.isArray(body.materialIds) ||
    body.materialIds.length > 500 ||
    !body.materialIds.every(
      (value) => typeof value === "string" && value.length <= 100,
    )
  ) {
    return courseError(400, "INVALID_INPUT", "Передайте полный порядок материалов.");
  }
  try {
    const { id: sectionId } = await context.params;
    await reorderSectionMaterials(
      getDatabase(),
      access.session,
      sectionId,
      body.materialIds,
      { requestId: request.headers.get("x-vercel-id") ?? undefined },
    );
    return noStoreJson({
      version: "course-v1",
      sectionId,
      materialIds: body.materialIds,
    });
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
