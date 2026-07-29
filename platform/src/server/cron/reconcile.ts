import "server-only";

import { start } from "@workflow/core/runtime";

import { getDatabase } from "../db/client";
import {
  attachReconciledWorkflowRun,
  claimOrphanedWorkflowOperations,
  releaseWorkflowReconciliationClaim,
} from "../operations/repository";
import { createEnvironmentWorkflow } from "../../workflows/infrastructure/create";
import { deleteEnvironmentWorkflow } from "../../workflows/infrastructure/delete";

export const CRON_RECONCILIATION_VERSION = "cron-reconcile-v1" as const;

export type CronReconciliationResult = Readonly<{
  version: typeof CRON_RECONCILIATION_VERSION;
  claimed: number;
  started: number;
  released: number;
}>;

export async function reconcileOrphanedFakeWorkflows(): Promise<CronReconciliationResult> {
  const sql = getDatabase();
  const candidates = await claimOrphanedWorkflowOperations(sql, 10);
  let started = 0;
  let released = 0;

  for (const candidate of candidates) {
    try {
      const run =
        candidate.kind === "create_environment"
          ? await start(createEnvironmentWorkflow, [
              {
                operationId: candidate.operationId,
                scenario: candidate.scenario,
              },
            ])
          : await start(deleteEnvironmentWorkflow, [
              {
                operationId: candidate.operationId,
                scenario: candidate.scenario,
              },
            ]);
      await attachReconciledWorkflowRun(
        sql,
        candidate.operationId,
        candidate.claimToken,
        run.runId,
      );
      started += 1;
    } catch {
      const wasReleased = await releaseWorkflowReconciliationClaim(
        sql,
        candidate.operationId,
        candidate.claimToken,
      );
      if (wasReleased) released += 1;
    }
  }

  return {
    version: CRON_RECONCILIATION_VERSION,
    claimed: candidates.length,
    started,
    released,
  };
}
