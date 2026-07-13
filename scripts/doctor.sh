#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
ENV_FILE="$PROJECT_ROOT/.env"
OS_RELEASE_FILE="${OS_RELEASE_FILE:-/etc/os-release}"
MEMINFO_FILE="${MEMINFO_FILE:-/proc/meminfo}"
LOCAL_ONLY=0
WARNINGS=0
FAILURES=0
N8N_HOST_VALUE=""
POSTGRES_DB_VALUE="n8n"
POSTGRES_USER_VALUE="n8n"
declare -a DOCKER_CMD=(docker)

usage() {
  cat <<'EOF'
Read-only диагностика n8n Entrepreneur Starter Kit.

Использование:
  ./scripts/doctor.sh [--env-file PATH] [--local-only]

Параметры:
  --env-file PATH  Runtime env-файл (по умолчанию .env проекта).
  --local-only     Не выполнять DNS, public HTTPS и certificate checks.
  -h, --help       Показать справку.

Exit codes: 0 — только OK; 1 — есть WARN; 2 — есть FAIL.
Скрипт ничего не исправляет и не печатает значения secrets.
EOF
}

result() {
  local severity="$1" key="$2" message="$3" hint="$4"
  case "$severity" in
    OK) ;;
    WARN) WARNINGS=$((WARNINGS + 1)) ;;
    FAIL) FAILURES=$((FAILURES + 1)) ;;
    *) printf '[FAIL] report.internal — неизвестная severity | Что делать: сообщите разработчику.\n' >&2; exit 2 ;;
  esac
  printf '[%s] %s — %s | Что делать: %s\n' "$severity" "$key" "$message" "$hint"
}

parse_args() {
  while (($#)); do
    case "$1" in
      --env-file)
        (($# >= 2)) || { printf 'Для --env-file нужен путь.\n' >&2; exit 2; }
        ENV_FILE="$2"
        shift
        ;;
      --local-only) LOCAL_ONLY=1 ;;
      -h|--help) usage; exit 0 ;;
      *) printf 'Неизвестный параметр: %s. Используйте --help.\n' "$1" >&2; exit 2 ;;
    esac
    shift
  done
}

read_public_config() {
  local line key value
  [[ -f "$ENV_FILE" ]] || return 1
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    case "$key" in
      N8N_HOST) N8N_HOST_VALUE="$value" ;;
      POSTGRES_DB) POSTGRES_DB_VALUE="$value" ;;
      POSTGRES_USER) POSTGRES_USER_VALUE="$value" ;;
    esac
  done < "$ENV_FILE"
}

check_host() {
  local id version arch mem_kb disk_kb
  if [[ -r "$OS_RELEASE_FILE" ]]; then
    id="$(awk -F= '$1 == "ID" {gsub(/^\"|\"$/, "", $2); print $2; exit}' "$OS_RELEASE_FILE")"
    version="$(awk -F= '$1 == "VERSION_ID" {gsub(/^\"|\"$/, "", $2); print $2; exit}' "$OS_RELEASE_FILE")"
    if [[ "$id" == ubuntu && "$version" == 24.04 ]]; then
      result OK host.os "Ubuntu 24.04 LTS" "действий не требуется."
    else
      result FAIL host.os "неподдерживаемая ОС ${id:-unknown} ${version:-unknown}" "используйте Ubuntu 24.04 LTS."
    fi
  else
    result FAIL host.os "не найден os-release" "проверьте целостность ОС."
  fi

  arch="${UNAME_MACHINE_OVERRIDE:-$(uname -m)}"
  if [[ "$arch" == x86_64 || "$arch" == amd64 ]]; then
    result OK host.arch "architecture x86_64" "действий не требуется."
  else
    result FAIL host.arch "неподдерживаемая architecture $arch" "используйте amd64 VPS."
  fi

  mem_kb="${MEM_TOTAL_KB_OVERRIDE:-$(awk '/^MemTotal:/ {print $2}' "$MEMINFO_FILE" 2>/dev/null || printf 0)}"
  disk_kb="${DISK_AVAILABLE_KB_OVERRIDE:-$(df -Pk "$PROJECT_ROOT" | awk 'NR==2 {print $4}')}"
  if (( mem_kb >= 2097152 )); then
    result OK host.ram "RAM не меньше 2 GiB" "действий не требуется."
  elif (( mem_kb >= 1048576 )); then
    result WARN host.ram "RAM 1–2 GiB подходит только для теста" "увеличьте RAM до 2 GiB или больше."
  else
    result FAIL host.ram "RAM меньше 1 GiB" "увеличьте RAM минимум до 1 GiB."
  fi
  if (( disk_kb >= 20971520 )); then
    result OK host.disk "свободно не меньше 20 GiB" "действий не требуется."
  elif (( disk_kb >= 10485760 )); then
    result WARN host.disk "свободно 10–20 GiB" "контролируйте execution data и backup."
  else
    result FAIL host.disk "свободно меньше 10 GiB" "освободите минимум 10 GiB."
  fi
}

check_env() {
  local mode
  if [[ ! -f "$ENV_FILE" ]]; then
    result FAIL config.env "env-файл отсутствует" "восстановите исходный .env; не генерируйте новый поверх existing volumes."
    return
  fi
  mode="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || true)"
  if [[ "$mode" == 600 ]]; then
    result OK config.permissions "env-файл имеет mode 0600" "действий не требуется."
  else
    result FAIL config.permissions "env-файл имеет небезопасный mode ${mode:-unknown}" "выполните chmod 600 для env-файла."
  fi
  read_public_config || true
  if [[ "$N8N_HOST_VALUE" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$ ]]; then
    result OK config.host "N8N_HOST имеет формат FQDN" "действий не требуется."
  else
    result FAIL config.host "N8N_HOST отсутствует или не является FQDN" "задайте домен без схемы и пути."
  fi
}

