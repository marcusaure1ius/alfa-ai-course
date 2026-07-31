import "server-only";

import {
  COURSE_HOSTNAME,
  STARTER_KIT_BOOTSTRAP_PROFILE,
} from "./bootstrap-profile";
import { createTimewebReadAdapter } from "./read-service";

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export type TimewebInstallTarget = Readonly<{
  provider: "fake-timeweb" | "timeweb";
  serverExternalId: string;
  publicIpExternalId: string;
  publicIpv4: string;
  sshKeyId: number;
}>;

export type TimewebInstallPlan = Readonly<{
  version: "timeweb-install-v1";
  deploymentMode: "starter-kit-reinstall";
  checkedAt: string;
  operatingSystemId: number;
  operatingSystemLabel: "Ubuntu 24.04 LTS x86_64";
  sshKeyId: number;
  hostname: typeof COURSE_HOSTNAME;
  profileVersion: typeof STARTER_KIT_BOOTSTRAP_PROFILE.version;
  release: typeof STARTER_KIT_BOOTSTRAP_PROFILE.release;
  installerUrl: typeof STARTER_KIT_BOOTSTRAP_PROFILE.installerUrl;
  installerSha256: typeof STARTER_KIT_BOOTSTRAP_PROFILE.installerSha256;
}>;

export type TimewebInstallPreview =
  | Readonly<{ ok: true; mode: "fake" | "timeweb"; plan: TimewebInstallPlan }>
  | Readonly<{
      ok: false;
      code:
        | "MUTATION_GATE_CLOSED"
        | "ACCOUNT_BLOCKED"
        | "CATALOG_DEGRADED"
        | "TARGET_SERVER_INVALID"
        | "PUBLIC_IP_OWNERSHIP_INVALID"
        | "PROVIDER_SSH_KEY_UNAVAILABLE"
        | "UBUNTU_2404_UNAVAILABLE";
      message: string;
    }>;

function positiveInteger(value: string): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function getTimewebInstallPreview(
  environment: ServerEnvironment = process.env,
  fetchImpl: typeof fetch = fetch,
  target: TimewebInstallTarget,
): Promise<TimewebInstallPreview> {
  const { runtime, adapter } = createTimewebReadAdapter(environment, fetchImpl);
  if (!adapter) {
    return {
      ok: false,
      code: "MUTATION_GATE_CLOSED",
      message: "Установка n8n временно недоступна.",
    };
  }
  const catalog = await adapter.discover();
  if (catalog.account.state !== "ready") {
    return {
      ok: false,
      code: "ACCOUNT_BLOCKED",
      message: "Timeweb account заблокирован для переустановки сервера.",
    };
  }
  if (catalog.degraded) {
    return {
      ok: false,
      code: "CATALOG_DEGRADED",
      message: "Provider catalog устарел; разрушительная операция запрещена.",
    };
  }

  if (runtime.mode !== "fake") {
    const servers = catalog.servers.filter(
      (server) => server.id === target.serverExternalId,
    );
    if (
      target.provider !== "timeweb" ||
      servers.length !== 1 ||
      servers[0]?.status.state !== "supported" ||
      !["on", "off"].includes(servers[0].status.value)
    ) {
      return {
        ok: false,
        code: "TARGET_SERVER_INVALID",
        message: "Owned VPS отсутствует или не готов к переустановке.",
      };
    }
    const publicIps = catalog.floatingIps.filter(
      (candidate) => candidate.id === target.publicIpExternalId,
    );
    const publicIp = publicIps[0];
    if (
      publicIps.length !== 1 ||
      !publicIp ||
      publicIp.address !== target.publicIpv4 ||
      publicIp.resourceType !== "server" ||
      publicIp.resourceId !== target.serverExternalId
    ) {
      return {
        ok: false,
        code: "PUBLIC_IP_OWNERSHIP_INVALID",
        message: "Owned floating IP не привязан к выбранному VPS.",
      };
    }
    if (!catalog.sshKeys.some((key) => key.id === String(target.sshKeyId))) {
      return {
        ok: false,
        code: "PROVIDER_SSH_KEY_UNAVAILABLE",
        message: "SSH-ключ исходного VPS отсутствует в Timeweb catalog.",
      };
    }
  }

  const ubuntu2404 = catalog.operatingSystems
    .filter(
      (candidate) =>
        candidate.family.toLowerCase() === "linux" &&
        candidate.name.trim().toLowerCase() === "ubuntu" &&
        candidate.version.startsWith("24.04"),
    )
    .map((candidate) => ({
      id: positiveInteger(candidate.id),
      version: candidate.version,
    }))
    .filter(
      (candidate): candidate is { id: number; version: string } =>
        candidate.id !== null,
    );
  if (ubuntu2404.length !== 1) {
    return {
      ok: false,
      code: "UBUNTU_2404_UNAVAILABLE",
      message: "В актуальном Timeweb catalog нет однозначной Ubuntu 24.04 x86_64.",
    };
  }

  return {
    ok: true,
    mode: catalog.source,
    plan: {
      version: "timeweb-install-v1",
      deploymentMode: "starter-kit-reinstall",
      checkedAt: catalog.checkedAt,
      operatingSystemId: ubuntu2404[0].id,
      operatingSystemLabel: "Ubuntu 24.04 LTS x86_64",
      sshKeyId: target.sshKeyId,
      hostname: COURSE_HOSTNAME,
      profileVersion: STARTER_KIT_BOOTSTRAP_PROFILE.version,
      release: STARTER_KIT_BOOTSTRAP_PROFILE.release,
      installerUrl: STARTER_KIT_BOOTSTRAP_PROFILE.installerUrl,
      installerSha256: STARTER_KIT_BOOTSTRAP_PROFILE.installerSha256,
    },
  };
}
