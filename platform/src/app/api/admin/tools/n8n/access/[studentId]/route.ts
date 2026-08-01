import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { courseError, hasExactKeys, noStoreJson } from "@/server/course/http";
import { getDatabase } from "@/server/db/client";
import {
  setStudentN8nAccess,
  StudentToolAccessError,
} from "@/server/tools/student-access";

export const runtime = "nodejs";

function toolAccessError(error: unknown): Response | null {
  if (!(error instanceof StudentToolAccessError)) return null;
  const mapping = {
    FORBIDDEN: [403, "Доступ запрещён."],
    NOT_FOUND: [404, "Назначение не найдено."],
    INVALID_EXPIRY: [400, "Выберите будущую дату не дальше одного года."],
    LICENSE_GATE: [
      409,
      "В настройках сервера не указано подтверждение доступа к n8n.",
    ],
    ENVIRONMENT_NOT_READY: [
      409,
      "Среда инструмента или доступ к курсам ещё не готовы.",
    ],
  } as const;
  const [status, message] = mapping[error.code];
  return courseError(status, error.code, message);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ studentId: string }> },
): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return courseError(403, "CSRF", "Запрос отклонён.");
  }
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (
    !body ||
    !hasExactKeys(body, ["environmentId", "granted", "expiresAt"]) ||
    typeof body.environmentId !== "string" ||
    typeof body.granted !== "boolean" ||
    (body.expiresAt !== null && typeof body.expiresAt !== "string")
  ) {
    return courseError(400, "INVALID_INPUT", "Проверьте среду и срок доступа.");
  }
  const expiresAt =
    typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return courseError(400, "INVALID_INPUT", "Проверьте срок доступа.");
  }
  try {
    const { studentId } = await context.params;
    await setStudentN8nAccess(
      getDatabase(),
      access.session,
      {
        studentUserId: studentId,
        environmentId: body.environmentId,
        granted: body.granted,
        expiresAt,
      },
      { requestId: request.headers.get("x-vercel-id") ?? undefined },
    );
    return noStoreJson({ version: "student-tools-v1", studentId, granted: body.granted });
  } catch (error) {
    const response = toolAccessError(error);
    if (response) return response;
    throw error;
  }
}
