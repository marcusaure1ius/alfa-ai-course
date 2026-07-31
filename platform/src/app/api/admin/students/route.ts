import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { createUser } from "@/server/auth/service";
import { courseError, hasExactKeys, noStoreJson } from "@/server/course/http";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return courseError(403, "CSRF", "Запрос отклонён.");
  }
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  if (
    !body ||
    !hasExactKeys(body, ["email", "password"]) ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.length > 320
  ) {
    return courseError(
      400,
      "INVALID_INPUT",
      "Укажите корректные email и временный пароль.",
    );
  }

  try {
    const studentId = await createUser(getDatabase(), access.session, {
      email: body.email,
      password: body.password,
      role: "student",
    });
    return noStoreJson({ version: "student-v1", studentId }, 201);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      return courseError(409, "EMAIL_EXISTS", "Аккаунт с таким email уже существует.");
    }
    if (error instanceof Error && error.message.startsWith("Пароль должен")) {
      return courseError(400, "INVALID_PASSWORD", error.message);
    }
    throw error;
  }
}