configure_docker() {
  if docker info >/dev/null 2>&1; then
    DOCKER_CMD=(docker)
  elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER_CMD=(sudo docker)
  else
    return 1
  fi
  "${DOCKER_CMD[@]}" compose version >/dev/null 2>&1
}

compose() {
  "${DOCKER_CMD[@]}" compose --project-directory "$PROJECT_ROOT" --env-file "$ENV_FILE" "$@"
}

check_container() {
  local service="$1" id status health
  id="$(compose ps -q "$service" 2>/dev/null || true)"
  if [[ -z "$id" ]]; then
    result FAIL "runtime.$service" "container отсутствует" "выполните docker compose up -d."
    return
  fi
  status="$("${DOCKER_CMD[@]}" inspect --format '{{.State.Status}}' "$id" 2>/dev/null || true)"
  health="$("${DOCKER_CMD[@]}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null || true)"
  if [[ "$status" == running && "$health" == healthy ]]; then
    result OK "runtime.$service" "container running/healthy" "действий не требуется."
  elif [[ "$status" == running ]]; then
    result WARN "runtime.$service" "container running, health=$health" "подождите и проверьте docker compose logs $service."
  else
    result FAIL "runtime.$service" "status=${status:-unknown}, health=${health:-unknown}" "проверьте docker compose logs $service."
  fi
}

check_runtime() {
  if ! command -v docker >/dev/null 2>&1; then
    result FAIL runtime.docker "docker command отсутствует" "запустите scripts/install.sh."
    return
  fi
  if ! configure_docker; then
    result FAIL runtime.docker "Docker daemon или Compose недоступен" "проверьте systemctl status docker и sudo-доступ."
    return
  fi
  result OK runtime.docker "Docker daemon и Compose доступны" "действий не требуется."
  if compose config --quiet >/dev/null 2>&1; then
    result OK runtime.compose "Compose config валиден" "действий не требуется."
  else
    result FAIL runtime.compose "Compose config невалиден" "проверьте env-файл командой docker compose config --quiet."
    return
  fi
  check_container postgres
  check_container n8n
  check_container caddy

  if compose exec -T postgres pg_isready -h 127.0.0.1 -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" >/dev/null 2>&1; then
    result OK service.postgres "pg_isready внутри PostgreSQL успешен" "действий не требуется."
  else
    result FAIL service.postgres "pg_isready внутри PostgreSQL неуспешен" "проверьте postgres health и logs."
  fi
  if compose exec -T n8n node -e "fetch('http://127.0.0.1:5678/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    result OK service.n8n "internal /healthz внутри n8n успешен" "действий не требуется."
  else
    result FAIL service.n8n "internal /healthz внутри n8n неуспешен" "проверьте n8n health и logs."
  fi
  if compose exec -T n8n node -e "const h=process.env.N8N_HOST;process.exit(process.env.N8N_EDITOR_BASE_URL==='https://'+h+'/'&&process.env.WEBHOOK_URL==='https://'+h+'/'?0:1)" >/dev/null 2>&1; then
    result OK config.public_urls "editor и webhook base URL согласованы с N8N_HOST" "действий не требуется."
  else
    result FAIL config.public_urls "editor/webhook URL не согласованы с N8N_HOST" "исправьте N8N_EDITOR_BASE_URL и WEBHOOK_URL, затем пересоздайте n8n."
  fi
}

check_external() {
  local dns_ip http_code
  if (( LOCAL_ONLY )); then
    result WARN external.skipped "внешние DNS/HTTPS/certificate checks пропущены" "после DNS propagation запустите doctor.sh без --local-only."
    return
  fi
  if command -v getent >/dev/null 2>&1; then
    dns_ip="$(getent ahostsv4 "$N8N_HOST_VALUE" 2>/dev/null | awk 'NR==1 {print $1}' || true)"
  else
    dns_ip=""
  fi
  if [[ -n "$dns_ip" ]]; then
    result OK external.dns "A-запись разрешается" "убедитесь, что адрес соответствует VPS/NAT."
  else
    result FAIL external.dns "A-запись не разрешается" "создайте или дождитесь распространения DNS A-записи."
  fi

  if command -v curl >/dev/null 2>&1; then
    http_code="$(curl --silent --show-error --location --max-time 15 --output /dev/null --write-out '%{http_code}' "https://$N8N_HOST_VALUE/" 2>/dev/null || true)"
  else
    http_code=""
  fi
  if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    result OK external.https "public editor отвечает по HTTPS" "действий не требуется."
  else
    result FAIL external.https "public HTTPS вернул HTTP ${http_code:-none}" "проверьте DNS, ports 80/443 и caddy logs."
  fi

  if command -v openssl >/dev/null 2>&1 && timeout 15 openssl s_client -connect "$N8N_HOST_VALUE:443" -servername "$N8N_HOST_VALUE" </dev/null 2>/dev/null | openssl x509 -noout -checkend 86400 >/dev/null 2>&1; then
    result OK external.certificate "TLS certificate валиден более 24 часов" "настройте мониторинг срока сертификата."
  else
    result FAIL external.certificate "TLS certificate отсутствует, недействителен или скоро истекает" "проверьте ACME/DNS и caddy logs."
  fi
}

finish_report() {
  printf 'Итог: FAIL=%d WARN=%d\n' "$FAILURES" "$WARNINGS"
  (( FAILURES == 0 )) || return 2
  (( WARNINGS == 0 )) || return 1
  return 0
}

main() {
  parse_args "$@"
  check_host
  check_env
  check_runtime
  check_external
  finish_report
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
