import { requireAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { checkTimewebConnection } from "@/server/providers/timeweb";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) {
    return Response.json(
      {
        version: "timeweb-read-v2",
        error: {
          code: "CSRF",
          message: "Запрос отклонён.",
          correlationId: crypto.randomUUID(),
        },
      },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;

  const result = await checkTimewebConnection();
  return Response.json(result, {
    status: result.ok ? 200 : result.error.retryable ? 503 : 424,
    headers: { "cache-control": "no-store" },
  });
}
