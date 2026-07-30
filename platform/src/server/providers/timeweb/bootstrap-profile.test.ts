import { describe, expect, it } from "vitest";

import {
  buildStarterKitCloudInit,
  COURSE_HOSTNAME,
  COURSE_SERVER_HOSTNAME,
  STARTER_KIT_BOOTSTRAP_PROFILE,
} from "./bootstrap-profile";

describe("starter kit bootstrap profile", () => {
  it("pins an immutable installer and checksum without embedding secrets", () => {
    const cloudInit = buildStarterKitCloudInit();

    expect(cloudInit).toContain(
      `/releases/download/${STARTER_KIT_BOOTSTRAP_PROFILE.release}/install.sh`,
    );
    expect(cloudInit).toContain(
      STARTER_KIT_BOOTSTRAP_PROFILE.installerSha256,
    );
    expect(cloudInit).toContain(
      `/usr/bin/timeout ${STARTER_KIT_BOOTSTRAP_PROFILE.networkWaitSeconds}`,
    );
    expect(cloudInit).toContain("/dev/tcp/github.com/443");
    expect(cloudInit).toContain(
      `phase=failed\\nprofile=${STARTER_KIT_BOOTSTRAP_PROFILE.version}\\nexit_code=%s`,
    );
    expect(cloudInit).toContain("apt-get install -y ca-certificates curl");
    expect(cloudInit).toContain(`N8N_HOST='${COURSE_HOSTNAME}'`);
    expect(COURSE_SERVER_HOSTNAME).toMatch(/^[a-z0-9-]+$/);
    expect(COURSE_SERVER_HOSTNAME).not.toContain(".");
    expect(cloudInit).not.toContain("package_update:");
    expect(cloudInit).toContain("ready_owner_setup_required");
    expect(cloudInit).not.toContain("releases/latest");
    expect(cloudInit).not.toMatch(
      /TIMEWEB_API_TOKEN|N8N_ENCRYPTION_KEY=|POSTGRES_PASSWORD=/,
    );
  });

  it("rejects a hostname outside the approved managed subdomain", () => {
    expect(() => buildStarterKitCloudInit("other.example.test")).toThrow(
      "BOOTSTRAP_HOSTNAME_NOT_ALLOWED",
    );
  });
});
