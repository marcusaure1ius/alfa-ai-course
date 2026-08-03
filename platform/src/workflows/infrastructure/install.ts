import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  bootstrappingInstallStep,
  completeInstallStep,
  configureInstallDnsStep,
  installHealthCheckStep,
  installServerStep,
  issuingInstallTlsStep,
  reconcileInstallationStep,
  waitingInstallDnsStep,
} from "./steps";

export async function installEnvironmentWorkflow(command: WorkflowCommand) {
  "use workflow";
  await configureInstallDnsStep(command);
  await waitingInstallDnsStep(command);
  await installServerStep(command);
  await reconcileInstallationStep(command);
  await bootstrappingInstallStep(command);
  await issuingInstallTlsStep(command);
  await installHealthCheckStep(command);
  await completeInstallStep(command);
  return { status: "ready_owner_setup_required" as const };
}
