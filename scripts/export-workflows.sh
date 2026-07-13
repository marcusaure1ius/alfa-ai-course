#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
# shellcheck source=scripts/lib/workflow-portability.sh
source "$SCRIPT_DIR/lib/workflow-portability.sh"
ENV_FILE="$PROJECT_ROOT/.env"
OUTPUT_DIR="$PROJECT_ROOT/exports/workflows"
TEMP_DIR=""
CONTAINER_TMP=""
CONTAINER_ID=""
declare -a DOCKER_CMD=(docker)

usage() {
  cat <<'EOF'
Экспортировать все workflow из running n8n в безопасный deterministic directory.

Использование:
  ./scripts/export-workflows.sh [--output-dir DIR] [--env-file PATH]

Default: exports/workflows. Каждый файл получает имя <workflow-id>.json,
active=false, пустой pinData и не содержит credential references. Embedded secret
индикаторы прерывают export. Непустой output заменяется только при наличии marker
.n8n-workflow-export, поэтому произвольный directory не будет затёрт.
EOF
}

fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

parse_args() {
  while (($#)); do
    case "$1" in
      --output-dir) (($# >= 2)) || fatal "Для --output-dir нужен путь."; OUTPUT_DIR="$2"; shift ;;
      --env-file) (($# >= 2)) || fatal "Для --env-file нужен путь."; ENV_FILE="$2"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) fatal "Неизвестный параметр: $1. Используйте --help." ;;
    esac
    shift
  done
}

configure_docker() {
  command -v docker >/dev/null 2>&1 || fatal "Docker не найден."
  if docker info >/dev/null 2>&1; then DOCKER_CMD=(docker)
  elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then DOCKER_CMD=(sudo docker)
  else fatal "Docker daemon недоступен."; fi
  "${DOCKER_CMD[@]}" compose version >/dev/null 2>&1 || fatal "Docker Compose недоступен."
}

compose() { "${DOCKER_CMD[@]}" compose --project-directory "$PROJECT_ROOT" --env-file "$ENV_FILE" "$@"; }

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [[ -n "$CONTAINER_TMP" && -n "$CONTAINER_ID" ]]; then
    compose exec -T n8n rm -rf -- "$CONTAINER_TMP" >/dev/null 2>&1 || true
  fi
  [[ -z "$TEMP_DIR" ]] || rm -rf -- "$TEMP_DIR"
  exit "$code"
}

main() {
  local raw_file id destination parent replacement old_output failed=0 count=0 working_dir
  declare -A seen_ids=()
  parse_args "$@"
  [[ -f "$ENV_FILE" ]] || fatal "Env-файл отсутствует: $ENV_FILE"
  workflow_require_jq || exit 1
  [[ "$OUTPUT_DIR" != / && "$OUTPUT_DIR" != "$PROJECT_ROOT" ]] || fatal "Output directory слишком широк: $OUTPUT_DIR"
  [[ ! -e "$OUTPUT_DIR" || -d "$OUTPUT_DIR" ]] || fatal "Output path существует и не является directory: $OUTPUT_DIR"
  if [[ -d "$OUTPUT_DIR" && -n "$(find "$OUTPUT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" && ! -f "$OUTPUT_DIR/.n8n-workflow-export" ]]; then
    fatal "Непустой output не управляется этим script: marker .n8n-workflow-export отсутствует."
  fi

  configure_docker
  compose config --quiet >/dev/null 2>&1 || fatal "Compose config невалиден."
  CONTAINER_ID="$(compose ps --status running -q n8n 2>/dev/null)"
  [[ -n "$CONTAINER_ID" ]] || fatal "n8n container не запущен."
  working_dir="$("${DOCKER_CMD[@]}" inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$CONTAINER_ID" 2>/dev/null || true)"
  [[ "$working_dir" == "$PROJECT_ROOT" ]] || fatal "n8n container принадлежит другому Compose working directory: ${working_dir:-unknown}"
  CONTAINER_TMP="/tmp/alfa-ai-course-export-$$"
  TEMP_DIR="$(mktemp -d)"
  trap cleanup EXIT INT TERM
  compose exec -T n8n sh -eu -c 'rm -rf -- "$1"; mkdir -p -- "$1"' _ "$CONTAINER_TMP"
  compose exec -T n8n n8n export:workflow --backup --output="$CONTAINER_TMP"

  mkdir -p "$TEMP_DIR/raw" "$TEMP_DIR/clean"
  "${DOCKER_CMD[@]}" cp "$CONTAINER_ID:$CONTAINER_TMP/." "$TEMP_DIR/raw"
  while IFS= read -r raw_file; do
    destination="$TEMP_DIR/clean/candidate.json"
    if ! workflow_validate_and_sanitize "$raw_file" "$destination"; then
      printf '[FAIL] export preflight: %s\n' "$(basename "$raw_file")" >&2
      failed=1
      continue
    fi
    id="$(workflow_id "$destination")"
    if [[ -n "${seen_ids[$id]:-}" ]]; then
      printf '[FAIL] duplicate exported id: %s\n' "$id" >&2
      failed=1
      continue
    fi
    seen_ids[$id]=1
    mv -- "$destination" "$TEMP_DIR/clean/$id.json"
    chmod 0600 "$TEMP_DIR/clean/$id.json"
    count=$((count + 1))
    printf '[OK] export preflight: %s.json\n' "$id"
  done < <(find "$TEMP_DIR/raw" -type f -name '*.json' -print | sort)
  (( count > 0 )) || fatal "n8n не вернул ни одного workflow JSON."
  (( failed == 0 )) || fatal "Export отменён: unsafe или duplicate workflow; прежний output сохранён."

  printf 'schema=1\nmanaged-by=export-workflows.sh\n' > "$TEMP_DIR/clean/.n8n-workflow-export"
  chmod 0600 "$TEMP_DIR/clean/.n8n-workflow-export"
  parent="$(dirname "$OUTPUT_DIR")"
  mkdir -p -- "$parent"
  replacement="$parent/.workflow-export.new.$$"
  old_output="$parent/.workflow-export.old.$$"
  mv -- "$TEMP_DIR/clean" "$replacement"
  if [[ -e "$OUTPUT_DIR" ]]; then mv -- "$OUTPUT_DIR" "$old_output"; fi
  if ! mv -- "$replacement" "$OUTPUT_DIR"; then
    [[ ! -e "$old_output" ]] || mv -- "$old_output" "$OUTPUT_DIR"
    fatal "Не удалось атомарно заменить output directory."
  fi
  rm -rf -- "$old_output"
  chmod 0700 "$OUTPUT_DIR"
  printf 'EXPORTED_WORKFLOWS=%d\nEXPORT_DIR=%s\n' "$count" "$OUTPUT_DIR"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
