#!/usr/bin/env bash

# Запускается только вручную с explicit disposable marker; contract test отдельный.
set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
CONFIRM_PHRASE="T-0012-DISPOSABLE"
WORK_ROOT=""
CONFIRMATION=""
REHEARSAL_ROOT=""
ARTIFACT_DIR=""
ENV_FILE=""
COUNT=0
CLEANUP_ALLOWED=0

usage() {
  cat <<'EOF'
Destructive lifecycle rehearsal только в явно помеченной disposable-среде.

Использование:
  work_root="$(mktemp -d "${TMPDIR:-/tmp}/t0012.XXXXXX")"
  printf 'T-0012-DISPOSABLE\n' > "$work_root/.t0012-disposable"
  ./tests/destructive_lifecycle_test.sh \
    --work-root "$work_root" \
    --confirm-disposable T-0012-DISPOSABLE

Test откажется работать вне системного temporary directory, без marker-файла,
при существующих n8n containers/volumes/networks или без локальных pinned images.
Он удаляет только созданную им временную Compose-среду и оставляет redacted,
checksummed evidence в <work-root>/artifacts.
EOF
}

fatal() { printf '[FAIL] %s\n' "$*" >&2; exit 1; }
ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }

parse_args() {
  while (($#)); do
    case "$1" in
      --work-root) (($# >= 2)) || fatal "Для --work-root нужен путь."; WORK_ROOT="$2"; shift ;;
      --confirm-disposable) (($# >= 2)) || fatal "Для --confirm-disposable нужна фраза."; CONFIRMATION="$2"; shift ;;
      -h|--help) usage; exit 0 ;;
      *) fatal "Неизвестный параметр: $1. Используйте --help." ;;
    esac
    shift
  done
}

compose() {
  docker compose --project-directory "$REHEARSAL_ROOT" --env-file "$ENV_FILE" "$@"
}

sql() {
  compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U n8n -d n8n -At -c "$1"
}

hash_stream() {
  sha256sum | awk '{print $1}'
}

workflow_hash() {
  sql 'COPY (SELECT id, name, nodes, connections, settings FROM workflow_entity WHERE id = '\''T0012WorkflowSeed'\'') TO STDOUT WITH (FORMAT csv);' | hash_stream
}

credential_hash() {
  sql 'COPY (SELECT id, name, type, data FROM credentials_entity WHERE id = '\''T0012CredentialSeed'\'') TO STDOUT WITH (FORMAT csv);' | hash_stream
}

assert_seed_state() {
  local expected_workflow="$1" expected_credential="$2" probe credential_data
  [[ "$(sql "SELECT count(*) FROM workflow_entity WHERE id = 'T0012WorkflowSeed';")" == 1 ]] \
    || fatal "Seed workflow отсутствует."
  [[ "$(sql "SELECT count(*) FROM credentials_entity WHERE id = 'T0012CredentialSeed';")" == 1 ]] \
    || fatal "Seed credential отсутствует."
  probe="$(sql "SELECT payload FROM lifecycle_probe WHERE id = 'seed';")"
  [[ "$probe" == "T0012-PROBE-V1" ]] || fatal "Lifecycle probe изменился."
  [[ "$(workflow_hash)" == "$expected_workflow" ]] || fatal "Workflow hash изменился."
  [[ "$(credential_hash)" == "$expected_credential" ]] || fatal "Encrypted credential hash изменился."
  credential_data="$(sql "SELECT data FROM credentials_entity WHERE id = 'T0012CredentialSeed';")"
  [[ "$credential_data" != *"$CREDENTIAL_SENTINEL"* ]] || fatal "Credential сохранён открытым текстом."
  compose exec -T -e T0012_SENTINEL="$CREDENTIAL_SENTINEL" n8n sh -eu -c '
    output="$(mktemp)"
    trap '\''rm -f -- "$output"'\'' EXIT
    n8n export:credentials --id=T0012CredentialSeed --decrypted --output="$output" >/dev/null 2>&1
    grep -Fq -- "$T0012_SENTINEL" "$output"
  '
}

assert_initial_resources_absent() {
  local resource
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
}

