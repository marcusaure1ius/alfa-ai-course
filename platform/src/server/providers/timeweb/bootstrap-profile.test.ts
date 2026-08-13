import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  buildStarterKitCloudInit,
  COURSE_HOSTNAME,
  COURSE_SERVER_HOSTNAME,
  COURSE_SITE_VERIFICATION_FILE,
  STARTER_KIT_BOOTSTRAP_PROFILE,
} from "./bootstrap-profile";

process.env.AUTH_SECRET = "bootstrap-example-not-a-secret-32-characters";

const execFileAsync = promisify(execFile);

function extractBootstrapScript(cloudInit: string): string {
  const content = cloudInit
    .split("  - path: /etc/systemd/system/neurokurs-bootstrap.service", 1)[0]
    ?.split("    content: |\n", 2)[1];
  if (!content) throw new Error("BOOTSTRAP_SCRIPT_NOT_FOUND");
  return content
    .split("\n")
    .map((line) => (line.startsWith("      ") ? line.slice(6) : line))
    .join("\n")
    .trimEnd();
}

function skipManagedGatewayInHarness(script: string): string {
  return script.replace(
    /phase=configuring_managed_gateway[\s\S]*?up -d --wait --wait-timeout 300\nchmod 0600 "\$log_file"\ntrim_log/,
    "true",
  );
}

