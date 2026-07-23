#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
CATALOG="$ROOT/tests/fixtures/workflow-catalog.json"
IMAGE="docker.n8n.io/n8nio/n8n:2.29.10"
TEMP_DIR=""
VOLUME_NAME=""
COUNT=0
ok(){ COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fatal(){ printf '[FAIL] %s\n' "$*" >&2; exit 1; }

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  [[ -z "$VOLUME_NAME" ]] || docker volume rm -f "$VOLUME_NAME" >/dev/null 2>&1 || true
  [[ -z "$TEMP_DIR" ]] || rm -rf -- "$TEMP_DIR"
  exit "$code"
}

command -v node >/dev/null 2>&1 || fatal "Node.js не найден."
command -v jq >/dev/null 2>&1 || fatal "jq не найден."
command -v docker >/dev/null 2>&1 || fatal "Docker не найден."
docker info >/dev/null 2>&1 || fatal "Docker daemon недоступен."
docker image inspect "$IMAGE" >/dev/null 2>&1 || fatal "Pinned image отсутствует локально: $IMAGE"

node "$ROOT/tests/workflow_catalog_test.mjs"
ok "catalog, fixture, link, PII and safety contracts"

while IFS= read -r test_path; do
  "$ROOT/$test_path" >/dev/null || fatal "Contract test failed: $test_path"
done < <(jq -r '[.demos[].contractTest, .supportingContractTests[]] | unique[]' "$CATALOG")
ok "five demo and supporting dangerous-action contract suites"

# shellcheck source=scripts/lib/workflow-portability.sh
source "$ROOT/scripts/lib/workflow-portability.sh"
TEMP_DIR="$(mktemp -d)"
VOLUME_NAME="alfa-ai-course-clean-import-${RANDOM}-$$"
trap cleanup EXIT INT TERM
mkdir -p "$TEMP_DIR/staged" "$TEMP_DIR/logs"

while IFS=$'\t' read -r group workflow_path workflow_id; do
  mkdir -p "$TEMP_DIR/staged/$group"
  chmod 0755 "$TEMP_DIR/staged" "$TEMP_DIR/staged/$group"
  workflow_validate_and_sanitize "$ROOT/$workflow_path" "$TEMP_DIR/staged/$group/$workflow_id.json" \
    || fatal "Workflow preflight failed: $workflow_path"
  # Sanitized workflow JSON contains no credentials and is bind-mounted read-only
  # into a non-root n8n container. Linux CI preserves host permissions exactly.
  chmod 0644 "$TEMP_DIR/staged/$group/$workflow_id.json"
done < <(jq -r '.importOrder[] | .name as $group | .workflows[] | [$group,.path,.id] | @tsv' "$CATALOG")
ok "all catalog workflows pass credential-free portability preflight"

docker volume create "$VOLUME_NAME" >/dev/null
while IFS= read -r group; do
  if ! docker run --rm --pull=never --platform linux/amd64 \
    -e N8N_ENCRYPTION_KEY=T0025-CLEAN-IMPORT-FIXTURE-KEY-NOT-SECRET \
    -v "$VOLUME_NAME:/home/node/.n8n" \
    -v "$ROOT/workflows/$group:/imports:ro" \
    "$IMAGE" import:workflow --separate --input=/imports >"$TEMP_DIR/logs/source-$group.log" 2>&1; then
    sed -n '1,240p' "$TEMP_DIR/logs/source-$group.log" >&2
    fatal "Exact source clean import failed for group: $group"
  fi
  grep -q 'Successfully imported' "$TEMP_DIR/logs/source-$group.log" || fatal "n8n не подтвердил exact source import group: $group"
done < <(jq -r '.importOrder[].name' "$CATALOG")

docker run --rm --pull=never --platform linux/amd64 \
  -e N8N_ENCRYPTION_KEY=T0025-CLEAN-IMPORT-FIXTURE-KEY-NOT-SECRET \
  -v "$VOLUME_NAME:/home/node/.n8n" \
  "$IMAGE" export:workflow --all > "$TEMP_DIR/source-export.json"
node "$ROOT/tests/workflow_catalog_test.mjs" --verify-export "$TEMP_DIR/source-export.json" >/dev/null
ok "all 20 exact source JSON files import into one clean pinned n8n database"

docker volume rm -f "$VOLUME_NAME" >/dev/null
docker volume create "$VOLUME_NAME" >/dev/null
while IFS= read -r group; do
  if ! docker run --rm --pull=never --platform linux/amd64 \
    -e N8N_ENCRYPTION_KEY=T0025-CLEAN-IMPORT-FIXTURE-KEY-NOT-SECRET \
    -v "$VOLUME_NAME:/home/node/.n8n" \
    -v "$TEMP_DIR/staged/$group:/imports:ro" \
    "$IMAGE" import:workflow --separate --input=/imports >"$TEMP_DIR/logs/sanitized-$group.log" 2>&1; then
    sed -n '1,240p' "$TEMP_DIR/logs/sanitized-$group.log" >&2
    fatal "Sanitized clean import failed for group: $group"
  fi
  grep -q 'Successfully imported' "$TEMP_DIR/logs/sanitized-$group.log" || fatal "n8n не подтвердил sanitized import group: $group"
done < <(jq -r '.importOrder[].name' "$CATALOG")
docker run --rm --pull=never --platform linux/amd64 \
  -e N8N_ENCRYPTION_KEY=T0025-CLEAN-IMPORT-FIXTURE-KEY-NOT-SECRET \
  -v "$VOLUME_NAME:/home/node/.n8n" \
  "$IMAGE" export:workflow --all > "$TEMP_DIR/sanitized-export.json"
node "$ROOT/tests/workflow_catalog_test.mjs" --verify-export "$TEMP_DIR/sanitized-export.json" --require-no-credentials >/dev/null
ok "portability-staged import contains 20 inactive workflows without credential references"

if ! docker run --rm --pull=never --platform linux/amd64 \
  -e N8N_ENCRYPTION_KEY=T0025-CLEAN-IMPORT-FIXTURE-KEY-NOT-SECRET \
  -v "$VOLUME_NAME:/home/node/.n8n" \
  -v "$TEMP_DIR/staged/business:/imports:ro" \
  "$IMAGE" import:workflow --separate --input=/imports >"$TEMP_DIR/logs/business-rerun.log" 2>&1; then
  sed -n '1,240p' "$TEMP_DIR/logs/business-rerun.log" >&2
  fatal "Repeat business import failed."
fi
docker run --rm --pull=never --platform linux/amd64 \
  -e N8N_ENCRYPTION_KEY=T0025-CLEAN-IMPORT-FIXTURE-KEY-NOT-SECRET \
  -v "$VOLUME_NAME:/home/node/.n8n" \
  "$IMAGE" export:workflow --all > "$TEMP_DIR/rerun-export.json"
node "$ROOT/tests/workflow_catalog_test.mjs" --verify-export "$TEMP_DIR/rerun-export.json" --require-no-credentials >/dev/null
ok "repeat business import overwrites stable IDs without duplicates"

printf '1..%d\n' "$COUNT"
