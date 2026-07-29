import "server-only";

import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "./config";
import { readCookie } from "./cookies";

export function sessionTokenFromRequest(request: Request): string | null {
  return readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
}

export function csrfNonceFromRequest(request: Request): string | null {
  return readCookie(request.headers.get("cookie"), CSRF_COOKIE_NAME);
}

export function requestContext(request: Request): {
  ipAddress: string;
  userAgent?: string;
  requestId?: string;
} {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwardedFor || "unknown",
    userAgent: request.headers.get("user-agent") ?? undefined,
    requestId: request.headers.get("x-vercel-id") ?? undefined,
  };
}
