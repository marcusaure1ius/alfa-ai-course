import { requireSession } from "@/server/auth/access";
import { expiredSessionCookie } from "@/server/auth/cookies";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { revokeAllUserSessions } from "@/server/auth/service";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return Response.json({ error: "Запрос отклонён." }, { status: 403 });
  }
  const access = await requireSession(request);
  if (!access.ok) {
    return access.response;
  }

  const revokedCount = await revokeAllUserSessions(getDatabase(), access.session);
  return Response.json(
    { revokedCount },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": expiredSessionCookie(),
      },
    },
  );
}
