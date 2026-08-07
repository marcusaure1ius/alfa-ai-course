import { requireSession } from "@/server/auth/access";
import { noStoreJson } from "@/server/course/http";
import { getDatabase } from "@/server/db/client";
import {
  clearAcceptedN8nInvite,
  getStudentN8nAccess,
} from "@/server/tools/student-access";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireSession(request);
  if (!access.ok) return access.response;
  const sql = getDatabase();
  let toolAccess = await getStudentN8nAccess(sql, access.session.userId);
  // Ученик нажимает «Проверить состояние» как раз вернувшись из n8n с уже
  // заданным паролем. Спрашиваем инстанс только в этом состоянии, чтобы
  // остальные проверки оставались чтением из базы.
  if (
    toolAccess.state === "invite_pending" &&
    (await clearAcceptedN8nInvite(sql, access.session.userId))
  ) {
    toolAccess = await getStudentN8nAccess(sql, access.session.userId);
  }
  return noStoreJson({ version: "student-tools-v1", tool: toolAccess });
}
