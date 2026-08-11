import "server-only";

import { getN8nGatewayManagementSecret } from "@/server/tools/n8n-managed-secret";

export const COURSE_HOSTNAME = "n8n.neurokurs.ru" as const;
export const COURSE_SERVER_HOSTNAME = "n8n-neurokurs-ru" as const;
export const COURSE_DNS_ZONE = "neurokurs.ru" as const;
export const COURSE_DNS_LABEL = "n8n" as const;
export const COURSE_DNS_TTL_SECONDS = 600 as const;

// Имя файла подтверждения владения n8n.neurokurs.ru в поисковой консоли.
// Живёт здесь, а не в config/Caddyfile.platform: тот профиль едет в публичном
// релизном артефакте и разворачивается на произвольных хостах, а подтверждение
// привязано к аккаунту владельца — посторонняя установка отдавала бы чужое
// доказательство владения (T-0123). buildStarterKitCloudInit не собирает
// профиль ни для какого другого хоста, поэтому значение не покидает
// COURSE_HOSTNAME вместе с артефактом.
export const COURSE_SITE_VERIFICATION_FILE =
  "googlec899775b0ad45e39.html" as const;

export const STARTER_KIT_BOOTSTRAP_PROFILE = Object.freeze({
  // Версия обязана расти вместе с содержимым cloud-init: lifecycle сверяет
  // сохранённый план по ней, и без бампа расхождение осталось бы тихим.
  version: "starter-kit-v0.1.8",
  // v0.1.6 перевыпущен из-за T-0123: v0.1.5 нёс в общем профиле личный файл
  // подтверждения владения, и любая посторонняя установка отдавала бы чужое
  // доказательство. Managed-конфиги внутри артефакта обязаны совпадать с
  // рабочим деревом — это сверяет release_pin_test.
  release: "v0.1.6",
  installerUrl:
    "https://github.com/marcusaure1ius/" +
    "alfa-ai-course/releases/download/v0.1.6/install.sh",
  installerSha256:
    "ea779939b87e135d875b1e49a5fa65eb6e3c8ce09f2e8af81904e84e7ca3cf73",
  n8nVersion: "2.29.10",
  timezone: "Europe/Moscow",
  networkWaitSeconds: 1200,
  serviceTimeoutSeconds: 2700,
  observationSeconds: 3000,
  probeIntervalSeconds: 30,
  retryIntervalSeconds: 1800,
  retryBurst: 4,
  maxAttempts: 4,
  retryDelaySeconds: 60,
  maxLogBytes: 65536,
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
  const gatewaySecret = getN8nGatewayManagementSecret();
  const script = `#!/bin/bash
set -Eeuo pipefail
umask 077
state_dir=/var/lib/neurokurs-bootstrap
status_file="$state_dir/status"
log_file=/var/log/neurokurs-bootstrap.log
installer="$state_dir/install.sh"
attempt_file="$state_dir/attempts"
lock_dir="$state_dir/lock"
mkdir -p "$state_dir"
chmod 0700 "$state_dir"
if [ -f "$state_dir/succeeded" ]; then
  exit 0
fi
if ! mkdir "$lock_dir" 2>/dev/null; then
  exit 75
fi
cleanup_lock() {
  rmdir "$lock_dir" 2>/dev/null || true
}
trap cleanup_lock EXIT

attempt=0
if [ -r "$attempt_file" ]; then
  read -r attempt < "$attempt_file" || attempt=0
  [[ "$attempt" =~ ^[0-9]+$ ]] || attempt=0
fi
if [ "$attempt" -ge ${profile.maxAttempts} ]; then
  status_next="$status_file.next"
  {
    printf 'phase=failed\\n'
    printf 'profile=${profile.version}\\n'
    printf 'attempt=%s\\n' "$attempt"
    printf 'exit_code=78\\n'
    printf 'error_stage=retry_budget_exhausted\\n'
  } > "$status_next"
  chmod 0600 "$status_next"
  mv -f "$status_next" "$status_file"
  exit 78
fi
attempt=$((attempt + 1))
attempt_next="$attempt_file.next"
printf '%s\\n' "$attempt" > "$attempt_next"
chmod 0600 "$attempt_next"
mv -f "$attempt_next" "$attempt_file"

write_status() {
  status_phase="$1"
  status_code="\${2:-}"
  status_stage="\${3:-}"
  status_next="$status_file.next"
  {
    printf 'phase=%s\\n' "$status_phase"
    printf 'profile=${profile.version}\\n'
    printf 'attempt=%s\\n' "$attempt"
    [ -z "$status_code" ] || printf 'exit_code=%s\\n' "$status_code"
    [ -z "$status_stage" ] || printf 'error_stage=%s\\n' "$status_stage"
  } > "$status_next"
  chmod 0600 "$status_next"
  mv -f "$status_next" "$status_file"
}

redact_output() {
  sed -E \\
    -e 's/([0-9]{1,3}\\.){3}[0-9]{1,3}/[REDACTED-IP]/g' \\
    -e 's/((token|secret|password|authorization|cookie|encryption_key)[[:space:]]*[=:][[:space:]]*)[^[:space:]]+/\\1[REDACTED]/Ig'
}

trim_log() {
  [ -f "$log_file" ] || return 0
  log_size="$(stat -c '%s' "$log_file" 2>/dev/null || printf '0')"
  [[ "$log_size" =~ ^[0-9]+$ ]] || log_size=0
  if [ "$log_size" -gt ${profile.maxLogBytes} ]; then
    log_next="$log_file.next"
    tail -c ${profile.maxLogBytes} "$log_file" > "$log_next"
    chmod 0600 "$log_next"
    mv -f "$log_next" "$log_file"
  fi
}

run_logged() {
  "$@" 2>&1 | redact_output >> "$log_file"
  chmod 0600 "$log_file"
  trim_log
}

phase=initializing
on_error() {
  code=$?
  if [ "$#" -ge 1 ]; then
    code="$1"
  fi
  trap - ERR
  write_status failed "$code" "$phase"
  trim_log
  exit "$code"
}
trap on_error ERR
write_status "$phase"

phase=waiting_network
write_status "$phase"
/usr/bin/timeout ${profile.networkWaitSeconds} /bin/bash -c \
  'until getent ahostsv4 github.com >/dev/null 2>&1 && (exec 3<>/dev/tcp/github.com/443) 2>/dev/null; do sleep 5; done'

phase=preparing
write_status "$phase"
export DEBIAN_FRONTEND=noninteractive
run_logged apt-get update
run_logged apt-get install -y ca-certificates curl

phase=downloading
write_status "$phase"
run_logged curl -fsSL ${shellSingleQuoted(profile.installerUrl)} -o "$installer"
chmod 0700 "$installer"
checksum_file="$state_dir/installer.sha256"
printf '%s  %s\\n' ${shellSingleQuoted(profile.installerSha256)} "$installer" > "$checksum_file"
chmod 0600 "$checksum_file"
run_logged sha256sum -c "$checksum_file"

phase=installing
write_status "$phase"
installer_attempt_log="$state_dir/installer-attempt.log"
install -m 0600 /dev/null "$installer_attempt_log"
if env N8N_HOST=${shellSingleQuoted(hostname)} TIMEZONE=${shellSingleQuoted(profile.timezone)} \
  sh "$installer" 2>&1 | redact_output | tee -a "$installer_attempt_log" >> "$log_file"; then
  :
else
  installer_code=$?
  if [ "$installer_code" -ne 23 ] || ! grep -Fq '429 Too Many Requests' "$installer_attempt_log"; then
    on_error "$installer_code"
  fi

  phase=recovering_registry_rate_limit
  write_status "$phase"
  project_dir=/opt/n8n-entrepreneur-starter-kit
  test -r "$project_dir/.env"
  test -x "$project_dir/scripts/doctor.sh"
  run_logged docker pull mirror.gcr.io/library/postgres:17.10-bookworm
  run_logged docker tag mirror.gcr.io/library/postgres:17.10-bookworm postgres:17.10-bookworm
  run_logged docker pull mirror.gcr.io/library/caddy:2.11.4-alpine
  run_logged docker tag mirror.gcr.io/library/caddy:2.11.4-alpine caddy:2.11.4-alpine
  run_logged docker pull mirror.gcr.io/n8nio/n8n:${profile.n8nVersion}
  run_logged docker tag mirror.gcr.io/n8nio/n8n:${profile.n8nVersion} docker.n8n.io/n8nio/n8n:${profile.n8nVersion}
  run_logged docker compose --project-directory "$project_dir" --env-file "$project_dir/.env" up -d --wait --wait-timeout 300
  run_logged "$project_dir/scripts/doctor.sh" --env-file "$project_dir/.env" --local-only
fi
phase=configuring_managed_gateway
write_status "$phase"
project_dir=/opt/n8n-entrepreneur-starter-kit
managed_env="$project_dir/.env.platform"
managed_env_next="$managed_env.next"
test -r "$project_dir/.env"
test -r "$project_dir/docker-compose.platform.yml"
test -r "$project_dir/config/Caddyfile.platform"
{
  printf 'N8N_GATE_MANAGEMENT_SECRET=%s\\n' ${shellSingleQuoted(gatewaySecret)}
  printf 'SITE_VERIFICATION_FILE=%s\\n' ${shellSingleQuoted(COURSE_SITE_VERIFICATION_FILE)}
} > "$managed_env_next"
chmod 0600 "$managed_env_next"
mv -f "$managed_env_next" "$managed_env"
run_logged docker compose --project-directory "$project_dir" \
  --env-file "$project_dir/.env" --env-file "$managed_env" \
  -f "$project_dir/docker-compose.yml" \
  -f "$project_dir/docker-compose.platform.yml" \
  up -d --wait --wait-timeout 300
chmod 0600 "$log_file"
trim_log

install -m 0600 /dev/null "$state_dir/succeeded"
write_status ready_owner_setup_required
trap - ERR
`;
  const service = `[Unit]
Description=Neurokurs pinned n8n bootstrap
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=${profile.retryIntervalSeconds}
StartLimitBurst=${profile.retryBurst}

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/neurokurs-bootstrap
Restart=on-failure
RestartPreventExitStatus=78
RestartSec=${profile.retryDelaySeconds}s
TimeoutStartSec=${profile.serviceTimeoutSeconds}s

[Install]
WantedBy=multi-user.target
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
  - path: /etc/systemd/system/neurokurs-bootstrap.service
    owner: root:root
    permissions: '0644'
    content: |
${service
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
runcmd:
  - ["systemctl", "daemon-reload"]
  - ["systemctl", "enable", "neurokurs-bootstrap.service"]
  - ["systemctl", "start", "--no-block", "neurokurs-bootstrap.service"]
`;
}
