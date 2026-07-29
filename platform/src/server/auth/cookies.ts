import "server-only";

import {
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  isProductionEnvironment,
} from "./config";

type CookieOptions = {
  httpOnly: boolean;
  maxAge: number;
};

function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAge}`,
    "SameSite=Lax",
  ];

  if (options.httpOnly) {
    attributes.push("HttpOnly");
  }
  if (isProductionEnvironment()) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

export function sessionCookie(token: string): string {
  return serializeCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function csrfCookie(nonce: string): string {
  return serializeCookie(CSRF_COOKIE_NAME, nonce, {
    httpOnly: true,
    maxAge: 60 * 60,
  });
}

export function expiredSessionCookie(): string {
  return serializeCookie(SESSION_COOKIE_NAME, "", { httpOnly: true, maxAge: 0 });
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (pair.slice(0, separator).trim() === name) {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    }
  }
  return null;
}
