import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { createCourse } from "@/server/course/repository";
import {
  courseError,
  courseRepositoryError,
  hasExactKeys,
  isBoundedText,
  isSlug,
  noStoreJson,
} from "@/server/course/http";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const courses = await getDatabase()<
    Array<{
      id: string;
      slug: string;
      title: string;
      description: string;
      status: string;
      version: number;
      updated_at: Date;
    }>
  >`
    SELECT id, slug, title, description, status, version, updated_at
    FROM courses
    ORDER BY created_at
  `;
  return noStoreJson({
    version: "course-v1",
    courses: courses.map((course) => ({
      id: course.id,
      slug: course.slug,
      title: course.title,
      description: course.description,
      status: course.status,
      version: course.version,
      updatedAt: course.updated_at.toISOString(),
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return courseError(403, "CSRF", "Запрос отклонён.");
  }
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    !hasExactKeys(body, ["slug", "title", "description"]) ||
    !isSlug(body.slug) ||
    !isBoundedText(body.title, 2, 120) ||
    (body.description !== undefined && !isBoundedText(body.description, 0, 500))
  ) {
    return courseError(400, "INVALID_INPUT", "Проверьте название, адрес и описание курса.");
  }
  try {
    const id = await createCourse(getDatabase(), access.session, {
      slug: body.slug,
      title: body.title.trim(),
      description: typeof body.description === "string" ? body.description.trim() : "",
    });
    return noStoreJson({ version: "course-v1", id }, 201);
  } catch (error) {
    const response = courseRepositoryError(error);
    if (response) return response;
    throw error;
  }
}
