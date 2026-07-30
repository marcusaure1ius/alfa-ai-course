import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  bootstrappingStep,
  completeCreateStep,
  configureDnsStep,
  createServerStep,
  healthCheckStep,
  issuingTlsStep,
  reconcileServerStep,
  providerSliceStep,
  reserveIpStep,
  waitingDnsStep,
  verifyTlsStep,
} from "./steps";

export async function createEnvironmentWorkflow(command: WorkflowCommand) {
  "use workflow";
  await reserveIpStep(command);
  const providerSlice = await providerSliceStep(command);
  if ((await configureDnsStep(command)) === "degraded") {
    return { status: "degraded" as const };
  }
  if (providerSlice === "production-1a") {
    await createServerStep(command);
    await reconcileServerStep(command);
    if ((await bootstrappingStep(command)) === "degraded") {
      return { status: "degraded" as const };
    }
    if ((await waitingDnsStep(command)) === "degraded") {
      return { status: "degraded" as const };
    }
    if ((await issuingTlsStep(command)) === "degraded") {
      return { status: "degraded" as const };
    }
    if ((await healthCheckStep(command)) === "degraded") {
      return { status: "degraded" as const };
    }
    await completeCreateStep(command);
    return { status: "active" as const };
  }
  await createServerStep(command);
  if ((await verifyTlsStep(command)) === "degraded") {
    return { status: "degraded" as const };
  }
  await completeCreateStep(command);
  return { status: "active" as const };
}
