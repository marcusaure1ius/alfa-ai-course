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

# ADR-0016: ученик входит в n8n сам, поэтому ticket-модель должна
# отсутствовать, а матчер управления остаётся. Он больше не ограничивает
# доступ — после снятия forward_auth запрос без заголовка всё равно доходит до
# n8n, — но снимает служебный заголовок перед проксированием. Негативные
# проверки не дают вернуть удалённый слой незаметно.
grep -Fq 'header X-Neurokurs-Management {$N8N_GATE_MANAGEMENT_SECRET}' "$ROOT/config/Caddyfile.platform" \
  || fail "Management header matcher is missing"
grep -Fq 'request>headers>Cookie delete' "$ROOT/config/Caddyfile.platform" \
  || fail "Cookies are not redacted from access logs"
grep -Fq 'request>headers>X-N8N-API-KEY delete' "$ROOT/config/Caddyfile.platform" \
  || fail "n8n API key is not redacted from access logs"
# ADR-0016: ученик задаёт пароль по одноразовому /signup?token=..., который идёт
# общим handle. Токен даёт право завести чужой аккаунт, поэтому в лог он попасть
# не должен.
#
# Проверяется ЭФФЕКТ, а не текст конфига. Однострочную форму `query replace ...`
# Caddy принимает молча, но подпараметры не читает и оставляет actions пустым:
# grep по такой строке проходил бы при полностью отключённой редакции.
#
# Логгеров два, и оба обязательны. Блок log внутри сайта покрывает только
# access-лог; ошибки reverse_proxy пишет default-логгер, и без его настройки
# http.log.error печатает URI с токеном целиком — проверено живым запросом.
docker run --rm -i \
  -e N8N_HOST=n8n.example.test \
  -e N8N_GATE_MANAGEMENT_SECRET=synthetic-secret-for-adapt-only \
  caddy:2.11.4-alpine \
  sh -c 'cat > /tmp/Caddyfile && caddy adapt --config /tmp/Caddyfile --adapter caddyfile' \
  < "$ROOT/config/Caddyfile.platform" > "$tmp/caddy.json" 2>/dev/null \
  || fail "Managed Caddy profile does not adapt"
jq -e '
  [ .logging.logs | to_entries[]
    | select(.value.encoder.fields["request>uri"] != null)
    | .value.encoder.fields["request>uri"]
    | select(.filter == "query")
    | .actions // []
    | any(.[]; .parameter == "token" and .type == "replace")
  ] | length == 2 and all(.[]; .)
' "$tmp/caddy.json" >/dev/null \
  || fail "n8n invite token is not redacted from both Caddy access and error logs"
ok "managed Caddy redacts the n8n invite token from access and error logs"
if sed 's/#.*//' "$ROOT/config/Caddyfile.platform" |
  grep -Eq 'forward_auth|__neurokurs/exchange|uri query -ticket'; then
  fail "Removed ticket gateway reappeared in the managed Caddy profile"
fi
ok "platform Caddy keeps the management channel without the removed ticket gateway"

printf '1..%d\n' "$COUNT"
