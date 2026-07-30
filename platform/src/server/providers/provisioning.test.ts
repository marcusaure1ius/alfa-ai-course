import { describe, expect, it } from "vitest";

import {
  getCloudProvisioningPreview,
  toPublicCloudProvisioningPreview,
} from "./provisioning";

describe("toPublicCloudProvisioningPreview", () => {
  it("keeps fake preview available while routing IDs stay server-side", async () => {
    const internal = await getCloudProvisioningPreview({
      VERCEL_ENV: "preview",
      PLATFORM_PROVIDER: "timeweb",
    });
    expect(internal).toMatchObject({
      ok: true,
      plan: { projectId: 1, sshKeyId: 1 },
    });

    const publicPreview = toPublicCloudProvisioningPreview(internal);
    expect(publicPreview.ok).toBe(true);
    expect(JSON.stringify(publicPreview)).not.toContain("projectId");
    expect(JSON.stringify(publicPreview)).not.toContain("sshKeyId");
  });
});
