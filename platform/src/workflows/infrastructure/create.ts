import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  completeCreateStep,
  configureBackupsStep,
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
  const providerSlice = await providerSliceStep(command);
  if (providerSlice === "production-deploy") {
    await createServerStep(command);
    await reconcileServerStep(command);
    await configureBackupsStep(command);
    await completeCreateStep(command);
    return { status: "active" as const };
  }
  if ((await configureDnsStep(command)) === "degraded") {
    return { status: "degraded" as const };
  }
  await createServerStep(command);
  if ((await verifyTlsStep(command)) === "degraded") {
    return { status: "degraded" as const };
  }
  await completeCreateStep(command);
  return { status: "active" as const };
}
