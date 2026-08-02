import {
  authorizeCronMaintenance,
  authorizeReconciliationCron,
} from "@/server/cron/auth";
import { reconcileOrphanedFakeWorkflows } from "@/server/cron/reconcile";
import { getDatabase } from "@/server/db/client";
import { cleanupExpiredN8nInvites } from "@/server/tools/n8n-gateway";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const maintenanceAuthorization = authorizeCronMaintenance(request);
  if (!maintenanceAuthorization.ok) {
    return Response.json(
      {
        version: "cron-reconcile-v1",
        error: { code: maintenanceAuthorization.code },
      },
      {
        status: maintenanceAuthorization.status,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  const clearedN8nInvites = await cleanupExpiredN8nInvites(getDatabase());
  const authorization = authorizeReconciliationCron(request);
  if (!authorization.ok) {
    return Response.json(
      {
        version: "cron-reconcile-v1",
        clearedN8nInvites,
        error: { code: authorization.code },
      },
      {
        status: authorization.status,
        headers: { "cache-control": "no-store" },
      },
    );
  }

  const result = await reconcileOrphanedFakeWorkflows();
  const response = { ...result, clearedN8nInvites };
  console.info("cron.reconcile.completed", response);
  return Response.json(response, {
    headers: { "cache-control": "no-store" },
  });
}
