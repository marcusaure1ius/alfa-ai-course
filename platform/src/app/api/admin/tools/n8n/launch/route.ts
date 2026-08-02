import { requireAdmin } from "@/server/auth/access";
import { getDatabase } from "@/server/db/client";
import {
  createN8nGatewayExchangeResponse,
  issueN8nGatewayTicket,
  N8nGatewayError,
} from "@/server/tools/n8n-gateway";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const environmentId = new URL(request.url).searchParams.get("environmentId") ?? undefined;
  try {
    const ticket = await issueN8nGatewayTicket(
      getDatabase(),
      access.session,
      environmentId,
    );
    return createN8nGatewayExchangeResponse(ticket);
  } catch (error) {
    if (error instanceof N8nGatewayError) {
      return Response.json(
        { error: "Среда пока не готова к безопасному входу." },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }
}
