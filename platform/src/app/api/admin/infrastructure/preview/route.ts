import { requireAdmin } from "@/server/auth/access";
import { getTimewebProvisioningPreview } from "@/server/providers/timeweb/provisioning";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;

  const preview = await getTimewebProvisioningPreview();
  return Response.json(preview, {
    status: preview.ok ? 200 : 424,
    headers: { "cache-control": "no-store" },
  });
}
