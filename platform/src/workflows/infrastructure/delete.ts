import type { WorkflowCommand } from "@/server/operations/contracts";
import {
  completeDeleteStep,
  deleteResourceStep,
  resolveDnsAmbiguityStep,
  resolvePublicIpAmbiguityStep,
  resolveServerAmbiguityStep,
} from "./steps";

export async function deleteEnvironmentWorkflow(command: WorkflowCommand) {
  "use workflow";
  if (
    (await resolvePublicIpAmbiguityStep(command)) === "cleanup_required"
  ) {
    return { status: "cleanup_required" as const };
  }
  if ((await resolveServerAmbiguityStep(command)) === "cleanup_required") {
    return { status: "cleanup_required" as const };
  }
  if ((await resolveDnsAmbiguityStep(command)) === "cleanup_required") {
    return { status: "cleanup_required" as const };
  }
  if ((await deleteResourceStep(command, "dns_record", 10)) === "cleanup_required") {
    return { status: "cleanup_required" as const };
  }
  if ((await deleteResourceStep(command, "server", 20)) === "cleanup_required") {
    return { status: "cleanup_required" as const };
  }
  if ((await deleteResourceStep(command, "public_ip", 30)) === "cleanup_required") {
    return { status: "cleanup_required" as const };
  }
  await completeDeleteStep(command);
  return { status: "deleted" as const };
}
