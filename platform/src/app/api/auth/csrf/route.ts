import { csrfCookie } from "@/server/auth/cookies";
import { issueCsrfToken } from "@/server/auth/csrf";

export const runtime = "nodejs";

export function GET(): Response {
  const { nonce, token } = issueCsrfToken();
  return Response.json(
    { csrfToken: token },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": csrfCookie(nonce),
      },
    },
  );
}
