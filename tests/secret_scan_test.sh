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

generic_value="live-super-secret-value-123456789"
printf 'CLIENT_SECRET=%s\n' "$generic_value" > "$tmp/generic.env"
assert_rejected credential-assignment "$tmp/generic.env" "$generic_value"
ok "generic credential fixture is detected with redacted output"

# Ключевая негативная проверка класса: имя QUUX_FROBNICATOR не встречается ни в
# одном списке сканера, значит находка возможна только за счёт формы значения.
# Значения собираются из фрагментов, чтобы сам файл теста не содержал
# секретоподобных литералов для проверки 'tracked and untracked source scan'.
unknown_value="$(printf '%s%s%s' Zq4vRw9s TnB7kLp2 Xc6mDh8Y)"
printf 'QUUX_FROBNICATOR=%s\n' "$unknown_value" > "$tmp/unknown.env"
assert_rejected credential-assignment "$tmp/unknown.env" "$unknown_value"
ok "unknown variable name with secret-shaped value is detected"

hex_value="$(printf '%s%s' 9f8a7b6c5d4e3f2a 1b0c9d8e7f6a5b4c)"
printf 'WOBBLE_GADGET=%s\n' "$hex_value" > "$tmp/unknown-hex.env"
assert_rejected credential-assignment "$tmp/unknown-hex.env" "$hex_value"
ok "unknown variable name with hex value is detected"

# Имена из воспроизведения T-0132, которые прежний перечень пропускал.
timeweb_value="$(printf '%s%s%s' Nb5tKw2m Rp8cQz4x Vg7dJh3s)"
management_value="$(printf '%s%s%s' Wf6yLn9b Tk3rMv5c Zx8pGq2d)"
auth_value="$(printf '%s%s%s' Hj4wSb7n Cd2fXm6t Yk9gPr3v)"
printf 'TIMEWEB_API_TOKEN=%s\nN8N_MANAGEMENT_API_KEY=%s\nAUTH_SECRET=%s\n' \
  "$timeweb_value" "$management_value" "$auth_value" > "$tmp/missed.env"
if "$SCANNER" --path "$tmp/missed.env" >"$tmp/missed.log" 2>&1; then
  fail "previously missed names accepted"
fi
[ "$(grep -c 'rule=credential-assignment' "$tmp/missed.log")" -eq 3 ] \
  || fail "not all previously missed names are detected"
for value in "$timeweb_value" "$management_value" "$auth_value"; do
  ! grep -Fq -- "$value" "$tmp/missed.log" || fail "missed-name value leaked in output"
done
ok "TIMEWEB_API_TOKEN, N8N_MANAGEMENT_API_KEY and AUTH_SECRET are detected"

# Присваивание с ключом в кавычках — форма workflow JSON (T-0134). Имя
# BLORT_GIZMO не встречается ни в одном списке сканера: находку обязана давать
# форма значения, а не имя. Второй кейс — одинарные кавычки и JWT-префикс.
json_value="$(printf '%s%s%s' Wq3xNv8b Km5tRz7c Pd2fLh9s)"
printf '{\n  "BLORT_GIZMO": "%s"\n}\n' "$json_value" > "$tmp/quoted.json"
assert_rejected credential-assignment "$tmp/quoted.json" "$json_value"
ok "quoted JSON key with secret-shaped value is detected"

jwt_value="$(printf '%s%s' eyJhbGciOiJIUzI1NiJ9. dGVzdDQyLXQwMTM0LXBheWxvYWQ)"
printf "'FLURB_KNOB': '%s'\n" "$jwt_value" > "$tmp/quoted.yaml"
assert_rejected credential-assignment "$tmp/quoted.yaml" "$jwt_value"
ok "single-quoted key with JWT-shaped value is detected"

# Номер строки обязан указывать на строку присваивания, даже когда boundary
# шаблона — перевод строки предыдущей.
printf '# comment line\nCLIENT_SECRET=%s\n' "$generic_value" > "$tmp/line-check.env"
if "$SCANNER" --path "$tmp/line-check.env" >"$tmp/line-check.log" 2>&1; then
  fail "line-check fixture accepted"
fi
grep -q 'line=2' "$tmp/line-check.log" || fail "finding does not point at the assignment line"
ok "finding line number points at the assignment itself"

# Формы, ради которых сужены эвристики: ложное срабатывание на любом из этих
# присваиваний вернёт шум и приведёт к обходу гейта через исключения.
cat > "$tmp/benign.txt" <<'BENIGN'
endpoint=https://ai.api.cloud.yandex.net/v1/chat/completions
idempotencyKey=input.idempotencyKey
state=StudentN8nAccessState
reason=EXPLICIT_UNEXPIRED_APPROVAL_REQUIRED
integrity=sha512-MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=
manifestSha256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
collection_path=/api/v1/ssh-keys
{"webhookId": "c0ffee00-aaaa-4bbb-8ccc-123456789abc"}
{"gatewayRef": "coreGenericLlmGatewayV1"}
{"embeddedSourceTree": "6b135a83a78470d6430df7d3e85670587391abb4"}
BENIGN
"$SCANNER" --path "$tmp/benign.txt" >/dev/null || fail "benign assignment shapes rejected"
ok "code-shaped assignments are accepted"

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
