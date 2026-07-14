#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

readonly EXIT_USAGE=2
readonly EXIT_PRIVILEGES=13
readonly EXIT_UFW=31
readonly EXIT_SSH_GUARD=32

MODE=""
ASSUME_YES=0
SSH_PORT_VALUE=""
ACTIVE_SSH_PORT=""
UFW_BIN="${UFW_BIN:-ufw}"

usage() {
  cat <<'EOF'
Безопасная opt-in настройка UFW для n8n Entrepreneur Starter Kit.

Использование:
  ./scripts/firewall.sh --preview [--ssh-port PORT]
  ./scripts/firewall.sh --apply [--ssh-port PORT] [--yes]
  ./scripts/firewall.sh --check

Режимы:
  --preview        Показать точный план правил без sudo и изменений.
  --apply          Применить правила после проверки текущего SSH-пути и
                   отдельного подтверждения.
  --check          Только показать текущий verbose status UFW.

Параметры:
  --ssh-port PORT  SSH-порт 1..65535. В активной SSH-сессии значение должно
                   совпадать с server port из SSH_CONNECTION. Вне SSH параметр
                   обязателен для --preview и --apply.
  --yes            Подтвердить --apply без prompt. Не отключает SSH guard.
  -h, --help       Показать справку.

Без явного --apply скрипт никогда не устанавливает UFW и не меняет firewall.
При применении SSH allow-rule создаётся первой, а UFW включается последним.

Exit codes: 0 — success; 2 — arguments; 13 — нет root/sudo;
31 — UFW/install/apply failure; 32 — SSH safety guard.
EOF
}

info() { printf '[INFO] %s\n' "$*"; }
pass() { printf '[PASS] %s\n' "$*"; }
fatal() {
  local code="$1"
  shift
  printf '[FAIL] %s\n' "$*" >&2
  exit "$code"
}

valid_port() {
  [[ "$1" =~ ^[0-9]+$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 ))
}

detect_active_ssh_port() {
  local client_ip client_port server_ip server_port extra
  [[ -n "${SSH_CONNECTION:-}" ]] || return 1
  read -r client_ip client_port server_ip server_port extra <<<"$SSH_CONNECTION"
  [[ -n "$client_ip" && -n "$client_port" && -n "$server_ip" && -z "${extra:-}" ]] || return 1
  valid_port "$server_port" || return 1
  ACTIVE_SSH_PORT="$server_port"
}

parse_args() {
  while (($#)); do
    case "$1" in
      --preview|--apply|--check)
        [[ -z "$MODE" ]] || fatal "$EXIT_USAGE" "Выберите ровно один режим."
        MODE="${1#--}"
        ;;
      --ssh-port)
        (($# >= 2)) || fatal "$EXIT_USAGE" "Для --ssh-port нужен номер порта."
        SSH_PORT_VALUE="$2"
        shift
        ;;
      --yes) ASSUME_YES=1 ;;
      -h|--help) usage; exit 0 ;;
      *) fatal "$EXIT_USAGE" "Неизвестный параметр: $1. Используйте --help." ;;
    esac
    shift
  done

  [[ -n "$MODE" ]] || fatal "$EXIT_USAGE" "Укажите --preview, --apply или --check."
  if [[ "$MODE" == check ]]; then
    [[ -z "$SSH_PORT_VALUE" && "$ASSUME_YES" == 0 ]] \
      || fatal "$EXIT_USAGE" "--check не принимает --ssh-port или --yes."
    return
  fi
  [[ -z "$SSH_PORT_VALUE" ]] || valid_port "$SSH_PORT_VALUE" \
    || fatal "$EXIT_USAGE" "SSH port должен быть целым числом 1..65535."
  [[ "$MODE" == apply || "$ASSUME_YES" == 0 ]] \
    || fatal "$EXIT_USAGE" "--yes допустим только вместе с --apply."
}

resolve_ssh_port() {
  detect_active_ssh_port || true
  if [[ -n "$ACTIVE_SSH_PORT" ]]; then
    if [[ -n "$SSH_PORT_VALUE" && "$SSH_PORT_VALUE" != "$ACTIVE_SSH_PORT" ]]; then
      fatal "$EXIT_SSH_GUARD" "--ssh-port=$SSH_PORT_VALUE не совпадает с текущим SSH server port $ACTIVE_SSH_PORT. Сессия не будет поставлена под риск."
    fi
    SSH_PORT_VALUE="$ACTIVE_SSH_PORT"
    pass "Текущий SSH server port определён: $SSH_PORT_VALUE."
  fi
  [[ -n "$SSH_PORT_VALUE" ]] \
    || fatal "$EXIT_SSH_GUARD" "Нет активной SSH-сессии. Укажите проверенный port через --ssh-port."
}

