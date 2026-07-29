import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  completeCreateStep,
  configureDnsStep,
  createServerStep,
  reserveIpStep,
  verifyTlsStep,
} from "./steps";

export async function createEnvironmentWorkflow(command: WorkflowCommand) {
  "use workflow";
  await reserveIpStep(command);
  await createServerStep(command);
  if ((await configureDnsStep(command)) === "degraded") {
    return { status: "degraded" as const };
  }
  if ((await verifyTlsStep(command)) === "degraded") {
    return { status: "degraded" as const };
  }
  await completeCreateStep(command);
  return { status: "active" as const };
}
