import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  completeCreateStep,
  configureDnsStep,
  createServerStep,
  reconcileServerStep,
  providerSliceStep,
  reserveIpStep,
  verifyTlsStep,
} from "./steps";

export async function createEnvironmentWorkflow(command: WorkflowCommand) {
  "use workflow";
  await reserveIpStep(command);
  await createServerStep(command);
  if ((await providerSliceStep(command)) === "production-1a") {
    await reconcileServerStep(command);
    await completeCreateStep(command);
    return { status: "active" as const };
  }
  if ((await configureDnsStep(command)) === "degraded") {
    return { status: "degraded" as const };
  }
  if ((await verifyTlsStep(command)) === "degraded") {
    return { status: "degraded" as const };
  }
  await completeCreateStep(command);
  return { status: "active" as const };
}
