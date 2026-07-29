import { sessionCookie } from "@/server/auth/cookies";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { requestContext } from "@/server/auth/request";
import { loginWithPassword } from "@/server/auth/service";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

type LoginBody = { email?: unknown; password?: unknown };

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return Response.json(
      { error: "Запрос отклонён." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  let body: LoginBody;
  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }
  if (
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    body.email.length > 320
  ) {
    return Response.json({ error: "Некорректный запрос." }, { status: 400 });
  }

  const result = await loginWithPassword(
    getDatabase(),
    { email: body.email, password: body.password },
    requestContext(request),
  );
  if (!result.ok) {
    const status = result.reason === "rate_limited" ? 429 : result.reason === "mfa_required" ? 403 : 401;
    const error =
      result.reason === "mfa_required"
        ? "Требуется подтверждённый второй фактор."
        : result.reason === "rate_limited"
          ? "Слишком много попыток. Повторите позже."
          : "Неверный email или пароль.";
    return Response.json(
      { error },
      { status, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(
    {
      user: {
        id: result.session.userId,
        email: result.session.email,
        role: result.session.role,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": sessionCookie(result.token),
      },
    },
  );
}
