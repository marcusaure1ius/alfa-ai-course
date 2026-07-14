#!/usr/bin/env bash

# shellcheck disable=SC1091,SC2034
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
FIREWALL="$ROOT/scripts/firewall.sh"
COUNT=0

ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }
contains() { [[ "$1" == *"$2"* ]] || fail "ожидалась строка: $2"; }

bash -n "$FIREWALL" "$ROOT/scripts/install.sh"
help_output="$("$FIREWALL" --help)"
contains "$help_output" "--preview"
contains "$help_output" "SSH guard"
contains "$help_output" "Без явного --apply"
ok "firewall и installer имеют валидный shell и safety help"

# shellcheck source=scripts/firewall.sh
source "$FIREWALL"
valid_port 22 || fail "port 22 отклонён"
valid_port 65535 || fail "port 65535 отклонён"
if valid_port 0 || valid_port 65536 || valid_port text; then fail "invalid port принят"; fi
SSH_CONNECTION="198.51.100.10 50123 203.0.113.20 2222"
ACTIVE_SSH_PORT=""
SSH_PORT_VALUE=""
resolve_report="$(mktemp)"
resolve_ssh_port > "$resolve_report"
resolve_output="$(<"$resolve_report")"
rm -f -- "$resolve_report"
[[ "$SSH_PORT_VALUE" == 2222 ]] || fail "active SSH server port не определён"
contains "$resolve_output" "2222"
ok "SSH port берётся только из server-port активной сессии"

SSH_PORT_VALUE=22
ACTIVE_SSH_PORT=""
set +e
guard_output="$(resolve_ssh_port 2>&1)"
guard_code=$?
set -e
[[ "$guard_code" == "$EXIT_SSH_GUARD" ]] || fail "conflicting SSH port не отклонён"
contains "$guard_output" "не совпадает"
ok "conflicting explicit SSH port блокируется"

SSH_CONNECTION=""
SSH_PORT_VALUE=22
UFW_BIN=ufw
resolve_ssh_port >/dev/null
plan="$(print_plan)"
first_plan="$(printf '%s\n' "$plan" | awk '/^\[PLAN\]/{print; exit}')"
last_plan="$(printf '%s\n' "$plan" | awk '/^\[PLAN\]/{line=$0} END{print line}')"
contains "$first_plan" "allow 22/tcp"
contains "$last_plan" "--force enable"
contains "$plan" "allow 80/tcp"
contains "$plan" "allow 443/tcp"
contains "$plan" "allow 443/udp"
contains "$plan" "default deny incoming"
ok "preview разрешает SSH первым и включает UFW последним"

command_log="$(mktemp)"
root_command() { printf '%s\n' "$*" >> "$command_log"; }
apply_firewall >/dev/null
first_apply="$(head -n 1 "$command_log")"
enable_line="$(grep -n -- '--force enable' "$command_log" | cut -d: -f1)"
status_line="$(grep -n -- 'status verbose' "$command_log" | cut -d: -f1)"
contains "$first_apply" "allow 22/tcp"
[[ "$enable_line" -lt "$status_line" ]] || fail "после enable есть mutation"
[[ "$(sed -n "$((enable_line - 1))p" "$command_log")" == *"default allow outgoing"* ]] \
  || fail "enable не является последней mutation"
rm -f -- "$command_log"
ok "apply path повторяет SSH-first план, после enable выполняет только status"

set +e
no_mode_output="$("$FIREWALL" 2>&1)"
no_mode_code=$?
set -e
[[ "$no_mode_code" == "$EXIT_USAGE" ]] || fail "запуск без opt-in не остановлен"
contains "$no_mode_output" "Укажите --preview"
preview_output="$(SSH_CONNECTION= "$FIREWALL" --preview --ssh-port 22)"
contains "$preview_output" "[PLAN] ufw allow 22/tcp"
ok "без режима нет mutation, explicit preview работает без sudo"

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
docker compose --project-directory "$ROOT" --env-file "$ROOT/tests/fixtures/compose.env" config --format json > "$tmp/compose.json"
node - "$tmp/compose.json" <<'NODE'
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const services = config.services;
const fail = message => { throw new Error(message); };

