#!/usr/bin/env bash

set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
ENV_FILE="$ROOT/tests/fixtures/compose.env"
COUNT=0
ok(){ COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail(){ printf 'not ok - %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker CLI отсутствует"
docker compose version >/dev/null 2>&1 || fail "Docker Compose отсутствует"
docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" config --quiet
ok "Compose config resolves with synthetic env"

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" config --images | sort > "$tmp/actual-images"
cat > "$tmp/expected-images" <<'EOF'
caddy:2.11.4-alpine
docker.n8n.io/n8nio/n8n:2.29.10
postgres:17.10-bookworm
EOF
diff -u "$tmp/expected-images" "$tmp/actual-images" >/dev/null || fail "Compose image pins differ from approved set"
ok "Compose uses exactly three approved image pins"

POSTGRES_IMAGE='dockerhub.timeweb.cloud/library/postgres:17.10-bookworm' \
N8N_IMAGE_REPOSITORY='dockerhub.timeweb.cloud/n8nio/n8n' \
CADDY_IMAGE='dockerhub.timeweb.cloud/library/caddy:2.11.4-alpine' \
  docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" config --images | sort > "$tmp/timeweb-images"
cat > "$tmp/expected-timeweb-images" <<'EOF'
dockerhub.timeweb.cloud/library/caddy:2.11.4-alpine
dockerhub.timeweb.cloud/library/postgres:17.10-bookworm
dockerhub.timeweb.cloud/n8nio/n8n:2.29.10
EOF
diff -u "$tmp/expected-timeweb-images" "$tmp/timeweb-images" >/dev/null \
  || fail "Timeweb proxy image pins differ from approved set"
ok "Compose accepts the Timeweb proxy with unchanged exact tags"

docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" config --format json > "$tmp/compose.json"
jq -e '
  .services.postgres.platform == "linux/amd64" and
  .services.n8n.platform == "linux/amd64" and
  .services.caddy.platform == "linux/amd64" and
  (.services.postgres.ports | length == 0) and
  (.services.n8n.ports | length == 0) and
  .networks.backend.internal == true
' "$tmp/compose.json" >/dev/null || fail "Pinned platform/private network assertions failed"
ok "platform and private database/n8n topology are pinned"

N8N_GATE_MANAGEMENT_SECRET=synthetic-gateway-management-secret-32-bytes \
  docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" \
    -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.platform.yml" \
    config --format json > "$tmp/platform-compose.json"
jq -e '
  .services.caddy.environment.N8N_GATE_MANAGEMENT_SECRET == "synthetic-gateway-management-secret-32-bytes" and
  (.services.caddy.environment | has("PLATFORM_GATE_ORIGIN") | not) and
  any(.services.caddy.volumes[]; .target == "/etc/caddy/Caddyfile" and (.source | endswith("/config/Caddyfile.platform")))
' "$tmp/platform-compose.json" >/dev/null || fail "Managed profile override is incomplete"
ok "managed profile replaces Caddy and keeps only the management secret"

# ADR-0016: ученик входит в n8n сам, поэтому канал управления остаётся, а
# ticket-модель должна отсутствовать. Негативные проверки не дают вернуть её
# незаметно.
grep -Fq 'header X-Neurokurs-Management {$N8N_GATE_MANAGEMENT_SECRET}' "$ROOT/config/Caddyfile.platform" \
  || fail "Management API bypass is not secret-bound"
grep -Fq 'request>headers>Cookie delete' "$ROOT/config/Caddyfile.platform" \
  || fail "Cookies are not redacted from access logs"
grep -Fq 'request>headers>X-N8N-API-KEY delete' "$ROOT/config/Caddyfile.platform" \
  || fail "n8n API key is not redacted from access logs"
if sed 's/#.*//' "$ROOT/config/Caddyfile.platform" |
  grep -Eq 'forward_auth|__neurokurs/exchange|uri query -ticket'; then
  fail "Removed ticket gateway reappeared in the managed Caddy profile"
fi
ok "platform Caddy keeps the management channel without the removed ticket gateway"

printf '1..%d\n' "$COUNT"
