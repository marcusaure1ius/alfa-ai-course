import { safeEqual } from "@/server/auth/crypto";
import { readCookie } from "@/server/auth/cookies";
import { getDatabase } from "@/server/db/client";
import { COURSE_HOSTNAME } from "@/server/providers/timeweb/bootstrap-profile";
import {
  authorizeN8nGatewayRequest,
  N8N_GATE_COOKIE,
} from "@/server/tools/n8n-gateway";
import { getN8nStudentAccessLicenseGate } from "@/server/tools/student-access";
import { getN8nGatewayManagementSecret } from "@/server/tools/n8n-managed-secret";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const expectedGatewaySecret = getN8nGatewayManagementSecret();
  const presentedGatewaySecret = request.headers.get("x-neurokurs-gateway") ?? "";
  if (!safeEqual(expectedGatewaySecret, presentedGatewaySecret)) {
    return new Response(null, {
      status: 403,
      headers: { "cache-control": "no-store" },
    });
  }
  const token = readCookie(request.headers.get("cookie"), N8N_GATE_COOKIE);
  const allowed = await authorizeN8nGatewayRequest(
    getDatabase(),
    token,
    COURSE_HOSTNAME,
    new Date(),
    getN8nStudentAccessLicenseGate().ready,
  );
  return new Response(null, {
    status: allowed ? 204 : 401,
    headers: { "cache-control": "no-store" },
  });
}
