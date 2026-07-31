import { requireSession } from "@/server/auth/access";
import { noStoreJson } from "@/server/course/http";
import { getDatabase } from "@/server/db/client";
import { getStudentN8nAccess } from "@/server/tools/student-access";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireSession(request);
  if (!access.ok) return access.response;
  const toolAccess = await getStudentN8nAccess(
    getDatabase(),
    access.session.userId,
  );
  return noStoreJson({ version: "student-tools-v1", tool: toolAccess });
}
