#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
STABLE_URL='https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/latest/download/install.sh'
VERSIONED_URL='https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/download/v0.1.0/install.sh'
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
  "$ROOT/docs/release-publication.md"; do
  grep -Fq "$STABLE_URL" "$file" || fail "stable install URL missing: ${file#"$ROOT/"}"
done
grep -Fq "$VERSIONED_URL" "$ROOT/docs/release-publication.md" \
  || fail 'immutable v0.1.0 URL is missing'
ok 'stable and immutable GitHub Release URLs are documented'

if git -C "$ROOT" grep -nE 'RELEASE-HOST\.example|REAL-STABLE-HOST' -- '*.md'; then
  fail 'reserved release placeholder remains in tracked documentation'
fi
ok 'release placeholders are absent from tracked documentation'

printf '1..%d\n' "$COUNT"
