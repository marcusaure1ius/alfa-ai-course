#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
ENV_FILE="$PROJECT_ROOT/.env"
DELETE_DATA=0
DELETE_CONFIRMATION=""
DELETE_PHRASE="DELETE-N8N-DATA"
declare -a DOCKER_CMD=(docker)

usage() {
  cat <<'EOF'
Безопасно удалить containers n8n starter kit, сохранив данные.

Использование:
  ./scripts/uninstall.sh [--env-file PATH]
  ./scripts/uninstall.sh --delete-data --confirm-delete DELETE-N8N-DATA [--env-file PATH]

По умолчанию выполняется Compose down без --volumes: .env, конфигурация и все
persistent volumes остаются на месте. Удаление данных требует одновременно
--delete-data и точную отдельную фразу --confirm-delete DELETE-N8N-DATA.
EOF
}

fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

parse_args() {
  while (($#)); do
    case "$1" in
      --env-file) (($# >= 2)) || fatal "Для --env-file нужен путь."; ENV_FILE="$2"; shift ;;
      --delete-data) DELETE_DATA=1 ;;
      --confirm-delete) (($# >= 2)) || fatal "Для --confirm-delete нужна фраза."; DELETE_CONFIRMATION="$2"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) fatal "Неизвестный параметр: $1. Используйте --help." ;;
    esac
    shift
  done
  if (( DELETE_DATA )); then
    [[ "$DELETE_CONFIRMATION" == "$DELETE_PHRASE" ]] || fatal "Удаление данных не подтверждено. Нужна точная фраза: $DELETE_PHRASE"
  elif [[ -n "$DELETE_CONFIRMATION" ]]; then
    fatal "--confirm-delete допустим только вместе с --delete-data."
  fi
}

configure_docker() {
  command -v docker >/dev/null 2>&1 || fatal "Docker не найден."
  if docker info >/dev/null 2>&1; then DOCKER_CMD=(docker)
  elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then DOCKER_CMD=(sudo docker)
  else fatal "Docker daemon недоступен."; fi
  "${DOCKER_CMD[@]}" compose version >/dev/null 2>&1 || fatal "Docker Compose недоступен."
}

compose() { "${DOCKER_CMD[@]}" compose --project-directory "$PROJECT_ROOT" --env-file "$ENV_FILE" "$@"; }

assert_owned_containers() {
  local container_id working_dir
  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    working_dir="$("${DOCKER_CMD[@]}" inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$container_id" 2>/dev/null || true)"
    [[ "$working_dir" == "$PROJECT_ROOT" ]] || fatal "Container $container_id принадлежит другому Compose working directory: ${working_dir:-unknown}"
  done < <(compose ps -aq 2>/dev/null)
}

main() {
  parse_args "$@"
  [[ -f "$ENV_FILE" ]] || fatal "Env-файл отсутствует: $ENV_FILE"
  configure_docker
  compose config --quiet >/dev/null 2>&1 || fatal "Compose config невалиден."
  assert_owned_containers
  if (( DELETE_DATA )); then
    compose down --remove-orphans --volumes
    printf '[OK] Containers, networks и persistent volumes удалены. Файлы проекта и %s сохранены.\n' "$ENV_FILE"
  else
    compose down --remove-orphans
    printf '[OK] Containers удалены. Persistent volumes, конфигурация и %s сохранены.\n' "$ENV_FILE"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
