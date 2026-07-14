#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
REHEARSAL="$ROOT/tests/destructive_lifecycle_rehearsal.sh"
REPORT="$ROOT/docs/reports/2026-07-14-destructive-lifecycle.md"
COUNT=0

ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

bash -n "$REHEARSAL"
ok "rehearsal Bash syntax"

help="$($REHEARSAL --help)"
[[ "$help" == *"T-0012-DISPOSABLE"* && "$help" == *"temporary directory"* && "$help" == *"redacted"* ]] \
  || fail "help не описывает disposable boundary"
ok "help documents marker, temporary root and redacted evidence"

tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/target"
cat > "$tmp/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf 'called\n' >> "$DOCKER_CALLED"
exit 99
EOF
chmod +x "$tmp/bin/docker"
export DOCKER_CALLED="$tmp/docker-called.log"

if PATH="$tmp/bin:$PATH" "$REHEARSAL" --work-root "$tmp/target" --confirm-disposable WRONG >"$tmp/wrong.log" 2>&1; then
  fail "неверная confirmation phrase принята"
fi
grep -q 'точная фраза' "$tmp/wrong.log" || fail "нет понятной ошибки confirmation"
[[ ! -e "$DOCKER_CALLED" ]] || fail "Docker вызван до confirmation"
ok "wrong confirmation refuses before Docker"

if PATH="$tmp/bin:$PATH" "$REHEARSAL" --work-root "$tmp/target" --confirm-disposable T-0012-DISPOSABLE >"$tmp/marker.log" 2>&1; then
  fail "отсутствующий marker принят"
fi
grep -q 'Marker .* отсутствует' "$tmp/marker.log" || fail "нет понятной ошибки marker"
[[ ! -e "$DOCKER_CALLED" ]] || fail "Docker вызван до marker validation"
ok "missing marker refuses before Docker"

rg -q 'docker volume inspect' "$REHEARSAL"
rg -q 'rehearsal остановлен до mutation' "$REHEARSAL"
rg -q 'com\.docker\.compose\.project\.working_dir' "$REHEARSAL"
rg -q 'compose down --remove-orphans --volumes' "$REHEARSAL"
rg -q 'sha256sum -c' "$REHEARSAL"
ok "fixed resources, ownership-safe cleanup and checksums are enforced"

[[ -f "$REPORT" ]] || fail "dated report отсутствует"
rg -q 'PASS \(9/9\)' "$REPORT"
rg -q 'vpsDnsHttpsExternal.*not-tested' "$REPORT"
rg -q 'a337d42077fdde3de6c710fd0400cfbf8412f4ab3202871d08aa9f8df7979cf0' "$REPORT"
ok "dated report records result, external gaps and artifact manifest"

printf '1..%d\n' "$COUNT"
