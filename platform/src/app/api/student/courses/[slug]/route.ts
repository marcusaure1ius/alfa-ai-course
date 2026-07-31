import { requireSession } from "@/server/auth/access";
import { COURSE_API_VERSION } from "@/server/course/contracts";
import { noStoreJson } from "@/server/course/http";
import { getStudentCourse } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const access = await requireSession(request);
  if (!access.ok) return access.response;
  const { slug } = await context.params;
  const course = await getStudentCourse(getDatabase(), access.session.userId, slug);
  return course
    ? noStoreJson({ version: COURSE_API_VERSION, course })
    : noStoreJson({ error: { code: "NOT_FOUND", message: "Курс не найден." } }, 404);
}
