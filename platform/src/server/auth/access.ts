import "server-only";

import { getDatabase } from "../db/client";
import { hasFreshReauthentication, hasPermission } from "./rbac";
import { sessionTokenFromRequest } from "./request";
import { getSessionByToken, type AuthSession } from "./service";

export type AccessResult =
  | { ok: true; session: AuthSession }
  | { ok: false; response: Response };

function errorResponse(status: 401 | 403): Response {
  return Response.json(
    { error: status === 401 ? "Требуется вход." : "Доступ запрещён." },
    {
      status,
      headers: { "cache-control": "no-store" },
    },
  );
}

export async function requireSession(request: Request): Promise<AccessResult> {
  const session = await getSessionByToken(
    getDatabase(),
    sessionTokenFromRequest(request),
  );
  return session
    ? { ok: true, session }
    : { ok: false, response: errorResponse(401) };
}

export async function requireAdmin(request: Request): Promise<AccessResult> {
  const result = await requireSession(request);
  if (!result.ok) {
    return result;
  }
  if (!hasPermission(result.session.role, "admin:access")) {
    return { ok: false, response: errorResponse(403) };
  }
  return result;
}

export async function requireFreshAdmin(request: Request): Promise<AccessResult> {
  const result = await requireAdmin(request);
  if (!result.ok) {
    return result;
  }
  if (!hasFreshReauthentication(result.session.reauthenticatedAt)) {
    return {
      ok: false,
      response: Response.json(
        { error: "Требуется повторная аутентификация." },
        { status: 403, headers: { "cache-control": "no-store" } },
      ),
    };
  }
  return result;
}
