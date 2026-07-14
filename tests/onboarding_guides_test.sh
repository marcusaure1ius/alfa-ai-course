#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
GUIDES=(
  "$ROOT/docs/quick-start.md"
  "$ROOT/docs/timeweb-cloud.md"
  "$ROOT/docs/timeweb-clean-install.md"
  "$ROOT/docs/yandex-cloud.md"
  "$ROOT/docs/domain-and-dns.md"
)
COUNT=0

ok() { COUNT=$((COUNT + 1)); printf 'ok %d - %s\n' "$COUNT" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

for guide in "${GUIDES[@]}"; do
  [[ -s "$guide" ]] || fail "missing guide: $guide"
  grep -q '2026-07-14' "$guide" || fail "missing check date: $guide"
done
ok "five onboarding guides exist and state the check date"

grep -q 'timeweb.cloud/docs/cloud-servers/manage-servers/create-server' "$ROOT/docs/timeweb-cloud.md"
grep -q 'timeweb.cloud/docs/cloud-servers/manage-servers/ssh-keys' "$ROOT/docs/timeweb-cloud.md"
grep -q 'timeweb.cloud/docs/firewall' "$ROOT/docs/timeweb-cloud.md"
grep -q 'yandex.cloud/ru/docs/compute/operations/vm-create/create-linux-vm' "$ROOT/docs/yandex-cloud.md"
grep -q 'yandex.cloud/en/docs/compute/operations/vm-connect/ssh' "$ROOT/docs/yandex-cloud.md"
grep -q 'yandex.cloud/ru/docs/vpc/operations/security-group-add-rule' "$ROOT/docs/yandex-cloud.md"
grep -q 'yandex.cloud/ru/docs/dns/operations/resource-record-create' "$ROOT/docs/domain-and-dns.md"
ok "cloud and DNS steps link official provider documentation"

for guide in "$ROOT/docs/quick-start.md" "$ROOT/docs/timeweb-cloud.md" "$ROOT/docs/yandex-cloud.md"; do
  grep -Eqi '2 vCPU.*2 GiB.*20 GiB|2 vCPU.*2 GiB' "$guide" || fail "recommended sizing missing: $guide"
  grep -Eqi '1 vCPU.*1 GiB.*10 GiB|1 vCPU.*1 GiB' "$guide" || fail "test minimum missing: $guide"
  grep -Eqi 'только.*тест|тестов' "$guide" || fail "minimum not labelled test-only: $guide"
done
ok "minimum test sizing is separated from working recommendation"

grep -q 'git archive' "$ROOT/docs/quick-start.md"
grep -q 'sha256sum -c' "$ROOT/docs/quick-start.md"
grep -q 'scp ' "$ROOT/docs/quick-start.md"
grep -q 'install.sh --non-interactive --dry-run' "$ROOT/docs/quick-start.md"
grep -q './scripts/doctor.sh' "$ROOT/docs/quick-start.md"
grep -q 'Публичный Git remote или release URL пока не зарегистрирован' "$ROOT/docs/quick-start.md"
ok "Quick Start uses the locally verified archive/checksum/install/doctor path"

grep -q 'SSH-сес' "$ROOT/docs/timeweb-cloud.md"
grep -q 'SSH-сес' "$ROOT/docs/yandex-cloud.md"
grep -q 'Authoritative\|authoritative' "$ROOT/docs/domain-and-dns.md"
grep -q 'AAAA' "$ROOT/docs/domain-and-dns.md"
grep -q 'curl -k' "$ROOT/docs/domain-and-dns.md"
ok "DNS and SSH troubleshooting keeps safe recovery boundaries"

if grep -En '(^|[[:space:]])curl[^`]*\|[[:space:]]*(sudo[[:space:]]+)?bash' "${GUIDES[@]}"; then
  fail "curl pipe bash install path found"
fi
grep -q 'не предлагает `curl | bash`' "$ROOT/docs/quick-start.md"
ok "no curl-pipe-shell installation path is offered"

for guide in "${GUIDES[@]}" "$ROOT/README.md" "$ROOT/docs/installation.md"; do
  while IFS= read -r target; do
    target="${target%%#*}"
    case "$target" in ''|http://*|https://*) continue ;; esac
    [[ -e "$(dirname "$guide")/$target" ]] || fail "broken link in $guide: $target"
  done < <(grep -oE '\]\([^)]+\)' "$guide" | sed -E 's/^\]\((.*)\)$/\1/')
done
ok "all local onboarding cross-links resolve"

tmp="$(mktemp)"
trap 'rm -f -- "$tmp"' EXIT
for guide in "${GUIDES[@]}"; do
  awk '
    /^```bash$/ {inside=1; next}
    /^```$/ && inside {inside=0; print ""; next}
    inside {print}
  ' "$guide" >> "$tmp"
done
bash -n "$tmp"
ok "all documented Bash command blocks pass syntax validation"

if grep -Eqi '(Bearer [A-Za-z0-9._~+/-]{16,}|[0-9]{8,}:[A-Za-z0-9_-]{24,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)' "${GUIDES[@]}"; then
  fail "secret-like material found"
fi
ok "guides contain placeholders only and no secret-like material"

printf '1..%d\n' "$COUNT"