assert_owned_containers() {
  local id working_dir
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    working_dir="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$id" 2>/dev/null || true)"
    [[ "$working_dir" == "$REHEARSAL_ROOT" ]] \
      || fatal "Отказ cleanup: container $id принадлежит ${working_dir:-unknown}."
  done < <(docker ps -aq --filter label=com.docker.compose.project=n8n-starter-kit)
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if (( CLEANUP_ALLOWED )) && [[ -n "$REHEARSAL_ROOT" && -f "$ENV_FILE" ]]; then
    if assert_owned_containers; then
      compose down --remove-orphans --volumes >/dev/null 2>&1 || true
    else
      printf '[FAIL] Ownership check запретил automatic cleanup.\n' >&2
      code=1
    fi
  fi
  [[ -z "$REHEARSAL_ROOT" ]] || rm -rf -- "$REHEARSAL_ROOT"
  exit "$code"
}

main() {
  local tmp_base marker secret owner_password seed_dir start_log workflow_before credential_before
  local backup_output backup_archive backup_sha restore_output update_output rollback_output
  local tampered failure_log expected_archive_hash artifact_manifest artifact_manifest_hash
  local resource image digest

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
  marker="$WORK_ROOT/.t0012-disposable"
  [[ -f "$marker" && "$(cat "$marker")" == "$CONFIRM_PHRASE" ]] \
    || fatal "Marker $marker отсутствует или неверен."
  command -v docker >/dev/null 2>&1 || fatal "Docker отсутствует."
  command -v sha256sum >/dev/null 2>&1 || fatal "sha256sum отсутствует."
  docker info >/dev/null 2>&1 || fatal "Docker daemon недоступен."
  docker compose version >/dev/null 2>&1 || fatal "Docker Compose недоступен."
  assert_initial_resources_absent
  for image in \
    docker.n8n.io/n8nio/n8n:2.29.9 \
    docker.n8n.io/n8nio/n8n:2.29.10 \
    postgres:17.10-bookworm \
    caddy:2.11.4-alpine; do
    docker image inspect "$image" >/dev/null 2>&1 || fatal "Pinned image отсутствует локально: $image"
  done
  ok "explicit disposable marker and empty fixed-name Docker resources"

  REHEARSAL_ROOT="$WORK_ROOT/rehearsal-repo"
  ARTIFACT_DIR="$WORK_ROOT/artifacts"
  [[ ! -e "$REHEARSAL_ROOT" && ! -e "$ARTIFACT_DIR" ]] \
    || fatal "Work root уже содержит rehearsal-repo или artifacts."
  mkdir -p "$REHEARSAL_ROOT" "$ARTIFACT_DIR"
  git -C "$ROOT" archive --format=tar HEAD | tar -x -C "$REHEARSAL_ROOT"
  export OS_RELEASE_FILE="$REHEARSAL_ROOT/tests/fixtures/ubuntu-24.04-os-release"
  export UNAME_MACHINE_OVERRIDE=x86_64
  export MEM_TOTAL_KB_OVERRIDE=4194304
  export DISK_AVAILABLE_KB_OVERRIDE=41943040
  ENV_FILE="$REHEARSAL_ROOT/.env"
  secret="$(openssl rand -hex 32)"
  owner_password="T0012-$(openssl rand -hex 16)-Aa1!"
  CREDENTIAL_SENTINEL="T0012-CREDENTIAL-$(openssl rand -hex 16)"
  export CREDENTIAL_SENTINEL
  {
    printf 'N8N_HOST=n8n.localhost\n'
    printf 'ACME_EMAIL=t0012@example.invalid\n'
    printf 'TIMEZONE=Etc/UTC\n'
    printf 'N8N_VERSION=2.29.9\n'
    printf 'POSTGRES_DB=n8n\n'
    printf 'POSTGRES_USER=n8n\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$secret"
    printf 'N8N_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
    printf 'EXECUTIONS_DATA_MAX_AGE=168\n'
    printf 'EXECUTIONS_DATA_PRUNE_MAX_COUNT=10000\n'
  } > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
  CLEANUP_ALLOWED=1
  trap cleanup EXIT INT TERM

  start_log="$ARTIFACT_DIR/startup.log"
  compose up -d --wait --wait-timeout 300 --pull never >"$start_log" 2>&1
  compose exec -T -e T0012_OWNER_PASSWORD="$owner_password" n8n node -e '
    const body = {email:"t0012-owner@example.invalid", firstName:"T0012", lastName:"Fixture", password:process.env.T0012_OWNER_PASSWORD};
    fetch("http://127.0.0.1:5678/rest/owner/setup", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body)})
      .then(async (response) => { if (!response.ok) throw new Error(`owner setup HTTP ${response.status}`); })
      .catch((error) => { console.error(error.message); process.exit(1); });
  ' >>"$start_log" 2>&1
  ok "real pinned 2.29.9 stack reached healthy state"

  seed_dir="$REHEARSAL_ROOT/.lifecycle-fixture"
  mkdir -p "$seed_dir"
  cat > "$seed_dir/workflow.json" <<'EOF'
