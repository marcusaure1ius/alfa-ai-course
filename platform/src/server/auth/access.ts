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
  if (process.env.VERCEL_ENV === "production") {
    if (
      !result.session.mfaAuthenticatedAt ||
      !hasFreshReauthentication(result.session.mfaAuthenticatedAt)
    ) {
      return {
        ok: false,
        response: Response.json(
          { error: "Для production mutation требуется свежий MFA challenge." },
          { status: 403, headers: { "cache-control": "no-store" } },
        ),
      };
    }
    const factors = await getDatabase()<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM auth_factors
        WHERE user_id = ${result.session.userId}
          AND factor_type IN ('totp', 'webauthn')
          AND verified_at IS NOT NULL
          AND disabled_at IS NULL
      ) AS present
    `;
    if (!factors[0]?.present) {
      return {
        ok: false,
        response: Response.json(
          { error: "Для production mutation требуется подтверждённый MFA." },
          { status: 403, headers: { "cache-control": "no-store" } },
        ),
      };
    }
  }
  return result;
}
