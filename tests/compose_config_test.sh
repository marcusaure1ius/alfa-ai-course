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
SITE_VERIFICATION_FILE='' \
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
# T-0118: grep-проверки на удаление конкретных заголовков убраны не как лишние, а
# как более слабые — они смотрели текст конфига и проходили ровно в том сценарии,
# который надо было поймать.
#
# Проверяется ЭФФЕКТ, а не текст. Фильтр с подпараметрами Caddy принимает и в
# однострочной форме, молча оставляя actions пустым, поэтому grep по такой строке
# проходил бы при полностью отключённой редакции.
#
# Логгеров два, и оба обязательны: блок log внутри сайта покрывает только
# access-лог, а ошибки reverse_proxy пишет default-логгер. Условие требует
# редакции у КАЖДОГО логгера из .logging.logs — прежняя версия считала логгеры С
# редакцией и требовала ровно двух, поэтому третий логгер без неё оставлял гейт
# зелёным.
docker run --rm -i \
  -e N8N_HOST=n8n.example.test \
  -e N8N_GATE_MANAGEMENT_SECRET=synthetic-secret-for-adapt-only \
  caddy:2.11.4-alpine \
  sh -c 'cat > /tmp/Caddyfile && caddy adapt --config /tmp/Caddyfile --adapter caddyfile' \
  < "$ROOT/config/Caddyfile.platform" > "$tmp/caddy.json" 2>/dev/null \
  || fail "Managed Caddy profile does not adapt"
jq -e '
  (.logging.logs | length) >= 2
  and (.logging.logs | to_entries | all(
    .value.encoder.fields as $f
    | ([ "request>uri", "resp_headers>Location" ]
       | all(. as $k | ($f[$k] // {}).filter == "regexp"))
    and (($f["request>headers"] // {}).filter == "delete")
  ))
' "$tmp/caddy.json" >/dev/null \
  || fail "Some Caddy logger keeps the query, the Location query or the request headers"
ok "every managed Caddy logger strips query from uri and Location and drops all request headers"

# log_credentials снимает встроенную редакцию Caddy и не виден ни в одном фильтре
# полей: опция живёт в блоке servers, а не в логгере. Authorization она сейчас не
# вернёт — заголовки запроса удаляются целиком, — но Set-Cookie начнёт печататься
# сырым, а это сессионный JWT n8n. Проверено живым запросом.
jq -e '[ .. | objects | select(.logs? != null) | .logs.should_log_credentials? // false ] | any | not' \
  "$tmp/caddy.json" >/dev/null \
  || fail "log_credentials is enabled: Set-Cookie with the n8n session JWT would be logged verbatim"

# T-0118, второй круг. Проверка выше смотрит на объявленные поля, и этого мало:
# имя заголовка сравнивается с КАНОНИЧЕСКИМ именем Go, поэтому написанный as-is
# `X-N8N-API-KEY` принимается, но не совпадает никогда и остаётся no-op. Живой
# запрос печатал ключ управления целиком, пока обе проверки были зелёными.
# Поэтому здесь секреты подкладываются в реальный запрос и в логе их быть не
# должно ни в каком виде. Это единственная проверка, которая ловит расхождение
# между «директива написана» и «редакция работает».
cat > "$tmp/live.sh" <<'LIVE'
#!/bin/sh
caddy run --config /probe/Caddyfile --adapter caddyfile > /tmp/caddy.log 2>&1 &
sleep 2
# Имена параметров нарочно разные, включая другой регистр и те, которых нет ни в
# одном списке: проверяется вырезание query целиком, а не совпадение с именем.
wget -q -O /dev/null "http://127.0.0.1:8080/probe-marker/signup?token=PLANTED-1" 2>/dev/null
wget -q -O /dev/null "http://127.0.0.1:8080/probe-marker/rest/oauth2-credential/callback?code=PLANTED-2&state=PLANTED-3" 2>/dev/null
wget -q -O /dev/null "http://127.0.0.1:8080/probe-marker/rest/oauth1-credential/callback?oauth_token=PLANTED-4&oauth_verifier=PLANTED-5" 2>/dev/null
wget -q -O /dev/null "http://127.0.0.1:8080/probe-marker/x?Token=PLANTED-6&access_token=PLANTED-7&password=PLANTED-8&api_key=PLANTED-9" 2>/dev/null
wget -q -O /dev/null --header="X-N8N-API-KEY: PLANTED-10" "http://127.0.0.1:8080/probe-marker/api/v1/users" 2>/dev/null
# Имя заголовка вебхука выбирает ученик (headerAuth в n8n), поэтому список имён
# закрыть нельзя — проверяются заведомо неизвестные имена.
wget -q -O /dev/null --header="X-Webhook-Secret: PLANTED-14" --header="X-Custom-Whatever: PLANTED-15" --header="Authorization: Bearer PLANTED-16" "http://127.0.0.1:8080/probe-marker/webhook/lesson-6" 2>/dev/null
wget -q -O /dev/null --header="Cookie: n8n-auth=PLANTED-11" "http://127.0.0.1:8080/probe-marker/home" 2>/dev/null
wget -q -O /dev/null --header="X-Neurokurs-Management: PLANTED-12" "http://127.0.0.1:8080/probe-marker/api/v1/users" 2>/dev/null
wget -q -O /dev/null --header="Referer: http://127.0.0.1:8080/signup?token=PLANTED-13" "http://127.0.0.1:8080/probe-marker/app.js" 2>/dev/null
sleep 1
grep -c 'PLANTED-' /tmp/caddy.log
grep -c 'probe-marker' /tmp/caddy.log
LIVE
sed 's/{\$N8N_HOST}/:8080/' "$ROOT/config/Caddyfile.platform" > "$tmp/Caddyfile"
docker run --rm -v "$tmp":/probe \
  -e N8N_GATE_MANAGEMENT_SECRET=synthetic-secret-for-live-only \
  -e SITE_VERIFICATION_FILE=googl0123456789abcdef.html \
  caddy:2.11.4-alpine sh /probe/live.sh > "$tmp/live-result" 2>/dev/null \
  || fail "Live Caddy redaction probe did not run"
[[ "$(sed -n 1p "$tmp/live-result")" == '0' ]] \
  || fail "A planted secret reached the Caddy log: declared redaction does not work"
# Обратная сторона: ноль выше значит что-то только если лог вообще виден.
# Маркер — часть ПУТИ, а не query: путь остаётся в логе намеренно.
[[ "$(sed -n 2p "$tmp/live-result")" != '0' ]] \
  || fail "Live probe saw no log lines at all: the zero above proves nothing"
ok "live request plants sixteen secrets across query, arbitrary headers and Referer and none reaches the log"

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
