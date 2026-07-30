import "server-only";

import {
  getTimewebProvisioningPreview,
  type TimewebDeploySelection,
  type TimewebProvisioningPlan,
  type TimewebProvisioningPreview,
} from "./timeweb/provisioning";
import {
  readCloudProviderRuntime,
  type CloudProviderId,
} from "./runtime";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;
type PreviewOptions = Readonly<{
  selection?: Partial<TimewebDeploySelection>;
  approvedOwnedPublicIp?: {
    externalId: string;
    address: string;
  };
}>;
type PreviewLoader = (
  environment: ServerEnvironment,
  fetchImpl: typeof fetch,
  options: PreviewOptions,
) => Promise<TimewebProvisioningPreview>;
export type CloudProvisioningPlan = Omit<
  TimewebProvisioningPlan,
  "projectId" | "sshKeyId"
>;
export type CloudProvisioningPreview =
  | Readonly<{
      ok: true;
      mode: "fake" | "timeweb";
      catalog: Extract<TimewebProvisioningPreview, { ok: true }>["catalog"];
      plan: CloudProvisioningPlan;
    }>
  | Extract<TimewebProvisioningPreview, { ok: false }>;

const PREVIEW_LOADERS: Readonly<Record<CloudProviderId, PreviewLoader>> = {
  timeweb: getTimewebProvisioningPreview,
};

/**
 * Provider-neutral orchestration entry point. Future adapters implement the
 * normalized provisioning contract and are registered here; API routes and UI
 * do not import provider credentials or provider-specific runtime gates.
 */
export async function getCloudProvisioningPreview(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
  options: PreviewOptions = {},
): Promise<TimewebProvisioningPreview> {
  const runtime = readCloudProviderRuntime(environment);
  if (runtime.mode === "fake") {
    return getTimewebProvisioningPreview(environment, fetchImpl, options);
  }
  if (runtime.mode === "blocked") {
    return {
      ok: false,
      code: "MUTATION_GATE_CLOSED",
      message: "Cloud provider не настроен для production.",
    };
  }
  return PREVIEW_LOADERS[runtime.provider](environment, fetchImpl, options);
}

export function toPublicCloudProvisioningPreview(
  preview: TimewebProvisioningPreview,
): CloudProvisioningPreview {
  if (!preview.ok) return preview;
  const plan = { ...preview.plan };
  Reflect.deleteProperty(plan, "projectId");
  Reflect.deleteProperty(plan, "sshKeyId");
  return { ...preview, plan };
}
