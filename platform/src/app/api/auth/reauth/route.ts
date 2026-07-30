import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { reauthenticateSession } from "@/server/auth/service";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return Response.json(
      { error: "Запрос отклонён." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const body = (await request.json().catch(() => null)) as {
    password?: unknown;
    mfaCode?: unknown;
  } | null;
  if (
    !body ||
    typeof body.password !== "string" ||
    (body.mfaCode !== undefined && typeof body.mfaCode !== "string")
  ) {
    return Response.json(
      { error: "Некорректный запрос." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const accepted = await reauthenticateSession(
    getDatabase(),
    access.session,
    {
      password: body.password,
      ...(typeof body.mfaCode === "string" ? { mfaCode: body.mfaCode } : {}),
    },
  );
  return Response.json(
    accepted ? { ok: true } : { error: "Пароль или второй фактор не подтверждены." },
    {
      status: accepted ? 200 : 403,
      headers: { "cache-control": "no-store" },
    },
  );
}
