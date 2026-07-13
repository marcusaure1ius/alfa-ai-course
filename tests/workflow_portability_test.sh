#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
UNINSTALL="$ROOT/scripts/uninstall.sh"
IMPORT="$ROOT/scripts/import-workflows.sh"
EXPORT="$ROOT/scripts/export-workflows.sh"
LIBRARY="$ROOT/scripts/lib/workflow-portability.sh"
COUNT=0
ok(){ COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail(){ printf 'not ok - %s\n' "$1" >&2; exit 1; }

bash -n "$UNINSTALL" "$IMPORT" "$EXPORT" "$LIBRARY"
ok "bash syntax"
[[ "$($UNINSTALL --help)" == *"DELETE-N8N-DATA"* ]]
[[ "$($IMPORT --help)" == *"неактивными"* ]]
[[ "$($EXPORT --help)" == *"credential references"* ]] || fail "help contract"
ok "Russian help and safety boundaries"

tmp="$(mktemp -d)"; trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/input" "$tmp/raw-export" "$tmp/captured"
env_file="$tmp/runtime.env"
printf 'POSTGRES_PASSWORD=fixture\nN8N_HOST=n8n.example.invalid\nACME_EMAIL=admin@example.invalid\nN8N_ENCRYPTION_KEY=fixture\n' > "$env_file"
chmod 0600 "$env_file"

cat > "$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"
if [[ "$1" == info ]]; then exit 0; fi
if [[ "$1" == inspect ]]; then printf '%s\n' "$EXPECTED_ROOT"; exit 0; fi
if [[ "$1" == cp ]]; then
  if [[ "$2" == fixture-container:* ]]; then
    cp "$MOCK_EXPORT_SOURCE"/*.json "$3"/
  else
    cp "$2" "$MOCK_IMPORT_CAPTURE/$(basename "$2")"
  fi
  exit 0
fi
if [[ "$1" == compose ]]; then
  if [[ " $* " == *" sh -eu -c umask 077; cat > \"\$1\" "* ]]; then
    destination="${!#}"
    cat > "$MOCK_IMPORT_CAPTURE/$(basename "$destination")"
  fi
  case " $* " in
    *" ps --status running -q n8n "*) printf 'fixture-container\n' ;;
    *" ps -aq "*) printf 'fixture-container\n' ;;
  esac
  exit 0
fi
exit 0
EOF
chmod +x "$tmp/bin/docker"
export PATH="$tmp/bin:$PATH" DOCKER_LOG="$tmp/docker.log" EXPECTED_ROOT="$ROOT"
export MOCK_EXPORT_SOURCE="$tmp/raw-export" MOCK_IMPORT_CAPTURE="$tmp/captured"

: > "$DOCKER_LOG"
"$UNINSTALL" --env-file "$env_file" >/dev/null
grep -q 'down --remove-orphans$' "$DOCKER_LOG" || fail "default down missing"
if grep -q -- '--volumes' "$DOCKER_LOG"; then fail "default uninstall deleted volumes"; fi
ok "default uninstall preserves volumes"

: > "$DOCKER_LOG"
if "$UNINSTALL" --env-file "$env_file" --delete-data >/dev/null 2>&1; then fail "delete accepted without phrase"; fi
[[ ! -s "$DOCKER_LOG" ]] || fail "docker called before destructive confirmation"
"$UNINSTALL" --env-file "$env_file" --delete-data --confirm-delete DELETE-N8N-DATA >/dev/null
grep -q -- 'down --remove-orphans --volumes' "$DOCKER_LOG" || fail "confirmed volume deletion missing"
ok "data deletion requires exact separate confirmation"

cat > "$tmp/input/safe.json" <<'EOF'
{"id":"safeWorkflow1","name":"Safe workflow","active":true,"nodes":[{"id":"n1","name":"Manual","type":"n8n-nodes-base.manualTrigger","credentials":{"httpHeaderAuth":{"id":"credential-id","name":"Credential name"}},"parameters":{}}],"connections":{},"pinData":{"Manual":[{"json":{"private":"fixture"}}]}}
EOF
cat > "$tmp/input/secret.json" <<'EOF'
{"id":"unsafeWorkflow1","name":"Unsafe workflow","nodes":[{"id":"n1","name":"Call","type":"n8n-nodes-base.httpRequest","parameters":{"apiKey":"real-secret-value"}}],"connections":{}}
EOF
: > "$DOCKER_LOG"
if "$IMPORT" --env-file "$env_file" --input "$tmp/input" >"$tmp/import-invalid.out" 2>&1; then fail "secret batch imported"; fi
grep -q 'secret.json' "$tmp/import-invalid.out" || fail "per-file invalid result missing"
[[ ! -s "$DOCKER_LOG" ]] || fail "docker called before full batch preflight"
rm "$tmp/input/secret.json"
ok "invalid JSON/secret indicator rejects entire batch before mutation"

: > "$DOCKER_LOG"
"$IMPORT" --env-file "$env_file" --input "$tmp/input" >"$tmp/import.out"
captured="$tmp/captured/safeWorkflow1.json"
[[ -f "$captured" ]] || fail "sanitized import copy missing"
jq -e '.active == false and .pinData == {} and (.nodes[0] | has("credentials") | not)' "$captured" >/dev/null || fail "import staging not sanitized"
grep -q 'n8n import:workflow --input=/tmp/alfa-ai-course-import-' "$DOCKER_LOG" || fail "pinned runtime CLI import missing"
grep -q 'sh -eu -c umask 077; cat >' "$DOCKER_LOG" || fail "node-owned staging write missing"
grep -q 'restart n8n' "$DOCKER_LOG" || fail "post-import restart missing"
ok "import sanitizes credentials/pinData and applies inactive state"

cp "$tmp/input/safe.json" "$tmp/raw-export/original-name.json"
output="$tmp/export-output"
: > "$DOCKER_LOG"
"$EXPORT" --env-file "$env_file" --output-dir "$output" >"$tmp/export.out"
[[ -f "$output/safeWorkflow1.json" && -f "$output/.n8n-workflow-export" ]] || fail "deterministic export paths missing"
jq -e '.active == false and .pinData == {} and (.nodes[0] | has("credentials") | not)' "$output/safeWorkflow1.json" >/dev/null || fail "export not sanitized"
grep -q 'n8n export:workflow --backup --output=/tmp/alfa-ai-course-export-' "$DOCKER_LOG" || fail "pinned runtime CLI export missing"
"$EXPORT" --env-file "$env_file" --output-dir "$output" >/dev/null
ok "export is deterministic, credential-free and repeatable"

mkdir "$tmp/unmanaged"; printf 'keep\n' > "$tmp/unmanaged/user-file"
if "$EXPORT" --env-file "$env_file" --output-dir "$tmp/unmanaged" >/dev/null 2>&1; then fail "unmanaged output overwritten"; fi
[[ -f "$tmp/unmanaged/user-file" ]] || fail "unmanaged file removed"
ok "export refuses unmanaged non-empty output"

printf 'keep\n' > "$tmp/output-file"
if "$EXPORT" --env-file "$env_file" --output-dir "$tmp/output-file" >/dev/null 2>&1; then fail "output file overwritten"; fi
[[ "$(cat "$tmp/output-file")" == keep ]] || fail "output file changed"
ok "export refuses a non-directory output path"

printf '1..%d\n' "$COUNT"