const publicPorts = [];
for (const [name, service] of Object.entries(services)) {
  for (const port of service.ports || []) {
    publicPorts.push(`${name}:${port.published}/${port.protocol}`);
  }
  if (service.privileged === true) fail(`${name} is privileged`);
  if ((service.cap_add || []).length) fail(`${name} adds capabilities`);
  if ((service.devices || []).length) fail(`${name} exposes devices`);
  if (!(service.security_opt || []).includes('no-new-privileges:true')) fail(`${name} lacks no-new-privileges`);
  for (const volume of service.volumes || []) {
    const source = String(volume.source || '');
    const target = String(volume.target || '');
    if (source.includes('docker.sock') || target.includes('docker.sock')) fail(`${name} mounts Docker socket`);
  }
}
const expected = ['caddy:80/tcp', 'caddy:443/tcp', 'caddy:443/udp'].sort();
if (JSON.stringify(publicPorts.sort()) !== JSON.stringify(expected)) fail(`public ports: ${publicPorts}`);
if (services.postgres.ports?.length) fail('PostgreSQL publishes a host port');
if (services.n8n.ports?.length) fail('n8n publishes a host port');
if (config.networks.backend.internal !== true) fail('backend is not internal');
if ((services.caddy.networks || {}).backend) fail('Caddy reaches backend');

const env = services.n8n.environment;
const exact = {
  N8N_PROTOCOL: 'https',
  N8N_SECURE_COOKIE: 'true',
  N8N_BLOCK_ENV_ACCESS_IN_NODE: 'true',
  N8N_BLOCK_FILE_ACCESS_TO_N8N_FILES: 'true',
  N8N_DIAGNOSTICS_ENABLED: 'false',
  N8N_PERSONALIZATION_ENABLED: 'false',
  EXECUTIONS_DATA_PRUNE: 'true',
  EXECUTIONS_DATA_MAX_AGE: '168',
  EXECUTIONS_DATA_PRUNE_MAX_COUNT: '10000',
};
for (const [key, value] of Object.entries(exact)) {
  if (String(env[key]) !== value) fail(`${key}=${env[key]}`);
}
NODE
ok "resolved Compose ограничивает public ports, privileges, networks и retention"

EXECUTIONS_DATA_MAX_AGE=24 EXECUTIONS_DATA_PRUNE_MAX_COUNT=1000 \
  docker compose --project-directory "$ROOT" --env-file "$ROOT/tests/fixtures/compose.env" config --format json > "$tmp/compose-override.json"
node - "$tmp/compose-override.json" <<'NODE'
const fs = require('node:fs');
const config = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const env = config.services.n8n.environment;
if (String(env.EXECUTIONS_DATA_PRUNE) !== 'true') throw new Error('pruning override disabled baseline');
if (String(env.EXECUTIONS_DATA_MAX_AGE) !== '24') throw new Error('age override missing');
if (String(env.EXECUTIONS_DATA_PRUNE_MAX_COUNT) !== '1000') throw new Error('count override missing');
NODE
ok "retention age/count overrides работают без отключения pruning"

tracked="$(git -C "$ROOT" ls-files)"
if printf '%s\n' "$tracked" | grep -Eq '(^|/)\.env$|\.(pem|key|p12|pfx|dump|tar|tar\.gz)$'; then
  fail "Git содержит secret/runtime artifact"
fi
git -C "$ROOT" check-ignore -q .env || fail ".env не игнорируется"
if git -C "$ROOT" grep -IlE -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' -- . ':!docs' ':!tests/security_test.sh' | grep -q .; then
  fail "Git содержит private key material"
fi
ok "secret env и runtime artifacts не отслеживаются Git"

contains "$("$ROOT/scripts/install.sh" --help)" "--configure-firewall"
grep -Fq 'configure_firewall_if_requested' "$ROOT/scripts/install.sh" || fail "installer не вызывает opt-in firewall"
installer_preview="$(SSH_CONNECTION= bash -c '
  source "$1"
  CONFIGURE_FIREWALL=1
  DRY_RUN=1
  ASSUME_YES=1
  FIREWALL_SSH_PORT=22
  configure_firewall_if_requested
' _ "$ROOT/scripts/install.sh")"
contains "$installer_preview" "[PLAN] ufw allow 22/tcp"
set +e
bad_port_output="$("$ROOT/scripts/install.sh" --configure-firewall --ssh-port invalid 2>&1)"
bad_port_code=$?
set -e
[[ "$bad_port_code" == 2 ]] || fail "installer не отклонил invalid SSH port до preflight"
contains "$bad_port_output" "1..65535"
ok "installer предлагает firewall только через отдельный opt-in"

printf '1..%d\n' "$COUNT"
