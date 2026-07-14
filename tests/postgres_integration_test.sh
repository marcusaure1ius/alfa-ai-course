#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT="quality-postgres-$RANDOM-$$"
TEMP_DIR="$(mktemp -d)"
ENV_FILE="$TEMP_DIR/runtime.env"
OVERRIDE="$TEMP_DIR/override.yml"
COUNT=0
CLEANUP_ALLOWED=0
declare -a COMPOSE=()

ok(){ COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fatal(){ printf '[FAIL] %s\n' "$*" >&2; exit 1; }

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if (( CLEANUP_ALLOWED )); then
    "${COMPOSE[@]}" down --remove-orphans --volumes >/dev/null 2>&1 || true
  fi
  rm -rf -- "$TEMP_DIR"
  exit "$code"
}
trap cleanup EXIT INT TERM

command -v docker >/dev/null 2>&1 || fatal "Docker отсутствует."
docker info >/dev/null 2>&1 || fatal "Docker daemon недоступен."
docker compose version >/dev/null 2>&1 || fatal "Docker Compose недоступен."
for image in docker.n8n.io/n8nio/n8n:2.29.10 postgres:17.10-bookworm; do
  docker image inspect "$image" >/dev/null 2>&1 || fatal "Pinned image отсутствует локально: $image"
done
ok "Docker daemon and pinned n8n/PostgreSQL images are available"

secret="$(openssl rand -hex 32)"
{
  printf 'N8N_HOST=n8n.example.test\n'
  printf 'ACME_EMAIL=admin@example.test\n'
  printf 'TIMEZONE=Etc/UTC\n'
  printf 'N8N_VERSION=2.29.10\n'
  printf 'POSTGRES_DB=n8n\n'
  printf 'POSTGRES_USER=n8n\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$secret"
  printf 'N8N_ENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)"
  printf 'EXECUTIONS_DATA_MAX_AGE=168\n'
  printf 'EXECUTIONS_DATA_PRUNE_MAX_COUNT=10000\n'
} > "$ENV_FILE"
chmod 0600 "$ENV_FILE"

cat > "$OVERRIDE" <<EOF
networks:
  frontend:
    name: ${PROJECT}_frontend
  backend:
    name: ${PROJECT}_backend
    internal: true
volumes:
  postgres_data:
    name: ${PROJECT}_postgres_data
  n8n_data:
    name: ${PROJECT}_n8n_data
  caddy_data:
    name: ${PROJECT}_caddy_data
  caddy_config:
    name: ${PROJECT}_caddy_config
EOF

COMPOSE=(docker compose -p "$PROJECT" --project-directory "$ROOT" --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml" -f "$OVERRIDE")
CLEANUP_ALLOWED=1
"${COMPOSE[@]}" up -d --wait --wait-timeout 300 --pull never postgres n8n >/dev/null
ok "pinned PostgreSQL and n8n containers reached healthy state"

postgres_id="$("${COMPOSE[@]}" ps --status running -q postgres)"
n8n_id="$("${COMPOSE[@]}" ps --status running -q n8n)"
[[ -n "$postgres_id" && -n "$n8n_id" ]] || fatal "Running container IDs отсутствуют."
[[ "$(docker inspect -f '{{.Config.Image}}' "$postgres_id")" == postgres:17.10-bookworm ]] \
  || fatal "PostgreSQL image pin mismatch."
[[ "$(docker inspect -f '{{.Config.Image}}' "$n8n_id")" == docker.n8n.io/n8nio/n8n:2.29.10 ]] \
  || fatal "n8n image pin mismatch."
ok "running containers use exact approved images"

"${COMPOSE[@]}" exec -T postgres psql -X -v ON_ERROR_STOP=1 -U n8n -d n8n -At -c \
  "CREATE TABLE quality_probe (id text PRIMARY KEY, payload text NOT NULL); INSERT INTO quality_probe VALUES ('seed','postgres-persistence-ok');" >/dev/null
[[ "$("${COMPOSE[@]}" exec -T postgres psql -X -U n8n -d n8n -At -c "SELECT to_regclass('public.workflow_entity') IS NOT NULL;")" == t ]] \
  || fatal "n8n schema не создана в PostgreSQL."
"${COMPOSE[@]}" exec -T n8n node -e \
  "fetch('http://127.0.0.1:5678/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
"${COMPOSE[@]}" exec -T n8n node -e \
  "process.exit(process.env.DB_POSTGRESDB_HOST==='postgres'&&process.env.DB_TYPE==='postgresdb'?0:1)"
ok "n8n health and PostgreSQL configuration are verified inside containers"

"${COMPOSE[@]}" restart n8n >/dev/null
"${COMPOSE[@]}" up -d --wait --wait-timeout 300 --pull never postgres n8n >/dev/null
probe="$("${COMPOSE[@]}" exec -T postgres psql -X -U n8n -d n8n -At -c "SELECT payload FROM quality_probe WHERE id='seed';")"
[[ "$probe" == postgres-persistence-ok ]] || fatal "PostgreSQL probe потерян после n8n restart."
ok "database probe survives n8n restart"

"${COMPOSE[@]}" down --remove-orphans --volumes >/dev/null
CLEANUP_ALLOWED=0
for resource in "${PROJECT}_postgres_data" "${PROJECT}_n8n_data" "${PROJECT}_frontend" "${PROJECT}_backend"; do
  ! docker volume inspect "$resource" >/dev/null 2>&1 || fatal "Volume cleanup failed: $resource"
  ! docker network inspect "$resource" >/dev/null 2>&1 || fatal "Network cleanup failed: $resource"
done
ok "unique integration resources were removed"

printf '1..%d\n' "$COUNT"
