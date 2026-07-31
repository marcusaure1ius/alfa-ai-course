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
import { installEnvironmentWorkflow } from "../../workflows/infrastructure/install";

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
      const command = {
        operationId: candidate.operationId,
        scenario: candidate.scenario,
      };
      const run =
        candidate.kind === "create_environment"
          ? await start(createEnvironmentWorkflow, [command])
          : candidate.kind === "install_environment"
            ? await start(installEnvironmentWorkflow, [command])
            : await start(deleteEnvironmentWorkflow, [command]);
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
