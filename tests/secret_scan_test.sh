#!/usr/bin/env bash

set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
SCANNER="$ROOT/tests/secret_scan.sh"
COUNT=0
ok(){ COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail(){ printf 'not ok - %s\n' "$1" >&2; exit 1; }

bash -n "$SCANNER"
node --check "$ROOT/tests/secret_scan.mjs"
ok "scanner syntax"

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

printf 'POSTGRES_PASSWORD=fixture-password-not-a-secret\nAPI_KEY=<provider-api-key>\n' > "$tmp/safe.env"
"$SCANNER" --path "$tmp/safe.env" >/dev/null || fail "safe placeholders rejected"
ok "safe placeholders are accepted"

assert_rejected() {
  local rule="$1" file="$2" secret="$3" output="$tmp/output.log"
  if "$SCANNER" --path "$file" >"$output" 2>&1; then fail "$rule fixture accepted"; fi
  grep -q "rule=$rule" "$output" || fail "$rule is not identified"
  ! grep -Fq -- "$secret" "$output" || fail "$rule value leaked in output"
}

aws_secret="$(printf '%s%s' AKIA 1234567890ABCDEF)"
printf 'AWS_ACCESS_KEY_ID=%s\n' "$aws_secret" > "$tmp/aws.env"
assert_rejected aws-access-key "$tmp/aws.env" "$aws_secret"
ok "AWS fixture is detected with redacted output"

github_secret="$(printf '%s%s' ghp_ 1234567890abcdefghijklmnopqrstuv)"
printf 'TOKEN=%s\n' "$github_secret" > "$tmp/github.env"
assert_rejected github-token "$tmp/github.env" "$github_secret"
ok "GitHub fixture is detected with redacted output"

generic_secret="live-super-secret-value-123456789"
printf 'CLIENT_SECRET=%s\n' "$generic_secret" > "$tmp/generic.env"
assert_rejected credential-assignment "$tmp/generic.env" "$generic_secret"
ok "generic credential fixture is detected with redacted output"

private_payload="MIIEfixturepayload1234567890ABCDEF"
printf '%s%s%s\n%s\n%s%s%s\n' \
  '-----BEGIN ' 'PRIVATE KEY' '-----' \
  "$private_payload" \
  '-----END ' 'PRIVATE KEY' '-----' > "$tmp/private.pem"
assert_rejected private-key "$tmp/private.pem" "$private_payload"
ok "private-key fixture is detected with redacted output"

"$SCANNER" >/dev/null || fail "repository secret scan failed"
ok "tracked and untracked source scan has no findings"

printf '1..%d\n' "$COUNT"
