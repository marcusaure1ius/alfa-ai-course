#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

# Обновление КОДА starter kit на уже развёрнутом хосте. Версию n8n обновляет
# scripts/update.sh; этот скрипт меняет только файлы репозитория, сохраняя
# состояние установки и Docker volumes.
#
# Скрипт рассчитан на запуск ИЗ НОВОГО релиза, а не с обновляемого хоста:
# bootstrap-обёртка релиза распаковывает архив и вызывает его при
# N8N_BOOTSTRAP_UPDATE_CODE=1. Поэтому путь обновления работает и для хостов,
# развёрнутых до появления этого скрипта: логика приезжает в новом артефакте.
#
# Правило переноса состояния намеренно без перечня имён: кодом владеет релиз,
# поэтому верхнеуровневые записи установки, которых НЕТ в новом дереве,
# считаются состоянием и переносятся целиком (.env, backups/, .lifecycle/ и
# любые будущие). Неизвестная запись сохраняется, а не теряется.

SOURCE_TREE=""
TARGET_COMMIT=""
INSTALL_ROOT="/opt/n8n-entrepreneur-starter-kit"
ASSUME_YES=0
SKIP_RESTART=0
SWAP_STARTED=0
SWAP_DONE=0
OLD_TREE=""
STAGED_TREE=""
CODE_BACKUP_ARCHIVE=""
declare -a RESTART_PROJECT_NAMES=()
declare -a RESTART_PROJECT_FILES=()

usage() {
  cat <<'EOF'
Обновление кода starter kit поверх существующей установки без потери данных.

Использование:
  ./scripts/update-code.sh --source DIR --release-commit SHA
                           [--install-root PATH] [--yes] [--skip-restart]

Обычно скрипт вызывает bootstrap нового релиза:
  N8N_BOOTSTRAP_UPDATE_CODE=1 sh install.sh
Подробности и порядок действий: docs/starter-kit-code-update.md.

--source DIR         Распакованное дерево нового релиза.
--release-commit SHA Полный commit нового релиза (40 hex-символов).
--install-root PATH  Существующая установка (по умолчанию /opt/n8n-entrepreneur-starter-kit).
--yes                Не задавать интерактивный вопрос.
--skip-restart       Не перезапускать Docker Compose stack после замены кода.

До первой мутации выполняются только проверки: несовпадение условий
останавливает скрипт без изменений. Данные, secrets и volumes не затрагиваются;
прежнее дерево кода сохраняется рядом для ручного отката.
EOF
}

log() { printf '[INFO] %s\n' "$*" >&2; }
pass() { printf '[PASS] %s\n' "$*" >&2; }
fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }

