import { authorizeReconciliationCron } from "@/server/cron/auth";
import { reconcileOrphanedFakeWorkflows } from "@/server/cron/reconcile";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const authorization = authorizeReconciliationCron(request);
  if (!authorization.ok) {
    return Response.json(
      {
        version: "cron-reconcile-v1",
        error: { code: authorization.code },
      },
      {
        status: authorization.status,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  const result = await reconcileOrphanedFakeWorkflows();
  console.info("cron.reconcile.completed", result);
  return Response.json(result, {
    headers: { "cache-control": "no-store" },
  });
}
