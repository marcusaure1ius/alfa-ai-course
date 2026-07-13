#!/usr/bin/env bash

# shellcheck disable=SC1091,SC2034
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
DOCTOR="$ROOT/scripts/doctor.sh"
COUNT=0
ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

bash -n "$DOCTOR"
ok "bash syntax"
help="$("$DOCTOR" --help)"
[[ "$help" == *"Exit codes"* && "$help" == *"--local-only"* ]] || fail "help incomplete"
ok "help and non-interactive usage"

# shellcheck source=scripts/doctor.sh
source "$DOCTOR"
WARNINGS=0; FAILURES=0
result OK test.ok "ok" "none" >/dev/null
result WARN test.warn "warn" "fix" >/dev/null
set +e; finish_report >/dev/null; code=$?; set -e
[[ "$code" == 1 ]] || fail "WARN exit code=$code"
result FAIL test.fail "fail" "fix" >/dev/null
set +e; finish_report >/dev/null; code=$?; set -e
[[ "$code" == 2 ]] || fail "FAIL exit code=$code"
ok "severity exit codes"

tmp="$(mktemp -d)"; trap 'rm -rf -- "$tmp"' EXIT
ENV_FILE="$tmp/.env"
secret_a="doctor-postgres-secret-must-not-leak"
secret_b="doctor-encryption-secret-must-not-leak"
printf '%s\n' "N8N_HOST=n8n.example.com" "POSTGRES_DB=n8n" "POSTGRES_USER=n8n" "POSTGRES_PASSWORD=$secret_a" "N8N_ENCRYPTION_KEY=$secret_b" > "$ENV_FILE"
chmod 0600 "$ENV_FILE"
N8N_HOST_VALUE=""; POSTGRES_DB_VALUE="n8n"; POSTGRES_USER_VALUE="n8n"
check_env > "$tmp/report.txt"
output="$(<"$tmp/report.txt")"
[[ "$output" != *"$secret_a"* && "$output" != *"$secret_b"* ]] || fail "secret leaked"
[[ "$N8N_HOST_VALUE" == n8n.example.com ]] || fail "public config not parsed"
ok "redacted env report"

LOCAL_ONLY=1; WARNINGS=0; FAILURES=0
output="$(check_external)"
[[ "$output" == *"[WARN] external.skipped"* ]] || fail "local-only not reported"
ok "local-only external boundary"

printf '1..%d\n' "$COUNT"