parse_args() {
  while (($#)); do
    case "$1" in
      --source) (($# >= 2)) || fatal "Для --source нужен путь."; SOURCE_TREE="$2"; shift ;;
      --release-commit) (($# >= 2)) || fatal "Для --release-commit нужен commit."; TARGET_COMMIT="$2"; shift ;;
      --install-root) (($# >= 2)) || fatal "Для --install-root нужен путь."; INSTALL_ROOT="$2"; shift ;;
      --yes) ASSUME_YES=1 ;;
      --skip-restart) SKIP_RESTART=1 ;;
      -h|--help) usage; exit 0 ;;
      *) fatal "Неизвестный параметр: $1. Используйте --help." ;;
    esac
    shift
  done
  [[ -n "$SOURCE_TREE" ]] || fatal "Укажите --source с деревом нового релиза."
  [[ -n "$TARGET_COMMIT" ]] || fatal "Укажите --release-commit нового релиза."
}

on_exit() {
  local code=$?
  trap - EXIT
  if (( code != 0 && SWAP_STARTED )); then
    if (( SWAP_DONE )); then
      # Код уже заменён; откатываемся к прежнему дереву, чтобы хост не остался
      # в наполовину перенесённом состоянии.
      if [[ -e "$INSTALL_ROOT" ]]; then
        mv -f -- "$INSTALL_ROOT" "$INSTALL_ROOT.failed-update-$$" 2>/dev/null || true
      fi
      if mv -- "$OLD_TREE" "$INSTALL_ROOT" 2>/dev/null; then
        printf '[FAIL] Обновление прервано; прежнее дерево кода возвращено на место.\n' >&2
        printf '[FAIL] Неудавшееся новое дерево: %s.failed-update-%s\n' "$INSTALL_ROOT" "$$" >&2
      else
        printf '[FAIL] Автовосстановление не удалось. Прежнее дерево: %s\n' "$OLD_TREE" >&2
      fi
    elif [[ -n "$OLD_TREE" && -e "$OLD_TREE" && ! -e "$INSTALL_ROOT" ]]; then
      mv -- "$OLD_TREE" "$INSTALL_ROOT" 2>/dev/null || true
      printf '[FAIL] Обновление прервано до замены; установка возвращена на место.\n' >&2
    fi
  fi
  exit "$code"
}

validate_inputs() {
  [[ "$TARGET_COMMIT" =~ ^[0-9a-f]{40}$ ]] \
    || fatal "release-commit должен быть полным commit из 40 hex-символов."
  [[ -d "$SOURCE_TREE" ]] || fatal "Дерево нового релиза не существует: $SOURCE_TREE"
  SOURCE_TREE="$(cd -- "$SOURCE_TREE" && pwd -P)"
  [[ -x "$SOURCE_TREE/scripts/install.sh" ]] \
    || fatal "Дерево нового релиза не содержит executable scripts/install.sh."
  [[ -f "$SOURCE_TREE/docker-compose.yml" ]] \
    || fatal "Дерево нового релиза не содержит docker-compose.yml."
  [[ ! -e "$SOURCE_TREE/.env" ]] \
    || fatal "Дерево нового релиза содержит .env — это не чистый релиз."

  [[ -d "$INSTALL_ROOT" ]] || fatal "Установка не найдена: $INSTALL_ROOT"
  INSTALL_ROOT="$(cd -- "$INSTALL_ROOT" && pwd -P)"
  [[ "$SOURCE_TREE" != "$INSTALL_ROOT" ]] \
    || fatal "Дерево релиза и установка не могут совпадать."
  [[ -f "$INSTALL_ROOT/scripts/install.sh" ]] \
    || fatal "Каталог $INSTALL_ROOT не похож на установку starter kit."
  [[ -f "$INSTALL_ROOT/.release-commit" ]] \
    || fatal "В установке нет .release-commit: она создана не one-command installer. Используйте документированный migration path, а не обновление кода."

  local parent
  parent="$(dirname -- "$INSTALL_ROOT")"
  [[ -w "$parent" && -w "$INSTALL_ROOT" ]] \
    || fatal "Нет прав записи в $parent или $INSTALL_ROOT; запустите от root/sudo."

  if [[ -f "$INSTALL_ROOT/.env" ]]; then
    local mode
    mode="$(stat -c '%a' "$INSTALL_ROOT/.env" 2>/dev/null || stat -f '%Lp' "$INSTALL_ROOT/.env" 2>/dev/null || true)"
    [[ "$mode" == 600 ]] || fatal ".env установки должен иметь mode 0600."
  fi
}

detect_running_projects() {
  RESTART_PROJECT_NAMES=()
  RESTART_PROJECT_FILES=()
  (( ! SKIP_RESTART )) || return 0
  command -v docker >/dev/null 2>&1 \
    || fatal "Docker не найден. Либо установите его, либо запустите с --skip-restart."
  docker compose version >/dev/null 2>&1 \
    || fatal "Docker Compose недоступен. Либо почините его, либо запустите с --skip-restart."
  command -v python3 >/dev/null 2>&1 \
    || fatal "python3 нужен для разбора docker compose ls. Либо установите его, либо запустите с --skip-restart."
  local name files
  while IFS=$'\t' read -r name files; do
    [[ -n "$name" ]] || continue
    RESTART_PROJECT_NAMES+=("$name")
    RESTART_PROJECT_FILES+=("$files")
  done < <(docker compose ls --all --format json \
    | python3 -c '
import json
import sys

root = sys.argv[1].rstrip("/") + "/"
for project in json.load(sys.stdin):
    files = [f for f in (project.get("ConfigFiles") or "").split(",") if f]
    if any(f == root.rstrip("/") or f.startswith(root) for f in files):
        print(project["Name"] + "\t" + ",".join(files))
' "$INSTALL_ROOT")
  if (( ${#RESTART_PROJECT_NAMES[@]} == 0 )); then
    log "Запущенных Compose-проектов из $INSTALL_ROOT не найдено; перезапуск не потребуется."
  fi
}

backup_code() {
  local backup_dir stamp short archive
  backup_dir="$INSTALL_ROOT/backups/pre-code-update"
  mkdir -p "$backup_dir"
  chmod 0700 "$backup_dir" "$INSTALL_ROOT/backups" 2>/dev/null || true
  stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  short="$(cut -c1-12 "$INSTALL_ROOT/.release-commit")"
  archive="$backup_dir/starter-kit-code-$short-$stamp.tar.gz"
  # backups/ исключён: архив не должен вкладывать прежние архивы сам в себя.
  tar -czf "$archive" \
    -C "$(dirname -- "$INSTALL_ROOT")" \
    --exclude "$(basename -- "$INSTALL_ROOT")/backups" \
    "$(basename -- "$INSTALL_ROOT")"
  (cd "$backup_dir" && sha256sum "$(basename -- "$archive")" > "$(basename -- "$archive").sha256")
  chmod 0600 "$archive" "$archive.sha256"
  CODE_BACKUP_ARCHIVE="$archive"
}

stage_new_tree() {
  local parent stamp
  parent="$(dirname -- "$INSTALL_ROOT")"
  stamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  STAGED_TREE="$parent/.staging-code-update-$stamp-$$"
  OLD_TREE="$parent/$(basename -- "$INSTALL_ROOT").pre-update-$stamp"
  [[ ! -e "$STAGED_TREE" && ! -e "$OLD_TREE" ]] \
    || fatal "Staging или pre-update каталог уже существует; уберите остатки прошлого запуска."
  cp -a -- "$SOURCE_TREE" "$STAGED_TREE"
}

swap_and_carry() {
  SWAP_STARTED=1
  mv -- "$INSTALL_ROOT" "$OLD_TREE"
  mv -- "$STAGED_TREE" "$INSTALL_ROOT"
  SWAP_DONE=1
  # Перенос состояния: всё верхнеуровневое из прежней установки, чего нет в
  # новом дереве, — состояние. Правило без списка имён: неизвестная запись
  # переносится, а не теряется.
  local entry name
  for entry in "$OLD_TREE"/* "$OLD_TREE"/.[!.]* "$OLD_TREE"/..?*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    name="$(basename -- "$entry")"
    if [[ ! -e "$INSTALL_ROOT/$name" && ! -L "$INSTALL_ROOT/$name" ]]; then
      mv -- "$entry" "$INSTALL_ROOT/$name"
    fi
  done
  printf '%s\n' "$TARGET_COMMIT" > "$INSTALL_ROOT/.release-commit"
  chmod 0644 "$INSTALL_ROOT/.release-commit"
  SWAP_STARTED=0
}

restart_projects() {
  (( ! SKIP_RESTART )) || { log "Перезапуск пропущен по --skip-restart."; return 0; }
  (( ${#RESTART_PROJECT_NAMES[@]} )) || return 0
  local index files file file_list args ran_doctor=0 doctor_code
  for index in "${!RESTART_PROJECT_NAMES[@]}"; do
    files="${RESTART_PROJECT_FILES[$index]}"
    args=(--project-directory "$INSTALL_ROOT")
    [[ ! -f "$INSTALL_ROOT/.env" ]] || args+=(--env-file "$INSTALL_ROOT/.env")
    IFS=',' read -r -a file_list <<<"$files"
    for file in "${file_list[@]}"; do
      args+=(-f "$file")
    done
    log "Перезапуск Compose-проекта ${RESTART_PROJECT_NAMES[$index]} с новым кодом."
    docker compose "${args[@]}" up -d --wait --wait-timeout 300 >/dev/null
    pass "Проект ${RESTART_PROJECT_NAMES[$index]} перезапущен и здоров."
    if [[ ",$files," == *"/docker-compose.yml,"* && -x "$INSTALL_ROOT/scripts/doctor.sh" && -f "$INSTALL_ROOT/.env" && $ran_doctor -eq 0 ]]; then
      ran_doctor=1
      set +e
      "$INSTALL_ROOT/scripts/doctor.sh" --env-file "$INSTALL_ROOT/.env" --local-only >/dev/null
      doctor_code=$?
      set -e
      (( doctor_code < 2 )) || fatal "doctor.sh после обновления обнаружил FAIL."
      pass "doctor.sh --local-only после обновления без FAIL."
    fi
  done
}

main() {
  local current_commit answer
  parse_args "$@"
  validate_inputs

  current_commit="$(cat "$INSTALL_ROOT/.release-commit")"
  if [[ "$current_commit" == "$TARGET_COMMIT" ]]; then
    pass "Установка уже на release $TARGET_COMMIT; обновление не требуется."
    exit 0
  fi

  if (( ! ASSUME_YES )); then
    printf 'Обновить код starter kit %s -> %s? Данные и volumes сохраняются. [y/N]: ' \
      "$(printf '%s' "$current_commit" | cut -c1-12)" "$(printf '%s' "$TARGET_COMMIT" | cut -c1-12)"
    IFS= read -r answer || fatal "Подтверждение не получено."
    [[ "$answer" == y || "$answer" == Y ]] || fatal "Обновление отменено."
  fi

  detect_running_projects
  backup_code
  pass "Backup кода: $CODE_BACKUP_ARCHIVE"
  stage_new_tree
  swap_and_carry
  pass "Код обновлён: $current_commit -> $TARGET_COMMIT"
  restart_projects

  printf 'UPDATED_FROM_COMMIT=%s\n' "$current_commit"
  printf 'UPDATED_TO_COMMIT=%s\n' "$TARGET_COMMIT"
  printf 'CODE_BACKUP_ARCHIVE=%s\n' "$CODE_BACKUP_ARCHIVE"
  printf 'PREVIOUS_CODE_TREE=%s\n' "$OLD_TREE"
  log "Прежнее дерево кода сохранено: $OLD_TREE"
  log "После проверки удалите его вручную; для отката см. docs/starter-kit-code-update.md."
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then trap on_exit EXIT; main "$@"; fi
