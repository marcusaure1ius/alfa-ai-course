#!/usr/bin/env bash

# Запускается только вручную с explicit disposable marker; contract-проверки
# живут в tests/code_update_test.sh. Репетирует обновление КОДА starter kit на
# одноразовой установке: старый релиз реально работает в Docker, затем bootstrap
# нового релиза обновляет код, а данные, secrets и volumes обязаны сохраниться.
set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
CONFIRM_PHRASE="T-0130-DISPOSABLE"
WORK_ROOT=""
CONFIRMATION=""
OLD_REF="v0.1.12"
INSTALL_ROOT=""
ARTIFACT_DIR=""
ENV_FILE=""
COUNT=0
CLEANUP_ALLOWED=0

usage() {
  cat <<'EOF'
Репетиция обновления кода starter kit в явно помеченной disposable-среде.

Использование:
  work_root="$(mktemp -d "${TMPDIR:-/tmp}/t0130.XXXXXX")"
  printf 'T-0130-DISPOSABLE\n' > "$work_root/.t0130-disposable"
  ./tests/code_update_rehearsal.sh \
    --work-root "$work_root" \
    --confirm-disposable T-0130-DISPOSABLE [--old-ref v0.1.12]

Скрипт отказывается работать вне системного temporary directory, без
marker-файла, при существующих n8n containers/volumes/networks или без локальных
pinned images. HEAD должен быть закоммичен: артефакт обновления собирается из
git archive HEAD. Удаляется только созданная скриптом временная Compose-среда;
redacted evidence остаётся в <work-root>/artifacts.
EOF
}

fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }
ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }

