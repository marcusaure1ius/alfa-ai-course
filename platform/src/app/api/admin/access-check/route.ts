import { requireAdmin } from "@/server/auth/access";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }
  return Response.json(
    { ok: true, role: access.session.role },
    { headers: { "cache-control": "no-store" } },
  );
}
