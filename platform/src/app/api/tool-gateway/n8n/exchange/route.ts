import { getDatabase } from "@/server/db/client";
import { exchangeN8nGatewayTicket, N8nGatewayError } from "@/server/tools/n8n-gateway";

export const runtime = "nodejs";

function forwardedHost(request: Request): string {
  return request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
}

export async function GET(request: Request): Promise<Response> {
  const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
  try {
    const result = await exchangeN8nGatewayTicket(
      getDatabase(),
      ticket,
      forwardedHost(request),
    );
    return new Response(null, {
      status: 303,
      headers: {
        location: "/",
        "set-cookie": result.cookie,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    if (error instanceof N8nGatewayError) {
      return Response.json(
        { error: "Ссылка входа недействительна или уже использована." },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }
}
