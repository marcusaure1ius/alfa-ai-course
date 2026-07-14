#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
count=0

ok() { count=$((count + 1)); printf 'ok %d - %s\n' "$count" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

for file in docs/participant-handoff.md docs/instructor-guide.md LICENSE-NOTES.md; do
  [[ -f "$ROOT/$file" ]] || fail "missing $file"
  grep -Fq 'Проверено: 2026-07-14' "$ROOT/$file" || fail "missing check date in $file"
done
ok "handoff, instructor and license documents exist with check date"

handoff="$ROOT/docs/participant-handoff.md"
[[ "$(grep -c '| \[ \] |' "$handoff")" -ge 15 ]] || fail "handoff lacks observable checklist"
for marker in 'Ответственный после handoff' 'Наблюдаемый результат' 'instructor key/account удалён' 'не передаются passwords' 'off-host backup' 'doctor.sh' 'update review' 'NOT READY'; do
  grep -Fiq "$marker" "$handoff" || fail "handoff marker missing: $marker"
done
ok "handoff assigns ownership and ties claims to observable evidence"

instructor="$ROOT/docs/instructor-guide.md"
for marker in 'Local disposable demo' 'Participant VPS' 'не доказывает Ubuntu' 'не просит recovery codes' 'redacted doctor output' 'ротируйте secret' 'instructor access' 'not-tested'; do
  grep -Fiq "$marker" "$instructor" || fail "instructor boundary missing: $marker"
done
ok "instructor guide separates demo/VPS evidence and forbids secret retention"

license="$ROOT/LICENSE-NOTES.md"
for marker in 'не является юридической консультацией' 'Sustainable Use License 1.0' 'внутренними бизнес-задачами' 'white-label' 'платный hosting' 'коммерческого соглашения' 'не выдаёт лицензию' 'license@n8n.io'; do
  grep -Fiq "$marker" "$license" || fail "license marker missing: $marker"
done
grep -Fq 'https://github.com/n8n-io/n8n/blob/master/LICENSE.md' "$license"
grep -Fq 'https://docs.n8n.io/sustainable-use-license/' "$license"
ok "license notes cite dated official terms, limits and disclaimer"

grep -Eq 'CHANGELOG\.md|release notes' "$instructor" || fail "release notes expectation missing"
grep -Fq 'exact pins' "$instructor"
grep -Fq 'known gaps' "$instructor"
ok "instructor guide defines release and changelog evidence"

if rg -n 'curl[[:space:]]+-k|chmod[[:space:]]+777|N8N_ENCRYPTION_KEY=' "$handoff" "$instructor" "$license"; then
  fail "unsafe command or secret assignment found"
fi
ok "handoff materials contain no TLS bypass, unsafe mode or secret assignment"

for guide in "$handoff" "$instructor" "$license"; do
  while IFS= read -r target; do
    target="${target%%#*}"
    case "$target" in ''|http://*|https://*) continue ;; esac
    [[ -e "$(dirname "$guide")/$target" ]] || fail "broken link in $guide: $target"
  done < <(grep -oE '\]\([^)]+\)' "$guide" | sed -E 's/^\]\((.*)\)$/\1/')
done
ok "all local handoff links resolve"

printf '1..%d\n' "$count"
