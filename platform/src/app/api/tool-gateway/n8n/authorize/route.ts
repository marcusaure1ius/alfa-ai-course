import { readCookie } from "@/server/auth/cookies";
import { getDatabase } from "@/server/db/client";
import {
  authorizeN8nGatewayRequest,
  N8N_GATE_COOKIE,
} from "@/server/tools/n8n-gateway";
import { getN8nStudentAccessLicenseGate } from "@/server/tools/student-access";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const token = readCookie(request.headers.get("cookie"), N8N_GATE_COOKIE);
  const allowed = await authorizeN8nGatewayRequest(
    getDatabase(),
    token,
    host,
    new Date(),
    getN8nStudentAccessLicenseGate().ready,
  );
  return new Response(null, {
    status: allowed ? 204 : 401,
    headers: { "cache-control": "no-store" },
  });
}