print_plan() {
  cat <<EOF
[PLAN] $UFW_BIN allow $SSH_PORT_VALUE/tcp comment 'n8n-starter-kit SSH guard'
[PLAN] $UFW_BIN allow 80/tcp comment 'n8n-starter-kit HTTP ACME'
[PLAN] $UFW_BIN allow 443/tcp comment 'n8n-starter-kit HTTPS'
[PLAN] $UFW_BIN allow 443/udp comment 'n8n-starter-kit HTTP3'
[PLAN] $UFW_BIN default deny incoming
[PLAN] $UFW_BIN default allow outgoing
[PLAN] $UFW_BIN --force enable
EOF
  info "Существующие UFW rules не удаляются. SSH разрешается до enable."
}

root_command() {
  if (( EUID == 0 )); then
    "$@"
  else
    command -v sudo >/dev/null 2>&1 || fatal "$EXIT_PRIVILEGES" "Нужен sudo или запуск от root."
    sudo "$@"
  fi
}

ensure_ufw() {
  command -v "$UFW_BIN" >/dev/null 2>&1 && return
  [[ "$UFW_BIN" == ufw ]] || fatal "$EXIT_UFW" "Не найден UFW_BIN: $UFW_BIN"
  info "UFW отсутствует; будет установлен из Ubuntu repository."
  root_command apt-get update || fatal "$EXIT_UFW" "apt-get update завершился ошибкой."
  root_command apt-get install -y ufw || fatal "$EXIT_UFW" "Не удалось установить ufw."
  command -v "$UFW_BIN" >/dev/null 2>&1 || fatal "$EXIT_UFW" "ufw не найден после установки."
}

confirm_apply() {
  local answer
  (( ASSUME_YES )) && return
  [[ -t 0 ]] || fatal "$EXIT_USAGE" "Для non-interactive --apply сначала проверьте --preview и повторите с --yes."
  printf 'Применить показанный план UFW, сохранив SSH port %s? [y/N]: ' "$SSH_PORT_VALUE"
  IFS= read -r answer || fatal "$EXIT_USAGE" "Подтверждение не получено."
  [[ "$answer" == y || "$answer" == Y ]] || fatal "$EXIT_USAGE" "Изменение firewall отменено."
}

apply_firewall() {
  root_command "$UFW_BIN" allow "$SSH_PORT_VALUE/tcp" comment 'n8n-starter-kit SSH guard' \
    || fatal "$EXIT_UFW" "Не удалось сначала разрешить текущий SSH port."
  root_command "$UFW_BIN" allow 80/tcp comment 'n8n-starter-kit HTTP ACME' \
    || fatal "$EXIT_UFW" "Не удалось разрешить TCP 80."
  root_command "$UFW_BIN" allow 443/tcp comment 'n8n-starter-kit HTTPS' \
    || fatal "$EXIT_UFW" "Не удалось разрешить TCP 443."
  root_command "$UFW_BIN" allow 443/udp comment 'n8n-starter-kit HTTP3' \
    || fatal "$EXIT_UFW" "Не удалось разрешить UDP 443."
  root_command "$UFW_BIN" default deny incoming \
    || fatal "$EXIT_UFW" "Не удалось задать deny incoming."
  root_command "$UFW_BIN" default allow outgoing \
    || fatal "$EXIT_UFW" "Не удалось задать allow outgoing."
  root_command "$UFW_BIN" --force enable \
    || fatal "$EXIT_UFW" "Не удалось включить UFW. SSH allow-rule уже создан; проверьте status."
  root_command "$UFW_BIN" status verbose \
    || fatal "$EXIT_UFW" "Rules применены, но status UFW недоступен."
  pass "UFW включён; текущий SSH port и публичные 80/443 разрешены."
}

main() {
  parse_args "$@"
  if [[ "$MODE" == check ]]; then
    command -v "$UFW_BIN" >/dev/null 2>&1 || fatal "$EXIT_UFW" "ufw не установлен."
    root_command "$UFW_BIN" status verbose
    return
  fi

  resolve_ssh_port
  print_plan
  [[ "$MODE" == preview ]] && return
  confirm_apply
  ensure_ufw
  apply_firewall
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
