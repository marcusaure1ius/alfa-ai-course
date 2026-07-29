import "server-only";

import { createHmac } from "node:crypto";

import { CSRF_COOKIE_NAME, getAppOrigin, getAuthSecret } from "./config";
import { createOpaqueToken, safeEqual } from "./crypto";
import { readCookie } from "./cookies";

function signature(nonce: string): string {
  return createHmac("sha256", getAuthSecret()).update(`csrf:${nonce}`).digest("base64url");
}

export function issueCsrfToken(): { nonce: string; token: string } {
  const nonce = createOpaqueToken();
  return { nonce, token: `${nonce}.${signature(nonce)}` };
}

export function verifyCsrfRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== getAppOrigin()) {
    return false;
  }

  const token = request.headers.get("x-csrf-token");
  const cookieNonce = readCookie(request.headers.get("cookie"), CSRF_COOKIE_NAME);
  if (!token || !cookieNonce) {
    return false;
  }

  const separator = token.lastIndexOf(".");
  if (separator === -1) {
    return false;
  }
  const nonce = token.slice(0, separator);
  const receivedSignature = token.slice(separator + 1);
  return (
    safeEqual(nonce, cookieNonce) &&
    safeEqual(receivedSignature, signature(nonce))
  );
}
