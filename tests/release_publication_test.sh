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

# The pinned release moves with every published installer, so the documented
# version is read here instead of duplicated as a constant that silently rots.
PINNED_VERSION="$(sed -nE 's/^- immutable (v[0-9]+\.[0-9]+\.[0-9]+) installer: .*/\1/p' "$RELEASE_DOC")"
[[ "$(printf '%s\n' "$PINNED_VERSION" | grep -c .)" == '1' ]] \
  || fail 'exactly one immutable installer version must be documented'
grep -Fq "https://github.com/marcusaure1ius/alfa-ai-course/releases/download/${PINNED_VERSION}/install.sh" \
  "$RELEASE_DOC" \
  || fail "immutable ${PINNED_VERSION} URL does not match the documented version"
ok 'stable and immutable GitHub Release URLs are documented'

if git -C "$ROOT" grep -nE 'RELEASE-HOST\.example|REAL-STABLE-HOST' -- '*.md'; then
  fail 'reserved release placeholder remains in tracked documentation'
fi
ok 'release placeholders are absent from tracked documentation'

printf '1..%d\n' "$COUNT"
