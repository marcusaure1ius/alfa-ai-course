#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPORT="$ROOT/docs/reports/2026-07-14-ubuntu-e2e.md"
COUNT=0

ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

[[ -f "$REPORT" ]] || fail "dated Ubuntu E2E report отсутствует"
grep -Fq 'Ubuntu `24.04.4 LTS`' "$REPORT"
grep -Fq 'Архитектура | `x86_64`' "$REPORT"
grep -Fq 'systemd `running`' "$REPORT"
ok "report records real Ubuntu 24.04 x86_64 guest"

for marker in \
  'Fresh install | PASS' \
  'Safe rerun | PASS' \
  'Reboot persistence | PASS' \
  'Intended exposure | PASS' \
  'Backup/restore | PASS' \
  'Update/rollback | PASS'; do
  grep -Fq "$marker" "$REPORT" || fail "missing acceptance evidence: $marker"
done
ok "report covers install, rerun, reboot, exposure and lifecycle"

grep -Fq 'TCP probes к guest `5432` и `5678` снаружи отказали' "$REPORT"
grep -Fq '`curl -k` не использовался' "$REPORT"
grep -Fq 'Public DNS/ACME/webhook | BLOCKED' "$REPORT"
ok "network and external boundaries are explicit"

grep -Fq 'PASS (9/9)' "$REPORT"
grep -Fq 'b83f8c35b175dbe969277e3cdd2e0d1e097507a67365b901a48b3e99fcbf9c0d' "$REPORT"
grep -Fq 'не добавлены `.env`, raw logs, backup archives, credentials' "$REPORT"
ok "exact lifecycle and redaction evidence are durable"

grep -Fq 'весь gate не объявлен PASS' "$REPORT"
grep -Fq 'нельзя использовать как evidence публичного deployment' "$REPORT"
ok "failed attempt and unsupported claims remain disclosed"

printf '1..%d\n' "$COUNT"
