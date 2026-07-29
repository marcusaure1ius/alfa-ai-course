import { expiredSessionCookie } from "@/server/auth/cookies";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { sessionTokenFromRequest } from "@/server/auth/request";
import { revokeSessionByToken } from "@/server/auth/service";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return Response.json({ error: "Запрос отклонён." }, { status: 403 });
  }

  await revokeSessionByToken(getDatabase(), sessionTokenFromRequest(request));
  return Response.json(
    { ok: true },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": expiredSessionCookie(),
      },
    },
  );
}
