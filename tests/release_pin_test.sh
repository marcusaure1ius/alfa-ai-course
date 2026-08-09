#!/usr/bin/env bash

# Закреплённый релиз обязан совпадать с текущей managed-моделью.
#
# T-0119: bootstrap-profile ссылался на v0.1.4, собранный до ADR-0016. Артефакт
# нёс compose с fail-hard подстановкой PLATFORM_GATE_ORIGIN, которую после
# снятия gateway никто не пишет, поэтому любая новая установка падала на
# docker compose ещё до запуска контейнеров. Полгода такого расхождения никто
# бы не заметил: конфиги едут внутри install.sh, и git diff их не показывает.
#
# Проверка сравнивает файлы, а не ищет известные плохие строки. Список плохих
# строк этот дефект уже один раз пропустил: в артефакте были и forward_auth, и
# ticket, но искали не там. Любое расхождение managed-конфигов между
# закреплённым релизом и рабочим деревом обязано ронять сборку и требовать
# перевыпуска релиза.

set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROFILE="$ROOT/platform/src/server/providers/timeweb/bootstrap-profile.ts"
COUNT=0
ok(){ COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail(){ printf 'not ok - %s\n' "$1" >&2; exit 1; }

[[ -f "$PROFILE" ]] || fail "bootstrap profile missing: ${PROFILE#"$ROOT/"}"

release="$(sed -n 's/^[[:space:]]*release:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROFILE" | head -1)"
[[ -n "$release" ]] || fail 'pinned release tag not found in bootstrap profile'
ok "bootstrap profile pins a release tag ($release)"

# Один и тот же тег обязан стоять и в installerUrl: рассинхрон дал бы скачивание
# артефакта одного релиза с контрольной суммой другого.
grep -Fq "releases/download/$release/install.sh" "$PROFILE" \
  || fail "installerUrl does not point at the pinned release $release"
ok 'installerUrl and release tag agree'

git -C "$ROOT" rev-parse --verify --quiet "$release^{commit}" >/dev/null \
  || fail "pinned release tag $release is not present in this checkout; CI needs fetch-depth 0"
ok "pinned release tag resolves to a commit"

git -C "$ROOT" merge-base --is-ancestor "$release^{commit}" HEAD \
  || fail "pinned release $release is not an ancestor of HEAD: it was cut from unrelated code"
ok 'pinned release is an ancestor of the current branch'

# Именно эти файлы едут на VPS ученика и определяют, поднимется ли среда.
for path in config/Caddyfile.platform docker-compose.platform.yml; do
  git -C "$ROOT" show "$release:$path" > "$ROOT/.release-pin-check" 2>/dev/null \
    || fail "pinned release $release does not contain $path"
  if ! diff -q "$ROOT/.release-pin-check" "$ROOT/$path" >/dev/null; then
    rm -f "$ROOT/.release-pin-check"
    fail "$path differs between pinned release $release and the working tree; re-cut the release"
  fi
  rm -f "$ROOT/.release-pin-check"
  ok "$path in pinned release matches the working tree"
done

printf '1..%d\n' "$COUNT"
