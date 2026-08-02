import { safeEqual } from "@/server/auth/crypto";
import { getDatabase } from "@/server/db/client";
import { exchangeN8nGatewayTicket, N8nGatewayError } from "@/server/tools/n8n-gateway";

export const runtime = "nodejs";

function forwardedHost(request: Request): string {
  return request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
}

export async function POST(request: Request): Promise<Response> {
  const expectedGatewaySecret = process.env.N8N_GATE_MANAGEMENT_SECRET;
  const presentedGatewaySecret = request.headers.get("x-neurokurs-gateway") ?? "";
  if (
    !expectedGatewaySecret ||
    expectedGatewaySecret.length < 32 ||
    !safeEqual(expectedGatewaySecret, presentedGatewaySecret)
  ) {
    return Response.json(
      { error: "Доступ к обмену закрыт." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    contentType !== "application/x-www-form-urlencoded" ||
    !Number.isFinite(contentLength) ||
    contentLength > 1_024
  ) {
    return Response.json(
      { error: "Некорректный запрос входа." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const body = await request.text();
  if (body.length > 1_024) {
    return Response.json(
      { error: "Некорректный запрос входа." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const ticket = new URLSearchParams(body).get("ticket") ?? "";
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
