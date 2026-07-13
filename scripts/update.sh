#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
ENV_FILE="$PROJECT_ROOT/.env"
BACKUP_DIR="$PROJECT_ROOT/backups/pre-update"
STATE_FILE="$PROJECT_ROOT/.lifecycle/update-state.env"
TARGET_VERSION=""
ASSUME_YES=0
MUTATION_STARTED=0
PREVIOUS_VERSION=""
BACKUP_ARCHIVE=""
declare -a DOCKER_CMD=(docker)

usage() {
  cat <<'EOF'
Контролируемое обновление n8n только по research-approved lifecycle pair.

Использование:
  ./scripts/update.sh --to 2.29.10 [--env-file PATH] [--backup-dir DIR]
                      [--state-file PATH] [--yes]

Перед mutation обязателен согласованный backup. При любой ошибке после mutation
скрипт возвращает non-zero и печатает restore-based rollback command без secrets.
Единственная разрешённая пара MVP: 2.29.9 -> 2.29.10.
EOF
}

log() { printf '[INFO] %s\n' "$*" >&2; }
fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }
read_key() { awk -F= -v wanted="$1" '$1 == wanted {sub(/^[^=]*=/, ""); print; exit}' "$2"; }

parse_args() {
  while (($#)); do
    case "$1" in
      --to) (($# >= 2)) || fatal "Для --to нужна версия."; TARGET_VERSION="$2"; shift ;;
      --env-file) (($# >= 2)) || fatal "Для --env-file нужен путь."; ENV_FILE="$2"; shift ;;
      --backup-dir) (($# >= 2)) || fatal "Для --backup-dir нужен путь."; BACKUP_DIR="$2"; shift ;;
      --state-file) (($# >= 2)) || fatal "Для --state-file нужен путь."; STATE_FILE="$2"; shift ;;
      --yes) ASSUME_YES=1 ;;
      -h|--help) usage; exit 0 ;;
      *) fatal "Неизвестный параметр: $1. Используйте --help." ;;
    esac
    shift
  done
  [[ -n "$TARGET_VERSION" ]] || fatal "Укажите explicit target через --to."
}

approved_pair() { [[ "$1" == 2.29.9 && "$2" == 2.29.10 ]]; }

configure_docker() {
  command -v docker >/dev/null 2>&1 || fatal "Docker не найден."
  if docker info >/dev/null 2>&1; then DOCKER_CMD=(docker)
  elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then DOCKER_CMD=(sudo docker)
  else fatal "Docker daemon недоступен."; fi
  "${DOCKER_CMD[@]}" compose version >/dev/null 2>&1 || fatal "Docker Compose недоступен."
}

compose() { "${DOCKER_CMD[@]}" compose --project-directory "$PROJECT_ROOT" --env-file "$ENV_FILE" "$@"; }

replace_env_version() {
  local version="$1" temporary
  temporary="$(mktemp "$(dirname "$ENV_FILE")/.env.tmp.XXXXXX")"
  awk -v value="$version" 'BEGIN {found=0} /^N8N_VERSION=/ {print "N8N_VERSION=" value; found=1; next} {print} END {if (!found) print "N8N_VERSION=" value}' "$ENV_FILE" > "$temporary"
  chmod 0600 "$temporary"
  mv -f -- "$temporary" "$ENV_FILE"
}

write_state() {
  local status="$1" current="$2" previous="$3" archive="$4" temporary directory
  directory="$(dirname "$STATE_FILE")"; mkdir -p "$directory"; chmod 0700 "$directory"
  temporary="$(mktemp "$directory/.update-state.tmp.XXXXXX")"
  printf 'STATUS=%s\nCURRENT_VERSION=%s\nPREVIOUS_VERSION=%s\nBACKUP_ARCHIVE=%s\nUPDATED_AT=%s\n' \
    "$status" "$current" "$previous" "$archive" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" > "$temporary"
  chmod 0600 "$temporary"
  mv -f -- "$temporary" "$STATE_FILE"
}

on_exit() {
  local code=$?
  trap - EXIT
  if (( code != 0 && MUTATION_STARTED )); then
    printf '[FAIL] Update не прошёл health validation. Не делайте image-only downgrade.\n' >&2
    printf '[FAIL] Recovery: %q --env-file %q --state-file %q --yes\n' "$SCRIPT_DIR/rollback.sh" "$ENV_FILE" "$STATE_FILE" >&2
    [[ -z "$BACKUP_ARCHIVE" ]] || printf '[FAIL] Pre-update archive: %s\n' "$BACKUP_ARCHIVE" >&2
  fi
  exit "$code"
}

main() {
  local mode answer backup_output doctor_code
  parse_args "$@"
  [[ -f "$ENV_FILE" ]] || fatal "Env-файл отсутствует: $ENV_FILE"
  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || true)"
  [[ "$mode" == 600 ]] || fatal "Env-файл должен иметь mode 0600."
  PREVIOUS_VERSION="$(read_key N8N_VERSION "$ENV_FILE")"; PREVIOUS_VERSION="${PREVIOUS_VERSION:-2.29.10}"
  approved_pair "$PREVIOUS_VERSION" "$TARGET_VERSION" || fatal "Разрешена только explicit pair 2.29.9 -> 2.29.10."
  configure_docker
  compose config --quiet >/dev/null 2>&1 || fatal "Compose config невалиден."
  [[ -n "$(compose ps --status running -q postgres)" && -n "$(compose ps --status running -q n8n)" ]] || fatal "PostgreSQL и n8n должны быть running."
  if (( ! ASSUME_YES )); then
    printf 'Обновить n8n %s -> %s после обязательного backup? [y/N]: ' "$PREVIOUS_VERSION" "$TARGET_VERSION"
    IFS= read -r answer || fatal "Подтверждение не получено."
    [[ "$answer" == y || "$answer" == Y ]] || fatal "Update отменён."
  fi
  mkdir -p "$BACKUP_DIR"; chmod 0700 "$BACKUP_DIR"
  backup_output="$("$SCRIPT_DIR/backup.sh" --env-file "$ENV_FILE" --output-dir "$BACKUP_DIR")"
  BACKUP_ARCHIVE="$(printf '%s\n' "$backup_output" | awk -F= '$1 == "BACKUP_ARCHIVE" {print $2; exit}')"
  [[ -n "$BACKUP_ARCHIVE" && -f "$BACKUP_ARCHIVE" && -f "$BACKUP_ARCHIVE.sha256" ]] || fatal "Successful pre-update backup не подтверждён."
  write_state update_pending "$TARGET_VERSION" "$PREVIOUS_VERSION" "$BACKUP_ARCHIVE"
  N8N_VERSION="$TARGET_VERSION" compose pull n8n >/dev/null
  replace_env_version "$TARGET_VERSION"
  MUTATION_STARTED=1
  compose up -d --wait --wait-timeout 300 n8n caddy >/dev/null
  set +e; "$SCRIPT_DIR/doctor.sh" --env-file "$ENV_FILE" --local-only >/dev/null; doctor_code=$?; set -e
  (( doctor_code < 2 )) || fatal "Post-update doctor обнаружил FAIL."
  write_state updated "$TARGET_VERSION" "$PREVIOUS_VERSION" "$BACKUP_ARCHIVE"
  MUTATION_STARTED=0
  printf 'UPDATED_VERSION=%s\nPREVIOUS_VERSION=%s\nBACKUP_ARCHIVE=%s\nSTATE_FILE=%s\n' "$TARGET_VERSION" "$PREVIOUS_VERSION" "$BACKUP_ARCHIVE" "$STATE_FILE"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then trap on_exit EXIT; main "$@"; fi
