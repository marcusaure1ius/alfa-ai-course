import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import type { MaterialKind, PublicationStatus } from "@/server/course/contracts";
import {
  courseError,
  courseRepositoryError,
  isMaterialInput,
  noStoreJson,
} from "@/server/course/http";
import { createMaterial } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const { id: courseId } = await context.params;
  const materials = await getDatabase()<
    Array<{
      id: string;
      section_id: string;
      slug: string;
      kind: MaterialKind;
      title: string;
      summary: string;
      body_markdown: string;
      position: number;
      estimated_minutes: number | null;
      status: PublicationStatus;
      version: number;
      updated_at: Date;
    }>
  >`
    SELECT id, section_id, slug, kind, title, summary, body_markdown,
      position, estimated_minutes, status, version, updated_at
    FROM course_materials
    WHERE course_id = ${courseId}
    ORDER BY section_id, position
  `;
  return noStoreJson({
    version: "course-v1",
    materials: materials.map((material) => ({
      id: material.id,
      sectionId: material.section_id,
      slug: material.slug,
      kind: material.kind,
      title: material.title,
      summary: material.summary,
      bodyMarkdown: material.body_markdown,
      position: material.position,
      estimatedMinutes: material.estimated_minutes,
      status: material.status,
      version: material.version,
      updatedAt: material.updated_at.toISOString(),
    })),
  });
}

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
  if (!isMaterialInput(body)) {
    return courseError(400, "INVALID_INPUT", "Проверьте поля материала.");
  }
  try {
    const { id: courseId } = await context.params;
    const id = await createMaterial(
      getDatabase(),
      access.session,
      {
        courseId,
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
    return noStoreJson({ version: "course-v1", id }, 201);
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
