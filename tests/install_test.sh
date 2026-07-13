#!/usr/bin/env bash

# shellcheck disable=SC1091,SC2016,SC2034

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
INSTALLER="$ROOT/scripts/install.sh"
TESTS_RUN=0

fail() {
  printf 'not ok - %s\n' "$1" >&2
  exit 1
}

ok() {
  TESTS_RUN=$((TESTS_RUN + 1))
  printf 'ok %d - %s\n' "$TESTS_RUN" "$1"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "ожидалась строка: $needle"
}

bash -n "$INSTALLER"
ok "bash syntax"

help_output="$(bash "$INSTALLER" --help)"
assert_contains "$help_output" "Безопасная установка"
assert_contains "$help_output" "--non-interactive"
ok "русская справка"

# shellcheck source=scripts/install.sh
source "$INSTALLER"

valid_hostname "n8n.example.com" || fail "валидный FQDN отклонён"
if valid_hostname "https://n8n.example.com/path"; then fail "URL принят как FQDN"; fi
valid_email "admin@example.com" || fail "валидный email отклонён"
if valid_email "admin.example.com"; then fail "email без @ принят"; fi
valid_secret_value "abcdefghijklmnopqrstuvwxyz123456" || fail "валидный secret отклонён"
if valid_secret_value "short-secret"; then fail "короткий secret принят"; fi
ok "валидация домена и email"

temporary_root="$(mktemp -d)"
trap 'rm -rf -- "$temporary_root"' EXIT

config_file="$temporary_root/config.env"
printf '%s\n' \
  'N8N_HOST=n8n.example.com' \
  'ACME_EMAIL=admin@example.com' \
  'POSTGRES_PASSWORD=$(touch /tmp/installer-must-not-eval)' > "$config_file"
chmod 0600 "$config_file"
rm -f /tmp/installer-must-not-eval
read_config_file "$config_file"
[[ "$POSTGRES_PASSWORD_VALUE" == '$(touch /tmp/installer-must-not-eval)' ]] || fail "config value изменено"
[[ ! -e /tmp/installer-must-not-eval ]] || fail "config file был выполнен как shell"
ok "config parser не выполняет shell-код"

ENV_FILE="$temporary_root/runtime.env"
N8N_HOST_VALUE="n8n.example.com"
ACME_EMAIL_VALUE="admin@example.com"
TIMEZONE_VALUE="Etc/UTC"
POSTGRES_DB_VALUE="n8n"
POSTGRES_USER_VALUE="n8n"
POSTGRES_PASSWORD_VALUE="fixture-postgres-secret"
N8N_ENCRYPTION_KEY_VALUE="fixture-encryption-secret"
EXECUTIONS_DATA_MAX_AGE_VALUE="168"
EXECUTIONS_DATA_PRUNE_MAX_COUNT_VALUE="10000"
DRY_RUN=0
CHECK_ONLY=0
write_output="$(write_env_atomically)"
[[ "$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE")" == "600" ]] || fail "env mode не 600"
[[ "$write_output" != *"fixture-postgres-secret"* ]] || fail "PostgreSQL secret попал в output"
[[ "$write_output" != *"fixture-encryption-secret"* ]] || fail "encryption secret попал в output"
ok "атомарный env mode 0600 без утечки secrets"

NON_INTERACTIVE=1
ASSUME_YES=0
N8N_HOST_VALUE="changed.example.com"
set +e
replace_output="$(confirm_env_replacement 2>&1)"
replace_code=$?
set -e
[[ "$replace_code" == "$EXIT_EXISTING_DATA" ]] || fail "replacement guard вернул $replace_code"
assert_contains "$replace_output" "повторите с --yes"
ASSUME_YES=1
confirm_env_replacement
N8N_HOST_VALUE="n8n.example.com"
ok "non-interactive rerun требует explicit --yes для изменения env"

DRY_RUN=1
CHECK_ONLY=0
side_effect="$temporary_root/side-effect"
run_mutation touch "$side_effect" >/dev/null
[[ ! -e "$side_effect" ]] || fail "dry-run выполнил mutation"
ok "dry-run блокирует mutation"

NON_INTERACTIVE=1
N8N_HOST_VALUE=""
ACME_EMAIL_VALUE="admin@example.com"
set +e
missing_output="$(collect_configuration 2>&1)"
missing_code=$?
set -e
[[ "$missing_code" == "$EXIT_USAGE" ]] || fail "non-interactive missing config вернул $missing_code"
assert_contains "$missing_output" "задайте N8N_HOST"
ok "non-interactive mode детерминированно отклоняет incomplete config"

NON_INTERACTIVE=0
N8N_HOST_VALUE=""
ACME_EMAIL_VALUE=""
TIMEZONE_VALUE="Etc/UTC"
collect_configuration <<'EOF' >/dev/null
n8n.example.com
admin@example.com

EOF
[[ "$N8N_HOST_VALUE" == "n8n.example.com" && "$ACME_EMAIL_VALUE" == "admin@example.com" ]] \
  || fail "interactive mode не собрал конфигурацию"
ok "interactive mode читает prompts"

ENV_FILE="$temporary_root/missing.env"
DRY_RUN=0
DOCKER_CMD=(docker)
volume_exists() { [[ "$1" == "n8n_data" ]]; }
set +e
guard_output="$(protect_existing_data 2>&1)"
guard_code=$?
set -e
[[ "$guard_code" == "$EXIT_EXISTING_DATA" ]] || fail "existing data guard вернул $guard_code"
assert_contains "$guard_output" "Восстановите исходный env-файл"
ok "persistent volumes без env блокируют генерацию новых secrets"

printf '1..%d\n' "$TESTS_RUN"
