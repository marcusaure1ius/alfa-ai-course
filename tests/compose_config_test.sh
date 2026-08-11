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

# T-0123: пустое значение SITE_VERIFICATION_FILE нельзя пропускать в Caddy.
# Подстановка {$VAR:default} внутри Caddyfile читает default только когда
# переменная не определена вовсе; определённое пустое значение оставляет матчер
# `/`, и endpoint подтверждения перехватывает корень сайта — вход в n8n начинает
# отдавать 404. Проверено живым запросом, поэтому в override стоит `:-`.
N8N_GATE_MANAGEMENT_SECRET=synthetic-gateway-management-secret-32-bytes \
SITE_VERIFICATION_FILE= \
  docker compose --project-directory "$ROOT" --env-file "$ENV_FILE" \
    -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.platform.yml" \
    config --format json > "$tmp/platform-compose-empty-verification.json"
jq -e '
  (.services.caddy.environment.SITE_VERIFICATION_FILE // "") != ""
' "$tmp/platform-compose-empty-verification.json" >/dev/null \
  || fail "Empty SITE_VERIFICATION_FILE reaches Caddy and would hijack the site root"
ok "managed profile never passes an empty site verification file to Caddy"

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

# T-0117: без собственного robots.txt любой неизвестный путь уходит в n8n, а тот
# отдаёт SPA-оболочку с кодом 200 — домен выглядит как множество страниц входа
# под чужим брендом. Проверяется адаптированный конфиг: обработчик должен
# существовать и запрещать обход, а noindex — стоять на всех ответах сайта.
#
# T-0123: проверка привязана к ПУТИ обработчика, а не только к телу ответа.
# Прежняя формулировка искала static_response с нужным телом где угодно в
# конфиге: переименование `handle /robots.txt` в `handle /robots-DEAD.txt`
# оставляло все проверки зелёными, а /robots.txt снова уходил в n8n и отдавал
# SPA-оболочку с кодом 200 — ровно та регрессия, ради которой гейт написан.
jq -e '
  [ .. | objects
    | select([ (.match // [])[] | (.path // [])[] ] | index("/robots.txt"))
    | select([ .. | objects | select(.handler? == "static_response") | .body? // "" ]
             | any(test("User-agent: \\*") and test("Disallow: /")))
  ] | length >= 1
' "$tmp/caddy.json" >/dev/null \
  || fail "Managed Caddy does not serve a disallow-all robots.txt at /robots.txt"
jq -e '
  [ .. | objects | select(.handler == "headers")
    | .response.set["X-Robots-Tag"] // empty
    | select(any(.[]; test("noindex")))
  ] | length >= 1
' "$tmp/caddy.json" >/dev/null \
  || fail "Managed Caddy does not send X-Robots-Tag noindex"
ok "managed Caddy keeps the tool out of search indexes"

# T-0123: файл подтверждения владения привязан к аккаунту владельца, а не к
# сайту. Общий профиль едет в публичном релизном артефакте и разворачивается на
# произвольных хостах, поэтому имени файла в нём быть не должно: посторонняя
# установка отдавала бы чужое доказательство владения.
if grep -Eq 'google[0-9a-f]{16}\.html' "$ROOT/config/Caddyfile.platform"; then
  fail "Personal search-console verification file is hardcoded in the shared managed profile"
fi
jq -e '
  [ .. | objects | select(.handler? == "static_response") | .body? // ""
    | select(test("google-site-verification: google[0-9a-f]{16}"))
  ] | length == 0
' "$tmp/caddy.json" >/dev/null \
  || fail "Managed Caddy serves a personal verification token without host configuration"
# Без переменной ни один обработчик не должен захватывать корень сайта: пустое
# или отсутствующее имя файла не имеет права превратиться в матчер `/`.
jq -e '
  [ .. | objects | (.match // [])[] | (.path // [])[] ] | index("/") | not
' "$tmp/caddy.json" >/dev/null \
  || fail "Site verification handler hijacks the site root when no file is configured"
ok "shared managed profile carries no personal verification file"

# Обратная сторона той же проверки: заданное имя файла обязано давать endpoint
# ровно по своему пути и тело, которого требует поисковая консоль.
docker run --rm -i \
  -e N8N_HOST=n8n.example.test \
  -e N8N_GATE_MANAGEMENT_SECRET=synthetic-secret-for-adapt-only \
  -e SITE_VERIFICATION_FILE=googl0123456789abcdef.html \
  caddy:2.11.4-alpine \
  sh -c 'cat > /tmp/Caddyfile && caddy adapt --config /tmp/Caddyfile --adapter caddyfile' \
  < "$ROOT/config/Caddyfile.platform" > "$tmp/caddy-verified.json" 2>/dev/null \
  || fail "Managed Caddy profile does not adapt with a configured verification file"
jq -e '
  [ .. | objects
    | select([ (.match // [])[] | (.path // [])[] ] | index("/googl0123456789abcdef.html"))
    | select([ .. | objects | select(.handler? == "static_response") | .body? // "" ]
             | any(. == "google-site-verification: googl0123456789abcdef.html"))
  ] | length >= 1
' "$tmp/caddy-verified.json" >/dev/null \
  || fail "Configured verification file is not served at its own path"
jq -e '
  [ .. | objects | select(.handler? == "static_response") | .body? // ""
    | select(test("User-agent: \\*"))
    | select(test("Allow: /googl0123456789abcdef.html"))
  ] | length >= 1
' "$tmp/caddy-verified.json" >/dev/null \
  || fail "robots.txt does not exempt the configured verification file from Disallow"
ok "configured verification file is served at its own path and exempted from Disallow"
if sed 's/#.*//' "$ROOT/config/Caddyfile.platform" |
  grep -Eq 'forward_auth|__neurokurs/exchange|uri query -ticket'; then
  fail "Removed ticket gateway reappeared in the managed Caddy profile"
fi
ok "platform Caddy keeps the management channel without the removed ticket gateway"

printf '1..%d\n' "$COUNT"
