#!/usr/bin/env bash

# shellcheck disable=SC1090,SC1091,SC2034
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
UPDATE="$ROOT/scripts/update.sh"
ROLLBACK="$ROOT/scripts/rollback.sh"
count=0
ok() { count=$((count + 1)); printf 'ok %d - %s\n' "$count" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

bash -n "$UPDATE" "$ROLLBACK" "$ROOT/scripts/backup.sh" "$ROOT/scripts/restore.sh"
ok "bash syntax"

[[ "$("$UPDATE" --help)" == *"2.29.9"* && "$("$ROLLBACK" --help)" == *"Image-only downgrade запрещён"* ]] || fail "help не описывает safety boundary"
ok "Russian lifecycle help"

source "$UPDATE"
approved_pair 2.29.9 2.29.10 || fail "approved pair отклонена"
if approved_pair 2.29.10 2.29.9 || approved_pair 2.29.8 2.29.10; then fail "неразрешённая pair принята"; fi
ok "allowlist accepts one explicit pair"

tmp="$(mktemp -d)"; trap 'rm -rf -- "$tmp"' EXIT
ENV_FILE="$tmp/runtime.env"
printf 'POSTGRES_PASSWORD=fixture-secret\nN8N_VERSION=2.29.9\n' > "$ENV_FILE"; chmod 0600 "$ENV_FILE"
replace_env_version 2.29.10
[[ "$(read_key N8N_VERSION "$ENV_FILE")" == 2.29.10 ]] || fail "version не заменена"
[[ "$(read_key POSTGRES_PASSWORD "$ENV_FILE")" == fixture-secret ]] || fail "secret изменён"
[[ "$(stat -f '%Lp' "$ENV_FILE" 2>/dev/null || stat -c '%a' "$ENV_FILE")" == 600 ]] || fail "env mode изменён"
ok "atomic env version update preserves secrets and mode"

STATE_FILE="$tmp/state/update.env"
write_state updated 2.29.10 2.29.9 /secure/pre-update.tar.gz
[[ "$(read_key STATUS "$STATE_FILE")" == updated && "$(read_key BACKUP_ARCHIVE "$STATE_FILE")" == /secure/pre-update.tar.gz ]] || fail "metadata не записана"
[[ "$(stat -f '%Lp' "$STATE_FILE" 2>/dev/null || stat -c '%a' "$STATE_FILE")" == 600 ]] || fail "metadata mode не 600"
ok "atomic lifecycle metadata"

printf '1..%d\n' "$count"
