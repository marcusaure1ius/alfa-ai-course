import { requireSession } from "@/server/auth/access";
import { getDatabase } from "@/server/db/client";
import {
  createN8nGatewayExchangeResponse,
  issueN8nGatewayTicket,
  N8nGatewayError,
} from "@/server/tools/n8n-gateway";
import { getN8nStudentAccessLicenseGate } from "@/server/tools/student-access";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireSession(request);
  if (!access.ok) return access.response;
  if (access.session.role !== "student" || !getN8nStudentAccessLicenseGate().ready) {
    return Response.json(
      { error: "Доступ к инструменту закрыт." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const ticket = await issueN8nGatewayTicket(getDatabase(), access.session);
    return createN8nGatewayExchangeResponse(ticket);
  } catch (error) {
    if (error instanceof N8nGatewayError) {
      return Response.redirect(
        new URL(
          "/student/tools/n8n?notice=launch-unavailable",
          request.url,
        ),
        303,
      );
    }
    throw error;
  }
}
