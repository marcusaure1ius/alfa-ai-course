import "server-only";

export const COURSE_HOSTNAME = "n8n.neurokurs.ru" as const;
export const COURSE_SERVER_HOSTNAME = "n8n-neurokurs-ru" as const;
export const COURSE_DNS_ZONE = "neurokurs.ru" as const;
export const COURSE_DNS_LABEL = "n8n" as const;
export const COURSE_DNS_TTL_SECONDS = 600 as const;

export const STARTER_KIT_BOOTSTRAP_PROFILE = Object.freeze({
  version: "starter-kit-v0.1.0",
  release: "v0.1.0",
  installerUrl:
    "https://github.com/marcusaure1ius/" +
    "n8n-entrepreneur-starter-kit/releases/download/v0.1.0/install.sh",
  installerSha256:
    "1757ab3011c84a0defd30d4fee8bb666a2e9138767cd450cd637b4fbad02e6f6",
  n8nVersion: "2.29.10",
  timezone: "Europe/Moscow",
  networkWaitSeconds: 1200,
} as const);

function shellSingleQuoted(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function buildStarterKitCloudInit(
  hostname: string = COURSE_HOSTNAME,
): string {
  if (hostname !== COURSE_HOSTNAME) {
    throw new Error("BOOTSTRAP_HOSTNAME_NOT_ALLOWED");
  }
  const profile = STARTER_KIT_BOOTSTRAP_PROFILE;
  const script = `#!/bin/sh
set -eu
umask 077
state_dir=/var/lib/neurokurs-bootstrap
status_file="$state_dir/status"
log_file=/var/log/neurokurs-bootstrap.log
installer="$state_dir/install.sh"
mkdir -p "$state_dir"
if [ -f "$state_dir/succeeded" ]; then
  exit 0
fi
printf 'phase=waiting_network\\nprofile=${profile.version}\\n' > "$status_file"
set +e
/usr/bin/timeout ${profile.networkWaitSeconds} /bin/bash -c \
  'until getent ahostsv4 github.com >/dev/null 2>&1 && (exec 3<>/dev/tcp/github.com/443) 2>/dev/null; do sleep 5; done'
network_code=$?
set -e
if [ "$network_code" -ne 0 ]; then
  printf 'phase=failed\\nprofile=${profile.version}\\nexit_code=%s\\n' "$network_code" > "$status_file"
  exit "$network_code"
fi
printf 'phase=preparing\\nprofile=${profile.version}\\n' > "$status_file"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl
printf 'phase=downloading\\nprofile=${profile.version}\\n' > "$status_file"
curl -fsSL ${shellSingleQuoted(profile.installerUrl)} -o "$installer"
chmod 0700 "$installer"
printf '%s  %s\\n' ${shellSingleQuoted(profile.installerSha256)} "$installer" |
  sha256sum -c - >/dev/null
printf 'phase=installing\\nprofile=${profile.version}\\n' > "$status_file"
if N8N_HOST=${shellSingleQuoted(hostname)} TIMEZONE=${shellSingleQuoted(profile.timezone)} \
  sh "$installer" >"$log_file" 2>&1; then
  printf 'phase=ready_owner_setup_required\\nprofile=${profile.version}\\n' > "$status_file"
  : > "$state_dir/succeeded"
else
  code=$?
  printf 'phase=failed\\nprofile=${profile.version}\\nexit_code=%s\\n' "$code" > "$status_file"
  exit "$code"
fi
`;
  return `#cloud-config
write_files:
  - path: /usr/local/sbin/neurokurs-bootstrap
    owner: root:root
    permissions: '0700'
    content: |
${script
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
runcmd:
  - ["/usr/local/sbin/neurokurs-bootstrap"]
`;
}
