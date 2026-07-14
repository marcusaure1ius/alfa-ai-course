#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
count=0

ok() { count=$((count + 1)); printf 'ok %d - %s\n' "$count" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

for doc in backup-and-restore update-and-rollback security troubleshooting; do
  [[ -f "$ROOT/docs/$doc.md" ]] || fail "missing docs/$doc.md"
done
ok "all required operations guides exist"

for script in backup restore update rollback doctor uninstall firewall; do
  "$ROOT/scripts/$script.sh" --help >/dev/null || fail "$script --help failed"
  grep -Fq "./scripts/$script.sh" "$ROOT/docs/"*.md || fail "$script command is undocumented"
done
ok "documented script entrypoints match executable help contracts"

grep -Fq -- '--confirm-delete DELETE-N8N-DATA' "$ROOT/docs/troubleshooting.md"
grep -Fq 'Image-only downgrade' "$ROOT/docs/update-and-rollback.md"
grep -Fq 'SAFETY_ARCHIVE=' "$ROOT/docs/backup-and-restore.md"
grep -Fq 'FORWARD_BACKUP_ARCHIVE=' "$ROOT/docs/update-and-rollback.md"
ok "destructive operations retain confirmations, safety backups and downgrade guard"

for marker in '2FA' 'recovery codes' 'PII' 'EXECUTIONS_DATA_PRUNE' 'firewall' 'N8N_ENCRYPTION_KEY' 'data encryption key' 'provider'; do
  grep -Fiq "$marker" "$ROOT/docs/security.md" || fail "security marker missing: $marker"
done
ok "security covers 2FA, PII, pruning, firewall and both key-rotation boundaries"

symptoms="$(grep -c '^\*\*Симптом:\*\*' "$ROOT/docs/troubleshooting.md")"
checks="$(grep -c '^\*\*Проверка:\*\*' "$ROOT/docs/troubleshooting.md")"
solutions="$(grep -c '^\*\*Решение:\*\*' "$ROOT/docs/troubleshooting.md")"
[[ "$symptoms" -ge 10 && "$symptoms" == "$checks" && "$checks" == "$solutions" ]] \
  || fail "troubleshooting triads are incomplete: $symptoms/$checks/$solutions"
ok "troubleshooting has complete symptom-check-solution triads"

if rg -n 'curl[[:space:]]+-k|chmod[[:space:]]+777|docker[[:space:]]+volume[[:space:]]+rm' \
  "$ROOT/docs/backup-and-restore.md" "$ROOT/docs/update-and-rollback.md" \
  "$ROOT/docs/security.md" "$ROOT/docs/troubleshooting.md"; then
  fail "unsafe copy-paste command found"
fi
ok "guides contain no TLS bypass, world-writable mode or raw volume deletion command"

grep -Fq 'Docker Desktop на Darwin arm64' "$ROOT/docs/reports/2026-07-14-destructive-lifecycle.md"
grep -Fq 'Реальный Ubuntu VPS' "$ROOT/docs/troubleshooting.md"
grep -Fq 'не проверены' "$ROOT/docs/troubleshooting.md"
ok "actual local evidence and external gaps are disclosed"

for guide in "$ROOT/docs/backup-and-restore.md" "$ROOT/docs/update-and-rollback.md" \
  "$ROOT/docs/security.md" "$ROOT/docs/troubleshooting.md"; do
  while IFS= read -r target; do
    target="${target%%#*}"
    case "$target" in ''|http://*|https://*) continue ;; esac
    [[ -e "$(dirname "$guide")/$target" ]] || fail "broken link in $guide: $target"
  done < <(grep -oE '\]\([^)]+\)' "$guide" | sed -E 's/^\]\((.*)\)$/\1/')
done
ok "all local operations-guide links resolve"

printf '1..%d\n' "$count"
