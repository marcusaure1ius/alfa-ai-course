#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
RELEASE_DOC="$ROOT/docs/release-publication.md"
STABLE_URL='https://github.com/marcusaure1ius/alfa-ai-course/releases/latest/download/install.sh'
COUNT=0

ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

[[ -s "$ROOT/LICENSE" ]] || fail 'LICENSE is missing'
grep -q '^                           Version 2.0, January 2004$' "$ROOT/LICENSE" \
  || fail 'LICENSE is not Apache-2.0'
grep -q '^   END OF TERMS AND CONDITIONS$' "$ROOT/LICENSE" \
  || fail 'LICENSE text is incomplete'
grep -q 'Apache License 2.0' "$ROOT/README.md"
grep -q 'не перелицензирует n8n' "$ROOT/LICENSE-NOTES.md"
ok 'Apache-2.0 and third-party license boundary are explicit'

for file in \
  "$ROOT/README.md" \
  "$ROOT/docs/quick-start.md" \
  "$ROOT/docs/installation.md" \
  "$ROOT/docs/timeweb-clean-install.md" \
  "$RELEASE_DOC"; do
  grep -Fq "$STABLE_URL" "$file" || fail "stable install URL missing: ${file#"$ROOT/"}"
done

PINNED_VERSION="$(sed -nE 's/^- immutable (v[0-9]+\.[0-9]+\.[0-9]+) installer: .*/\1/p' "$RELEASE_DOC")"
[[ "$(printf '%s\n' "$PINNED_VERSION" | grep -c .)" == '1' ]] \
  || fail 'exactly one immutable installer version must be documented'
grep -Fq "https://github.com/marcusaure1ius/alfa-ai-course/releases/download/${PINNED_VERSION}/install.sh" \
  "$RELEASE_DOC" \
  || fail "immutable ${PINNED_VERSION} URL does not match the documented version"
ok 'stable and immutable GitHub Release URLs are documented'

# T-0119: сверка версии с самим документом самосогласована при любом значении и
# провалиться не может. Именно так документ и разошёлся с кодом: профиль уехал
# на v0.1.5, а runbook «Проверка после публикации» продолжал вести оператора к
# снятому v0.1.4 и давал ему зелёный результат на артефакте, который валится на
# docker compose. Источником истины назначен код, а не документ.
PROFILE="$ROOT/platform/src/server/providers/timeweb/bootstrap-profile.ts"
[[ -f "$PROFILE" ]] || fail "bootstrap profile missing: ${PROFILE#"$ROOT/"}"

profile_release="$(sed -n 's/^[[:space:]]*release:[[:space:]]*"\([^"]*\)".*/\1/p' "$PROFILE" | head -1)"
[[ -n "$profile_release" ]] || fail 'pinned release tag not found in bootstrap profile'
[[ "$PINNED_VERSION" == "$profile_release" ]] \
  || fail "documented installer $PINNED_VERSION differs from pinned release $profile_release in bootstrap profile"

profile_sha="$(sed -n 's/^[[:space:]]*"\([0-9a-f]\{64\}\)",$/\1/p' "$PROFILE" | head -1)"
[[ -n "$profile_sha" ]] || fail 'installerSha256 not found in bootstrap profile'
grep -Fq "$profile_sha" "$RELEASE_DOC" \
  || fail "documented installer SHA-256 differs from installerSha256 in bootstrap profile"
ok 'release runbook agrees with the pinned release in code'

if git -C "$ROOT" grep -nE 'RELEASE-HOST\.example|REAL-STABLE-HOST' -- '*.md'; then
  fail 'reserved release placeholder remains in tracked documentation'
fi
ok 'release placeholders are absent from tracked documentation'

printf '1..%d\n' "$COUNT"