describe("starter kit bootstrap profile", () => {
  it("pins the installer and automatically configures the managed gateway", () => {
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
    expect(cloudInit).toContain("phase=configuring_managed_gateway");
    expect(cloudInit).toContain("docker-compose.platform.yml");
    expect(cloudInit).toContain("N8N_GATE_MANAGEMENT_SECRET=");
    // T-0123: подтверждение владения привязано к аккаунту владельца, поэтому
    // имя файла живёт здесь и попадает только на COURSE_HOSTNAME, а не в общий
    // релизный артефакт. Пустым оно приходить не должно: пустая переменная
    // оставляет в Caddy матчер `/` и перехватывает корень сайта.
    expect(COURSE_SITE_VERIFICATION_FILE).not.toBe("");
    expect(cloudInit).toContain(
      `SITE_VERIFICATION_FILE=%s\\n' '${COURSE_SITE_VERIFICATION_FILE}'`,
    );
    // ADR-0016: forward_auth убран, поэтому origin платформы на VPS не пишется.
    expect(cloudInit).not.toContain("PLATFORM_GATE_ORIGIN");
    expect(cloudInit).not.toContain(process.env.AUTH_SECRET!);
  });

  it("runs bootstrap as a bounded restartable systemd service", () => {
    const cloudInit = buildStarterKitCloudInit();

    expect(cloudInit).toContain(
      "path: /etc/systemd/system/neurokurs-bootstrap.service",
    );
    expect(cloudInit).toContain("After=network-online.target");
    expect(cloudInit).toContain("Restart=on-failure");
    expect(cloudInit).toContain("RestartPreventExitStatus=78");
    expect(cloudInit).toContain(
      `StartLimitIntervalSec=${STARTER_KIT_BOOTSTRAP_PROFILE.retryIntervalSeconds}`,
    );
    expect(cloudInit).toContain(
      `StartLimitBurst=${STARTER_KIT_BOOTSTRAP_PROFILE.retryBurst}`,
    );
    expect(cloudInit).toContain(
      `RestartSec=${STARTER_KIT_BOOTSTRAP_PROFILE.retryDelaySeconds}s`,
    );
    expect(cloudInit).toContain(
      `TimeoutStartSec=${STARTER_KIT_BOOTSTRAP_PROFILE.serviceTimeoutSeconds}s`,
    );
    expect(cloudInit).toContain(
      '["systemctl", "start", "--no-block", "neurokurs-bootstrap.service"]',
    );
    expect(cloudInit).not.toContain("Restart=always");
    expect(cloudInit).not.toContain(
      'runcmd:\n  - ["/usr/local/sbin/neurokurs-bootstrap"]',
    );
  });

  it("persists redacted bounded diagnostics for safe resume", () => {
    const cloudInit = buildStarterKitCloudInit();

    expect(cloudInit).toContain('attempt_file="$state_dir/attempts"');
    expect(cloudInit).toContain("attempt=$((attempt + 1))");
    expect(cloudInit).toContain(
      `if [ "$attempt" -ge ${STARTER_KIT_BOOTSTRAP_PROFILE.maxAttempts} ]`,
    );
    expect(cloudInit).toContain("error_stage=retry_budget_exhausted");
    expect(cloudInit).toContain("error_stage=%s");
    expect(cloudInit).toContain("[REDACTED-IP]");
    expect(cloudInit).toContain("[REDACTED]");
    expect(cloudInit).toContain(
      `tail -c ${STARTER_KIT_BOOTSTRAP_PROFILE.maxLogBytes}`,
    );
    expect(cloudInit).toContain('if [ -f "$state_dir/succeeded" ]');
    expect(cloudInit).toContain(
      'install -m 0600 /dev/null "$state_dir/succeeded"',
    );
    expect(cloudInit).toContain("write_status ready_owner_setup_required");
    expect(cloudInit).not.toContain('sh "$installer" >"$log_file" 2>&1');
  });

  it("recovers only a pinned installer image-pull rate limit through a pinned mirror", () => {
    const cloudInit = buildStarterKitCloudInit();

    expect(STARTER_KIT_BOOTSTRAP_PROFILE.version).toBe("starter-kit-v0.1.16");
    expect(cloudInit).toContain('if [ "$installer_code" -ne 23 ]');
    expect(cloudInit).toContain("grep -Fq '429 Too Many Requests'");
    expect(cloudInit).toContain("phase=recovering_registry_rate_limit");
    expect(cloudInit).toContain(
      "docker pull mirror.gcr.io/library/postgres:17.10-bookworm",
    );
    expect(cloudInit).toContain(
      "docker pull mirror.gcr.io/library/caddy:2.11.4-alpine",
    );
    expect(cloudInit).toContain(
      `docker pull mirror.gcr.io/n8nio/n8n:${STARTER_KIT_BOOTSTRAP_PROFILE.n8nVersion}`,
    );
    expect(cloudInit).toContain(
      `docker tag mirror.gcr.io/n8nio/n8n:${STARTER_KIT_BOOTSTRAP_PROFILE.n8nVersion} docker.n8n.io/n8nio/n8n:${STARTER_KIT_BOOTSTRAP_PROFILE.n8nVersion}`,
    );
    expect(cloudInit).toContain(
      'docker compose --project-directory "$project_dir" --env-file "$project_dir/.env" up -d --wait --wait-timeout 300',
    );
    expect(cloudInit).toContain(
      '"$project_dir/scripts/doctor.sh" --env-file "$project_dir/.env" --local-only',
    );
  });

  it("resumes the same bootstrap after a transient installer failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "t0058-bootstrap-"));
    const state = join(root, "state");
    const log = join(root, "bootstrap.log");
    const bin = join(root, "bin");
    const scriptPath = join(root, "bootstrap");
    const installerFixture = join(root, "installer-fixture");
    await mkdir(bin);

    const script = skipManagedGatewayInHarness(
      extractBootstrapScript(buildStarterKitCloudInit()),
    )
      .replace(
        "state_dir=/var/lib/neurokurs-bootstrap",
        'state_dir="$HARNESS_STATE"',
      )
      .replace(
        "log_file=/var/log/neurokurs-bootstrap.log",
        'log_file="$HARNESS_LOG"',
      )
      .replace(
        /\/usr\/bin\/timeout \d+ \/bin\/bash -c\s+'until getent[^']+'/,
        "true",
      );
    expect(script).not.toContain("/usr/bin/timeout");
    await writeFile(scriptPath, script, { mode: 0o700 });
    await writeFile(
      installerFixture,
      `#!/bin/sh
if [ -f "$HARNESS_STATE/allow-success" ]; then
  printf 'installer completed\\n'
  exit 0
fi
printf 'password=example-value\\n'
exit 24
`,
      { mode: 0o700 },
    );
    await writeFile(join(bin, "apt-get"), "#!/bin/sh\nexit 0\n", {
      mode: 0o700,
    });
    await writeFile(
      join(bin, "curl"),
      `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    shift
    cp "$HARNESS_INSTALLER" "$1"
    exit 0
  fi
  shift
done
exit 2
`,
      { mode: 0o700 },
    );
    await writeFile(join(bin, "sha256sum"), "#!/bin/sh\nexit 0\n", {
      mode: 0o700,
    });
    await Promise.all(
      ["apt-get", "curl", "sha256sum"].map((name) =>
        chmod(join(bin, name), 0o700),
      ),
    );

    const environment = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      HARNESS_STATE: state,
      HARNESS_LOG: log,
      HARNESS_INSTALLER: installerFixture,
    };
    await expect(
      execFileAsync("/bin/bash", [scriptPath], { env: environment }),
    ).rejects.toMatchObject({ code: 24 });
    expect(await readFile(join(state, "status"), "utf8")).toBe(
      `phase=failed\nprofile=${STARTER_KIT_BOOTSTRAP_PROFILE.version}\nattempt=1\nexit_code=24\nerror_stage=installing\n`,
    );
    expect(await readFile(log, "utf8")).toContain("password=[REDACTED]");
    expect(await readFile(log, "utf8")).not.toContain("example-value");

    await writeFile(join(state, "allow-success"), "");
    await execFileAsync("/bin/bash", [scriptPath], { env: environment });
    expect(await readFile(join(state, "status"), "utf8")).toBe(
      `phase=ready_owner_setup_required\nprofile=${STARTER_KIT_BOOTSTRAP_PROFILE.version}\nattempt=2\n`,
    );
    expect((await stat(join(state, "succeeded"))).mode & 0o777).toBe(0o600);

    await execFileAsync("/bin/bash", [scriptPath], { env: environment });
    expect(await readFile(join(state, "attempts"), "utf8")).toBe("2\n");
  });

  it("completes the same attempt through the pinned mirror after exit 23 and 429", async () => {
    const root = await mkdtemp(join(tmpdir(), "t0058-bootstrap-mirror-"));
    const state = join(root, "state");
    const log = join(root, "bootstrap.log");
    const bin = join(root, "bin");
    const project = join(root, "project");
    const scriptPath = join(root, "bootstrap");
    const installerFixture = join(root, "installer-fixture");
    await mkdir(bin);
    await mkdir(join(project, "scripts"), { recursive: true });
    await writeFile(join(project, ".env"), "N8N_HOST=example.invalid\n", {
      mode: 0o600,
    });
    await writeFile(
      join(project, "scripts", "doctor.sh"),
      "#!/bin/sh\nprintf 'doctor passed\\n'\n",
      { mode: 0o700 },
    );

    const script = skipManagedGatewayInHarness(
      extractBootstrapScript(buildStarterKitCloudInit()),
    )
      .replace(
        "state_dir=/var/lib/neurokurs-bootstrap",
        'state_dir="$HARNESS_STATE"',
      )
      .replace(
        "log_file=/var/log/neurokurs-bootstrap.log",
        'log_file="$HARNESS_LOG"',
      )
      .replace(
        "project_dir=/opt/n8n-entrepreneur-starter-kit",
        'project_dir="$HARNESS_PROJECT"',
      )
      .replace(
        /\/usr\/bin\/timeout \d+ \/bin\/bash -c\s+'until getent[^']+'/,
        "true",
      );
    await writeFile(scriptPath, script, { mode: 0o700 });
    await writeFile(
      installerFixture,
      "#!/bin/sh\nprintf '429 Too Many Requests\\n'\nexit 23\n",
      { mode: 0o700 },
    );
    await writeFile(join(bin, "apt-get"), "#!/bin/sh\nexit 0\n", {
      mode: 0o700,
    });
    await writeFile(
      join(bin, "curl"),
      `#!/bin/sh
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    shift
    cp "$HARNESS_INSTALLER" "$1"
    exit 0
  fi
  shift
done
exit 2
`,
      { mode: 0o700 },
    );
    await writeFile(join(bin, "sha256sum"), "#!/bin/sh\nexit 0\n", {
      mode: 0o700,
    });
    await writeFile(
      join(bin, "docker"),
      "#!/bin/sh\nprintf 'docker %s\\n' \"$*\"\n",
      { mode: 0o700 },
    );

    const environment = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      HARNESS_STATE: state,
      HARNESS_LOG: log,
      HARNESS_INSTALLER: installerFixture,
      HARNESS_PROJECT: project,
    };
    await execFileAsync("/bin/bash", [scriptPath], { env: environment });

    expect(await readFile(join(state, "status"), "utf8")).toBe(
      `phase=ready_owner_setup_required\nprofile=${STARTER_KIT_BOOTSTRAP_PROFILE.version}\nattempt=1\n`,
    );
    const output = await readFile(log, "utf8");
    expect(output).toContain(
      "docker pull mirror.gcr.io/library/postgres:17.10-bookworm",
    );
    expect(output).toContain(
      `docker tag mirror.gcr.io/n8nio/n8n:${STARTER_KIT_BOOTSTRAP_PROFILE.n8nVersion} docker.n8n.io/n8nio/n8n:${STARTER_KIT_BOOTSTRAP_PROFILE.n8nVersion}`,
    );
    expect(output).toContain("doctor passed");
    expect((await stat(join(state, "succeeded"))).mode & 0o777).toBe(0o600);
  });

  it("rejects a hostname outside the approved managed subdomain", () => {
    expect(() => buildStarterKitCloudInit("other.example.test")).toThrow(
      "BOOTSTRAP_HOSTNAME_NOT_ALLOWED",
    );
  });
});
