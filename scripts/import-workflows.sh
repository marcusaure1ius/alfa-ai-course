#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
# shellcheck source=scripts/lib/workflow-portability.sh
source "$SCRIPT_DIR/lib/workflow-portability.sh"
ENV_FILE="$PROJECT_ROOT/.env"
INPUT_PATH="$PROJECT_ROOT/workflows"
TEMP_DIR=""
CONTAINER_TMP=""
CONTAINER_ID=""
declare -a DOCKER_CMD=(docker)

usage() {
  cat <<'EOF'
Пакетно импортировать безопасные workflow JSON в running n8n.

Использование:
  ./scripts/import-workflows.sh [--input PATH] [--env-file PATH]

PATH может быть одним JSON-файлом или directory (рекурсивный поиск *.json).
Каждый файл валидируется до первой записи в n8n. Embedded secrets отклоняются;
credential references и pinData удаляются из staging copy; workflows импортируются
неактивными. Стабильный id перезаписывает workflow с тем же id при повторном запуске.
EOF
}

fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

parse_args() {
  while (($#)); do
    case "$1" in
      --input) (($# >= 2)) || fatal "Для --input нужен путь."; INPUT_PATH="$2"; shift ;;
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
  local source_file relative id staged_file failed=0 imported=0 working_dir
  local -a source_files=()
  declare -A seen_ids=()

  parse_args "$@"
  [[ -f "$ENV_FILE" ]] || fatal "Env-файл отсутствует: $ENV_FILE"
  workflow_require_jq || exit 1
  if [[ -f "$INPUT_PATH" ]]; then
    [[ "$INPUT_PATH" == *.json ]] || fatal "Input file должен иметь расширение .json."
    source_files+=("$INPUT_PATH")
  elif [[ -d "$INPUT_PATH" ]]; then
    while IFS= read -r source_file; do source_files+=("$source_file"); done < <(find "$INPUT_PATH" -type f -name '*.json' -print | sort)
  else
    fatal "Input path отсутствует: $INPUT_PATH"
  fi
  ((${#source_files[@]} > 0)) || fatal "JSON-файлы не найдены: $INPUT_PATH"

  TEMP_DIR="$(mktemp -d)"
  trap cleanup EXIT INT TERM
  mkdir -p "$TEMP_DIR/staged"
  for source_file in "${source_files[@]}"; do
    relative="${source_file#"$INPUT_PATH"/}"
    [[ "$relative" != "$source_file" ]] || relative="$(basename "$source_file")"
    staged_file="$TEMP_DIR/staged/$(printf '%06d' "${#seen_ids[@]}").json"
    if ! workflow_validate_and_sanitize "$source_file" "$staged_file"; then
      printf '[FAIL] preflight: %s\n' "$relative" >&2
      failed=1
      continue
    fi
    id="$(workflow_id "$staged_file")"
    if [[ -n "${seen_ids[$id]:-}" ]]; then
      printf '[FAIL] duplicate id %s: %s и %s\n' "$id" "${seen_ids[$id]}" "$relative" >&2
      failed=1
      continue
    fi
    seen_ids[$id]="$relative"
    mv -- "$staged_file" "$TEMP_DIR/staged/$id.json"
    printf '[OK] preflight: %s (id=%s)\n' "$relative" "$id"
  done
  (( failed == 0 )) || fatal "Import отменён: batch preflight не пройден; n8n не изменён."

  configure_docker
  compose config --quiet >/dev/null 2>&1 || fatal "Compose config невалиден."
  CONTAINER_ID="$(compose ps --status running -q n8n 2>/dev/null)"
  [[ -n "$CONTAINER_ID" ]] || fatal "n8n container не запущен."
  working_dir="$("${DOCKER_CMD[@]}" inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$CONTAINER_ID" 2>/dev/null || true)"
  [[ "$working_dir" == "$PROJECT_ROOT" ]] || fatal "n8n container принадлежит другому Compose working directory: ${working_dir:-unknown}"
  CONTAINER_TMP="/tmp/alfa-ai-course-import-$$"
  compose exec -T n8n mkdir -p -- "$CONTAINER_TMP"

  for id in $(printf '%s\n' "${!seen_ids[@]}" | sort); do
    staged_file="$TEMP_DIR/staged/$id.json"
    compose exec -T n8n sh -eu -c 'umask 077; cat > "$1"' _ "$CONTAINER_TMP/$id.json" < "$staged_file"
    if compose exec -T n8n n8n import:workflow --input="$CONTAINER_TMP/$id.json"; then
      printf '[OK] import: %s (id=%s)\n' "${seen_ids[$id]}" "$id"
      imported=$((imported + 1))
    else
      printf '[FAIL] import: %s (id=%s)\n' "${seen_ids[$id]}" "$id" >&2
      failed=1
    fi
  done
  if (( imported > 0 )); then
    compose restart n8n >/dev/null
    compose up -d --wait --wait-timeout 180 --pull never n8n >/dev/null
    printf '[OK] n8n перезапущен: inactive import state применён к runtime.\n'
  fi
  (( failed == 0 )) || fatal "Один или несколько workflow не импортированы. См. per-file results выше."
  printf 'IMPORTED_WORKFLOWS=%d\n' "${#seen_ids[@]}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
