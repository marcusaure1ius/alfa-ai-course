import { requireSession } from "@/server/auth/access";
import { COURSE_API_VERSION } from "@/server/course/contracts";
import { noStoreJson } from "@/server/course/http";
import { getStudentMaterial } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ material: string }> },
): Promise<Response> {
  const access = await requireSession(request);
  if (!access.ok) return access.response;
  const { material: slug } = await context.params;
  const material = await getStudentMaterial(
    getDatabase(),
    access.session.userId,
    slug,
  );
  return material
    ? noStoreJson({ version: COURSE_API_VERSION, material })
    : noStoreJson(
        { error: { code: "NOT_FOUND", message: "Материал не найден." } },
        404,
      );
}
