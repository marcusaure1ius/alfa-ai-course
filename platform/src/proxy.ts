import { NextResponse, type NextRequest } from "next/server";

import {
  buildDocumentContentSecurityPolicy,
  createNonce,
} from "@/security-headers";
import { requireAdmin } from "@/server/auth/access";

export async function proxy(request: NextRequest): Promise<Response> {
  const nonce = createNonce();
  const contentSecurityPolicy = buildDocumentContentSecurityPolicy(nonce, {
    isDevelopment: process.env.NODE_ENV === "development",
  });

  if (request.nextUrl.pathname.startsWith("/admin")) {
    const access = await requireAdmin(request);
    if (!access.ok) {
      access.response.headers.set(
        "content-security-policy",
        contentSecurityPolicy,
      );
      return access.response;
    }
  }

  // Next.js читает nonce из заголовка запроса и сам проставляет его
  // framework-скриптам и собственным inline-вставкам при рендере.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    // Prefetch-запросы намеренно не исключены, хотя документация Next.js это
    // предлагает: этот proxy не только ставит заголовки, но и закрывает
    // `/admin`. Пропуск prefetch отдал бы RSC-данные админки без проверки
    // доступа.
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
