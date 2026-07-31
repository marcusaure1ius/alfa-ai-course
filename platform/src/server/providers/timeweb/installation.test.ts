import { describe, expect, it } from "vitest";

import { STARTER_KIT_BOOTSTRAP_PROFILE } from "./bootstrap-profile";
import { getTimewebInstallPreview } from "./installation";

describe("Timeweb install plan", () => {
  it("selects only Ubuntu 24.04 and pins the exact release profile", async () => {
    const preview = await getTimewebInstallPreview(
      { PLATFORM_PROVIDER: "fake" },
      fetch,
      {
        provider: "fake-timeweb",
        serverExternalId: "fake-server",
        publicIpExternalId: "fake-ip",
        publicIpv4: "192.0.2.10",
        sshKeyId: 1,
      },
    );
    expect(preview).toEqual({
      ok: true,
      mode: "fake",
      plan: {
        version: "timeweb-install-v1",
        deploymentMode: "starter-kit-reinstall",
        checkedAt: expect.any(String),
        operatingSystemId: 201,
        operatingSystemLabel: "Ubuntu 24.04 LTS x86_64",
        sshKeyId: 1,
        hostname: "n8n.neurokurs.ru",
        profileVersion: STARTER_KIT_BOOTSTRAP_PROFILE.version,
        release: STARTER_KIT_BOOTSTRAP_PROFILE.release,
        installerUrl: STARTER_KIT_BOOTSTRAP_PROFILE.installerUrl,
        installerSha256: STARTER_KIT_BOOTSTRAP_PROFILE.installerSha256,
      },
    });
  });
});