[{"id":"T0012WorkflowSeed","name":"T-0012 lifecycle fixture","active":false,"nodes":[{"id":"manual","name":"Manual Trigger","type":"n8n-nodes-base.manualTrigger","typeVersion":1,"position":[0,0],"parameters":{}}],"connections":{},"settings":{}}]
EOF
  printf '[{"id":"T0012CredentialSeed","name":"T-0012 encrypted fixture","type":"httpHeaderAuth","data":{"name":"X-T0012-Test","value":"%s"}}]\n' \
    "$CREDENTIAL_SENTINEL" > "$seed_dir/credential.json"
  compose cp "$seed_dir/workflow.json" n8n:/tmp/t0012-workflow.json >/dev/null 2>&1
  compose cp "$seed_dir/credential.json" n8n:/tmp/t0012-credential.json >/dev/null 2>&1
  compose exec -T --user root n8n chown node:node /tmp/t0012-workflow.json /tmp/t0012-credential.json
  compose exec -T --user root n8n chmod 0600 /tmp/t0012-workflow.json /tmp/t0012-credential.json
  compose exec -T n8n n8n import:workflow --input=/tmp/t0012-workflow.json >>"$ARTIFACT_DIR/operations.log" 2>&1
  compose exec -T n8n n8n import:credentials --input=/tmp/t0012-credential.json >>"$ARTIFACT_DIR/operations.log" 2>&1
  compose exec -T --user root n8n rm -f /tmp/t0012-workflow.json /tmp/t0012-credential.json
  rm -rf -- "$seed_dir"
  sql "CREATE TABLE lifecycle_probe (id text PRIMARY KEY, payload text NOT NULL); INSERT INTO lifecycle_probe VALUES ('seed', 'T0012-PROBE-V1');" >/dev/null
  workflow_before="$(workflow_hash)"
  credential_before="$(credential_hash)"
  assert_seed_state "$workflow_before" "$credential_before"
  ok "workflow and n8n-encrypted synthetic credential seeded with exact hashes"

  backup_output="$("$REHEARSAL_ROOT/scripts/backup.sh" --env-file "$ENV_FILE" --output-dir "$REHEARSAL_ROOT/backups/rehearsal" 2>>"$ARTIFACT_DIR/operations.log")"
  backup_archive="$(printf '%s\n' "$backup_output" | awk -F= '$1 == "BACKUP_ARCHIVE" {print $2; exit}')"
  [[ -f "$backup_archive" && -f "$backup_archive.sha256" ]] || fatal "Backup archive/checksum не созданы."
  (cd "$(dirname "$backup_archive")" && sha256sum -c "$(basename "$backup_archive.sha256")" >/dev/null)
  expected_archive_hash="$(awk 'NR == 1 {print $1}' "$backup_archive.sha256")"
  ok "consistent backup archive and outer checksum verified"

  compose stop caddy n8n >/dev/null
  compose exec -T postgres dropdb --if-exists --force --maintenance-db=postgres -U n8n n8n >/dev/null
  compose exec -T postgres createdb --maintenance-db=postgres -U n8n n8n >/dev/null
  [[ -z "$(sql "SELECT to_regclass('public.workflow_entity');")" ]] || fatal "Database deletion не подтверждено."
  restore_output="$("$REHEARSAL_ROOT/scripts/restore.sh" "$backup_archive" --env-file "$ENV_FILE" --safety-backup-dir "$REHEARSAL_ROOT/backups/pre-restore" --yes 2>>"$ARTIFACT_DIR/operations.log")"
  [[ "$restore_output" == *"RESTORED_ARCHIVE=$backup_archive"* ]] || fatal "Restore result не подтверждён."
  assert_seed_state "$workflow_before" "$credential_before"
  ok "backup -> full database delete -> restore recovered exact seeded state"

  update_output="$("$REHEARSAL_ROOT/scripts/update.sh" --to 2.29.10 --env-file "$ENV_FILE" --backup-dir "$REHEARSAL_ROOT/backups/pre-update" --state-file "$REHEARSAL_ROOT/.lifecycle/update-state.env" --yes 2>>"$ARTIFACT_DIR/operations.log")"
  [[ "$update_output" == *"UPDATED_VERSION=2.29.10"* ]] || fatal "Update result не подтверждён."
  assert_seed_state "$workflow_before" "$credential_before"
  rollback_output="$("$REHEARSAL_ROOT/scripts/rollback.sh" --env-file "$ENV_FILE" --state-file "$REHEARSAL_ROOT/.lifecycle/update-state.env" --yes 2>>"$ARTIFACT_DIR/operations.log")"
  [[ "$rollback_output" == *"ROLLED_BACK_VERSION=2.29.9"* ]] || fatal "Rollback result не подтверждён."
  assert_seed_state "$workflow_before" "$credential_before"
  ok "approved 2.29.9 -> 2.29.10 update and restore-based rollback preserved exact state"

  "$REHEARSAL_ROOT/scripts/uninstall.sh" --env-file "$ENV_FILE" >>"$ARTIFACT_DIR/operations.log" 2>&1
  for resource in n8n_postgres_data n8n_data n8n_caddy_data n8n_caddy_config; do
    docker volume inspect "$resource" >/dev/null 2>&1 || fatal "Uninstall удалил volume $resource."
  done
  compose up -d --wait --wait-timeout 300 --pull never >>"$ARTIFACT_DIR/operations.log" 2>&1
  assert_seed_state "$workflow_before" "$credential_before"
  ok "default uninstall preserved volumes and restart recovered exact state"

  tampered="$REHEARSAL_ROOT/backups/tampered.tar.gz"
  cp "$backup_archive" "$tampered"
  printf '%s  %s\n' "$expected_archive_hash" "$(basename "$tampered")" > "$tampered.sha256"
  printf 'tamper\n' >> "$tampered"
  failure_log="$ARTIFACT_DIR/failure-injection.log"
  if "$REHEARSAL_ROOT/scripts/restore.sh" "$tampered" --env-file "$ENV_FILE" --yes >"$failure_log" 2>&1; then
    fatal "Tampered archive был принят."
  fi
  grep -Eq 'checksum mismatch|FAILED|FAIL' "$failure_log" || fatal "Failure log не объясняет checksum rejection."
  for resource in "$secret" "$owner_password" "$CREDENTIAL_SENTINEL"; do
    ! grep -R -Fq -- "$resource" "$ARTIFACT_DIR" || fatal "Artifact содержит synthetic secret."
  done
  assert_seed_state "$workflow_before" "$credential_before"
  ok "tampered archive rejected before mutation and logs contain no synthetic secrets"

  {
    printf 'checkedAt=2026-07-14\n'
    printf 'environment=Docker Desktop disposable Linux containers on Darwin arm64 host\n'
    printf 'doctorHostInputs=Ubuntu 24.04/x86_64/resource fixtures; not a real VPS host check\n'
    printf 'sourceVersion=2.29.9\n'
    printf 'targetVersion=2.29.10\n'
    printf 'workflowSha256=%s\n' "$workflow_before"
    printf 'encryptedCredentialSha256=%s\n' "$credential_before"
    printf 'backupArchiveSha256=%s\n' "$expected_archive_hash"
    printf 'vpsDnsHttpsExternal=not-tested\n'
  } > "$ARTIFACT_DIR/summary.txt"
  {
    docker version --format 'dockerClient={{.Client.Version}} dockerServer={{.Server.Version}}'
    docker compose version
    for image in docker.n8n.io/n8nio/n8n:2.29.9 docker.n8n.io/n8nio/n8n:2.29.10 postgres:17.10-bookworm caddy:2.11.4-alpine; do
      digest="$(docker image inspect --format '{{join .RepoDigests " "}}' "$image")"
      printf '%s %s\n' "$image" "${digest:-no-repo-digest}"
    done
  } > "$ARTIFACT_DIR/environment.txt"
  rm -f -- "$ARTIFACT_DIR/startup.log" "$ARTIFACT_DIR/operations.log"
  artifact_manifest="$ARTIFACT_DIR/checksums.sha256"
  (cd "$ARTIFACT_DIR" && sha256sum environment.txt failure-injection.log summary.txt) > "$artifact_manifest"
  (cd "$ARTIFACT_DIR" && sha256sum -c "$(basename "$artifact_manifest")" >/dev/null)
  artifact_manifest_hash="$(sha256sum "$artifact_manifest" | awk '{print $1}')"
  ok "redacted evidence artifacts have a verified checksum manifest"

  printf '1..%d\n' "$COUNT"
  printf 'ARTIFACT_DIR=%s\n' "$ARTIFACT_DIR"
  printf 'ARTIFACT_MANIFEST_SHA256=%s\n' "$artifact_manifest_hash"
}

main "$@"
