#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUIDES=(
  "$ROOT_DIR/docs/credentials.md"
  "$ROOT_DIR/docs/generic-llm-provider.md"
  "$ROOT_DIR/docs/llm-providers.md"
  "$ROOT_DIR/docs/telegram.md"
  "$ROOT_DIR/docs/email.md"
  "$ROOT_DIR/docs/crm.md"
  "$ROOT_DIR/docs/credentials/telegram.md"
  "$ROOT_DIR/docs/credentials/mail.md"
  "$ROOT_DIR/docs/credentials/crm.md"
)

count=0
ok() { count=$((count + 1)); printf 'ok %s - %s\n' "$count" "$1"; }

for guide in "${GUIDES[@]}"; do
  test -s "$guide"
  grep -q '2026-07-14' "$guide"
done
ok 'all credential and integration guides exist and have a check date'

grep -q 'docs.n8n.io/credentials' "$ROOT_DIR/docs/credentials.md"
grep -q 'core.telegram.org/bots/tutorial' "$ROOT_DIR/docs/credentials/telegram.md"
grep -q 'docs.n8n.io/integrations/builtin/credentials/imap' "$ROOT_DIR/docs/credentials/mail.md"
grep -q 'apidocs.bitrix24.com/settings/oauth' "$ROOT_DIR/docs/credentials/crm.md"
grep -q 'developers.sber.ru/docs/ru/gigachat' "$ROOT_DIR/docs/llm-providers.md"
grep -q 'aistudio.yandex.ru/docs/ru/ai-studio' "$ROOT_DIR/docs/llm-providers.md"
ok 'provider steps cite official documentation'

for guide in "${GUIDES[@]}"; do
  grep -Eqi 'Git|workflow JSON' "$guide"
  # T-0133: кириллица ищется явными классами, а не флагом кейс-фолдинга —
  # без UTF-8-локали grep не сворачивает регистр многобайтных символов, и
  # «Ротация» с заглавной ломала тест при пустых LANG/LC_ALL.
  grep -Eq '[Рр]отац|[Rr]otation' "$guide"
done
ok 'every guide warns about repository/workflow secrets and covers rotation'

grep -q '## Безопасный порядок подключения' "$ROOT_DIR/docs/credentials.md"
grep -q '## Общая диагностика' "$ROOT_DIR/docs/credentials.md"
grep -q '## Ожидаемый результат и ошибки' "$ROOT_DIR/docs/credentials/telegram.md"
grep -q '## Ожидаемый результат и ошибки' "$ROOT_DIR/docs/credentials/mail.md"
grep -q '## Ожидаемый результат controlled smoke' "$ROOT_DIR/docs/credentials/crm.md"
grep -q '## Ожидаемый результат, ротация и отзыв' "$ROOT_DIR/docs/generic-llm-provider.md"
ok 'novice flow includes expected success, common failures, rotation and revocation'

grep -q 'external_unverified' "$ROOT_DIR/docs/llm-providers.md"
grep -q 'LiteLLM исключён' "$ROOT_DIR/docs/llm-providers.md"
grep -q 'execution-local' "$ROOT_DIR/docs/llm-providers.md"
ok 'Yandex and GigaChat caveats stay aligned with the capability matrix'

for guide in "${GUIDES[@]}"; do
  while IFS= read -r target; do
    target="${target%%#*}"
    case "$target" in
      ''|http://*|https://*) continue ;;
    esac
    test -e "$(dirname "$guide")/$target"
  done < <(grep -oE '\]\([^)]+\)' "$guide" | sed -E 's/^\]\((.*)\)$/\1/')
done
ok 'all local guide links resolve'

if grep -Eqi '(Bearer [A-Za-z0-9._~+/-]{16,}|Basic [A-Za-z0-9+/=]{20,}|[0-9]{8,}:[A-Za-z0-9_-]{24,}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY)' "${GUIDES[@]}"; then
  echo 'secret-like value found in guide' >&2
  exit 1
fi
ok 'guides contain placeholders only and no secret-like values'

printf '1..%s\n' "$count"
