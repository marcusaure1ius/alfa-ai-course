import { requireAdmin } from "@/server/auth/access";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) {
    return access.response;
  }
  return Response.json(
    { ok: true, message: "Admin shell будет добавлен в следующей задаче." },
    { headers: { "cache-control": "no-store" } },
  );
}
