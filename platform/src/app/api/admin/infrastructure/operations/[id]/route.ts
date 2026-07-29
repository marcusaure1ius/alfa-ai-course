import { requireAdmin } from "@/server/auth/access";
import { getDatabase } from "@/server/db/client";
import { operationError } from "@/server/operations/http";
import { getOperationTimeline } from "@/server/operations/repository";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const timeline = await getOperationTimeline(getDatabase(), (await context.params).id);
  if (!timeline) return operationError(400, "NOT_FOUND", "Операция не найдена.");
  return Response.json(timeline, {
    headers: { "cache-control": "no-store" },
  });
}