parse_args() {
  while (($#)); do
    case "$1" in
      --work-root) (($# >= 2)) || fatal "Для --work-root нужен путь."; WORK_ROOT="$2"; shift ;;
      --confirm-disposable) (($# >= 2)) || fatal "Для --confirm-disposable нужна фраза."; CONFIRMATION="$2"; shift ;;
      --old-ref) (($# >= 2)) || fatal "Для --old-ref нужен git ref."; OLD_REF="$2"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) fatal "Неизвестный параметр: $1. Используйте --help." ;;
    esac
    shift
  done
}

compose() {
  docker compose --project-directory "$INSTALL_ROOT" --env-file "$ENV_FILE" "$@"
}

sql() {
  compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U n8n -d n8n -At -c "$1"
}

volume_fingerprint() {
  local volume
  for volume in n8n_postgres_data n8n_data n8n_caddy_data n8n_caddy_config; do
    docker volume inspect -f '{{.Name}} {{.CreatedAt}}' "$volume"
  done
}

assert_owned_containers() {
  local id working_dir
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    working_dir="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$id" 2>/dev/null || true)"
    [[ "$working_dir" == "$INSTALL_ROOT" ]] \
      || fatal "Отказ cleanup: container $id принадлежит ${working_dir:-unknown}."
  done < <(docker ps -aq --filter label=com.docker.compose.project=n8n-starter-kit)
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if (( CLEANUP_ALLOWED )) && [[ -n "$INSTALL_ROOT" && -f "$ENV_FILE" ]]; then
    if assert_owned_containers; then
      compose down --remove-orphans --volumes >/dev/null 2>&1 || true
    else
      printf '[FAIL] Ownership check запретил automatic cleanup.\n' >&2
      code=1
    fi
  fi
  exit "$code"
}

main() {
  local tmp_base marker old_commit new_commit artifact tampered secret encryption_key
  local volumes_before volumes_after env_sha_before env_sha_after update_log failure_log
  local previous_tree backup_archive artifact_manifest artifact_manifest_hash image resource

  parse_args "$@"
  [[ "$CONFIRMATION" == "$CONFIRM_PHRASE" ]] \
    || fatal "Нужна точная фраза --confirm-disposable $CONFIRM_PHRASE."
  [[ -d "$WORK_ROOT" ]] || fatal "Work root не существует: $WORK_ROOT"
  WORK_ROOT="$(cd -- "$WORK_ROOT" && pwd -P)"
  tmp_base="$(cd -- "${TMPDIR:-/tmp}" && pwd -P)"
  case "$WORK_ROOT/" in
    "$tmp_base"/*) ;;
    *) fatal "Work root должен находиться внутри temporary directory: $tmp_base" ;;
  esac
  marker="$WORK_ROOT/.t0130-disposable"
  [[ -f "$marker" && "$(cat "$marker")" == "$CONFIRM_PHRASE" ]] \
    || fatal "Marker $marker отсутствует или неверен."
  command -v docker >/dev/null 2>&1 || fatal "Docker отсутствует."
  command -v sha256sum >/dev/null 2>&1 || fatal "sha256sum отсутствует."
  docker info >/dev/null 2>&1 || fatal "Docker daemon недоступен."
  docker compose version >/dev/null 2>&1 || fatal "Docker Compose недоступен."
  old_commit="$(git -C "$ROOT" rev-parse --verify "$OLD_REF^{commit}")" \
    || fatal "Старый ref не резолвится: $OLD_REF"
  new_commit="$(git -C "$ROOT" rev-parse HEAD)"
  [[ "$old_commit" != "$new_commit" ]] || fatal "HEAD совпадает со старым ref; обновлять нечего."
  git -C "$ROOT" archive --format=tar HEAD | tar -tf - | grep -q '^scripts/update-code.sh$' \
    || fatal "HEAD не содержит scripts/update-code.sh; закоммитьте путь обновления перед репетицией."
  for image in docker.n8n.io/n8nio/n8n:2.29.10 postgres:17.10-bookworm caddy:2.11.4-alpine; do
    docker image inspect "$image" >/dev/null 2>&1 || fatal "Pinned image отсутствует локально: $image"
  done
  [[ -z "$(docker ps -aq --filter label=com.docker.compose.project=n8n-starter-kit)" ]] \
    || fatal "Уже существуют containers Compose-проекта n8n-starter-kit."
  for resource in n8n_postgres_data n8n_data n8n_caddy_data n8n_caddy_config; do
    ! docker volume inspect "$resource" >/dev/null 2>&1 \
      || fatal "Уже существует volume $resource; rehearsal остановлен до mutation."
  done
  for resource in n8n_frontend n8n_backend; do
    ! docker network inspect "$resource" >/dev/null 2>&1 \
      || fatal "Уже существует network $resource; rehearsal остановлен до mutation."
  done
  ok "explicit disposable marker, committed update path and empty fixed-name resources"

  INSTALL_ROOT="$WORK_ROOT/install-root"
  ARTIFACT_DIR="$WORK_ROOT/artifacts"
  [[ ! -e "$INSTALL_ROOT" && ! -e "$ARTIFACT_DIR" ]] \
    || fatal "Work root уже содержит install-root или artifacts."
  mkdir -p "$INSTALL_ROOT" "$ARTIFACT_DIR"
  git -C "$ROOT" archive --format=tar "$old_commit" | tar -x -C "$INSTALL_ROOT"
  [[ ! -e "$INSTALL_ROOT/scripts/update-code.sh" ]] \
    || fatal "Старый ref уже содержит update-code.sh; возьмите более старый --old-ref."
  printf '%s\n' "$old_commit" > "$INSTALL_ROOT/.release-commit"
  export OS_RELEASE_FILE="$INSTALL_ROOT/tests/fixtures/ubuntu-24.04-os-release"
  export UNAME_MACHINE_OVERRIDE=x86_64
  export MEM_TOTAL_KB_OVERRIDE=4194304
  export DISK_AVAILABLE_KB_OVERRIDE=41943040
  ENV_FILE="$INSTALL_ROOT/.env"
  secret="$(openssl rand -hex 32)"
  encryption_key="$(openssl rand -hex 32)"
  {
    printf 'N8N_HOST=n8n.localhost\n'
    printf 'ACME_EMAIL=t0130@example.invalid\n'
    printf 'TIMEZONE=Etc/UTC\n'
    printf 'N8N_VERSION=2.29.10\n'
    printf 'POSTGRES_DB=n8n\n'
    printf 'POSTGRES_USER=n8n\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$secret"
    printf 'N8N_ENCRYPTION_KEY=%s\n' "$encryption_key"
    printf 'EXECUTIONS_DATA_MAX_AGE=168\n'
    printf 'EXECUTIONS_DATA_PRUNE_MAX_COUNT=10000\n'
  } > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  CLEANUP_ALLOWED=1
  trap cleanup EXIT INT TERM

  compose up -d --wait --wait-timeout 300 --pull never >"$ARTIFACT_DIR/startup.log" 2>&1
  sql "CREATE TABLE t0130_probe (id text PRIMARY KEY, payload text NOT NULL); INSERT INTO t0130_probe VALUES ('seed', 'T0130-PROBE-V1');" >/dev/null
  volumes_before="$(volume_fingerprint)"
  env_sha_before="$(sha256sum "$ENV_FILE" | awk '{print $1}')"
  ok "old release $OLD_REF runs as a live installation with seeded probe"

  artifact="$WORK_ROOT/install-new.sh"
  "$ROOT/scripts/build-one-command-installer.sh" --ref HEAD --output "$artifact" >/dev/null

  # Негативная проверка до обновления: повреждённый артефакт обязан
  # остановиться до каких-либо изменений на живой установке.
  tampered="$WORK_ROOT/install-tampered.sh"
  cp "$artifact" "$tampered"
  python3 - "$tampered" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
data = path.read_text()
marker = "N8N_KIT_PAYLOAD'\n"
start = data.index(marker) + len(marker)
replacement = "A" if data[start] != "A" else "B"
path.write_text(data[:start] + replacement + data[start + 1:])
PY
  failure_log="$ARTIFACT_DIR/tampered-artifact.log"
  if N8N_KIT_INSTALL_ROOT="$INSTALL_ROOT" N8N_BOOTSTRAP_UPDATE_CODE=1 sh "$tampered" >"$failure_log" 2>&1; then
    fatal "Tampered artifact был принят в режиме обновления."
  fi
  grep -Eq 'Checksum|invalid input' "$failure_log" || fatal "Отказ по checksum не объяснён."
  [[ "$(cat "$INSTALL_ROOT/.release-commit")" == "$old_commit" ]] \
    || fatal "Tampered artifact изменил .release-commit."
  [[ "$(sql "SELECT payload FROM t0130_probe WHERE id = 'seed';")" == "T0130-PROBE-V1" ]] \
    || fatal "Tampered artifact затронул данные."
  ok "tampered artifact stopped before any change on the live installation"

  update_log="$ARTIFACT_DIR/update.log"
  N8N_KIT_INSTALL_ROOT="$INSTALL_ROOT" N8N_BOOTSTRAP_UPDATE_CODE=1 sh "$artifact" >"$update_log" 2>&1 \
    || { sed -n '1,40p' "$update_log" >&2; fatal "Обновление кода не прошло; см. $update_log"; }
  grep -q "UPDATED_TO_COMMIT=$new_commit" "$update_log" || fatal "Обновление не подтвердило новый commit."
  [[ "$(cat "$INSTALL_ROOT/.release-commit")" == "$new_commit" ]] \
    || fatal ".release-commit не соответствует новому релизу."
  [[ -x "$INSTALL_ROOT/scripts/update-code.sh" ]] \
    || fatal "Новый код не приехал: scripts/update-code.sh отсутствует."
  ok "bootstrap with N8N_BOOTSTRAP_UPDATE_CODE=1 updated the code and .release-commit"

  env_sha_after="$(sha256sum "$ENV_FILE" | awk '{print $1}')"
  [[ "$env_sha_before" == "$env_sha_after" ]] || fatal ".env изменился при обновлении кода."
  [[ "$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE")" == 600 ]] \
    || fatal ".env потерял mode 0600."
  volumes_after="$(volume_fingerprint)"
  [[ "$volumes_before" == "$volumes_after" ]] || fatal "Docker volumes пересозданы при обновлении."
  [[ "$(sql "SELECT payload FROM t0130_probe WHERE id = 'seed';")" == "T0130-PROBE-V1" ]] \
    || fatal "Данные probe изменились после обновления."
  [[ -n "$(compose ps --status running -q postgres)" && -n "$(compose ps --status running -q n8n)" && -n "$(compose ps --status running -q caddy)" ]] \
    || fatal "Stack не running после обновления."
  grep -q 'doctor.sh --local-only после обновления без FAIL' "$update_log" \
    || fatal "doctor.sh после обновления не подтверждён."
  ok "data, secrets, volumes and running stack survived the code update"

  previous_tree="$(awk -F= '$1 == "PREVIOUS_CODE_TREE" {print $2; exit}' "$update_log")"
  [[ -d "$previous_tree" && -f "$previous_tree/scripts/install.sh" ]] \
    || fatal "Прежнее дерево кода не сохранено."
  backup_archive="$(awk -F= '$1 == "CODE_BACKUP_ARCHIVE" {print $2; exit}' "$update_log")"
  [[ -f "$backup_archive" && -f "$backup_archive.sha256" ]] || fatal "Backup кода не создан."
  (cd "$(dirname "$backup_archive")" && sha256sum -c "$(basename "$backup_archive").sha256" >/dev/null) \
    || fatal "Checksum backup кода не сходится."
  ok "previous code tree and verified code backup are available for rollback"

  {
    printf 'confirmPhrase=%s\n' "$CONFIRM_PHRASE"
    printf 'environment=Docker Desktop disposable Linux containers; not a real VPS host\n'
    printf 'oldRef=%s\n' "$OLD_REF"
    printf 'oldCommit=%s\n' "$old_commit"
    printf 'newCommit=%s\n' "$new_commit"
    printf 'probe=T0130-PROBE-V1 preserved\n'
    printf 'envPreserved=yes (sha256 identical, mode 0600)\n'
    printf 'volumesPreserved=yes (Name+CreatedAt identical for 4 fixed volumes)\n'
    printf 'doctorLocalOnly=pass\n'
    printf 'tamperedArtifact=rejected before changes\n'
  } > "$ARTIFACT_DIR/summary.txt"
  rm -f -- "$ARTIFACT_DIR/startup.log" "$ARTIFACT_DIR/update.log"
  for resource in "$secret" "$encryption_key"; do
    ! grep -R -Fq -- "$resource" "$ARTIFACT_DIR" || fatal "Artifact содержит synthetic secret."
  done
  artifact_manifest="$ARTIFACT_DIR/checksums.sha256"
  (cd "$ARTIFACT_DIR" && sha256sum summary.txt tampered-artifact.log) > "$artifact_manifest"
  (cd "$ARTIFACT_DIR" && sha256sum -c "$(basename "$artifact_manifest")" >/dev/null)
  artifact_manifest_hash="$(sha256sum "$artifact_manifest" | awk '{print $1}')"
  ok "redacted evidence artifacts have a verified checksum manifest"

  printf '1..%d\n' "$COUNT"
  printf 'ARTIFACT_DIR=%s\n' "$ARTIFACT_DIR"
  printf 'ARTIFACT_MANIFEST_SHA256=%s\n' "$artifact_manifest_hash"
}

main "$@"
