# Публикация one-command installer

Проверено: 2026-07-31. Этот документ описывает границу между готовым кодом bootstrap и реальной командой, которую можно дать участнику. Итоговое product-решение и blockers находятся в [release readiness](release-readiness.md).

## Текущий статус

Оригинальные файлы проекта лицензированы по Apache-2.0, а исходники опубликованы в публичном репозитории:

- repository: `https://github.com/marcusaure1ius/alfa-ai-course`;
- stable installer: `https://github.com/marcusaure1ius/alfa-ai-course/releases/latest/download/install.sh`;
- immutable v0.1.13 installer: `https://github.com/marcusaure1ius/alfa-ai-course/releases/download/v0.1.13/install.sh`;
- checksum: соседний asset `install.sh.sha256` в том же versioned release.

Public download, checksum, embedded archive и verify-only подтверждены для
`v0.1.1` — это **исторический снимок первого релиза**, а не текущего;
актуальный закреплённый релиз назван выше и сверяется с кодом автоматически.
Реальный fresh-VPS domainless run дошёл до HTTPS owner setup и editor.
Полный independent novice trial остаётся **FAIL**: после исправления двух
blockers выполнен targeted recovery, но новый clean 15–30-минутный проход ещё
не проведён. Поэтому технический артефакт пригоден для контролируемого пилота,
но не для полного MVP claim.

Отдельный технический fresh-VPS прогон stable `v0.1.0` от 2026-07-31 записан в
[participant public install technical E2E](reports/2026-07-31-participant-public-install-e2e.md):
safe rerun, reboot, внешний TLS и network exposure прошли. Он выполнен опытным
оператором, предшествует находкам novice trial и не закрывает его gate.

Exact commits, hashes, pins и artifact boundary релиза `v0.1.1` записаны в
[`release-manifest.json`](../release-manifest.json) — замороженный исторический
evidence, он намеренно не обновляется при перевыпусках.

## Сборка exact release

Рабочее дерево должно быть чистым, а ref — указывать на проверенный commit:

```bash
test -z "$(git status --short)"
./scripts/build-one-command-installer.sh \
  --ref HEAD \
  --output dist/install.sh
N8N_BOOTSTRAP_VERIFY_ONLY=1 sh dist/install.sh
sha256sum dist/install.sh
```

Builder создаёт один self-contained file. В нём закреплены exact commit и SHA-256 встроенного `git archive`; ссылки `latest` отсутствуют. Повреждение payload останавливает bootstrap до распаковки и любых системных изменений.

## Требования к hosting

- стабильный HTTPS URL, контролируемый организатором проекта;
- отсутствие redirect на HTTP;
- `Content-Type` для shell/text и отсутствие HTML error body при `200`;
- immutable versioned copy и отдельно управляемый stable channel;
- опубликованный checksum самого `install.sh` в release metadata;
- доступ к исходному commit и changelog для review;
- rollback предыдущего installer URL без замены пользовательских data volumes.

Обновление кода на уже развёрнутом хосте выполняется тем же опубликованным
артефактом с флагом `N8N_BOOTSTRAP_UPDATE_CODE=1` — порядок действий и откат
описаны в [starter-kit-code-update.md](starter-kit-code-update.md).

GitHub Releases реализует stable channel через `/releases/latest/download/install.sh` и immutable channel через `/releases/download/<version>/install.sh`. Временный VPS преподавателя, IP-адрес из занятия или hostname работающего n8n не считаются distribution endpoint.

## Проверка после публикации

Сначала asset проверяется без установки:

```bash
release_url="https://github.com/marcusaure1ius/alfa-ai-course/releases/download/v0.1.13"
curl -fsSLO "$release_url/install.sh"
curl -fsSLO "$release_url/install.sh.sha256"
sha256sum -c install.sh.sha256
N8N_BOOTSTRAP_VERIFY_ONLY=1 sh install.sh
```

Ожидаемый SHA-256 `install.sh`:
`0cbdcf1712e807f58bc17365dfaf2468b9e30480affc59fa5c653f5457d495a7`.
На macOS вместо `sha256sum -c` можно выполнить
`shasum -a 256 install.sh` и сравнить строку с ожидаемым значением.

На новой Ubuntu 24.04 x86_64 VPS:

1. скачать URL отдельно и сравнить опубликованный SHA-256;
2. выполнить точную однострочную команду из Quick Start;
3. подтвердить автоматический hostname, валидный HTTPS и `doctor.sh` с `FAIL=0`;
4. подтвердить закрытый внешний TCP 5432;
5. повторить ту же команду и доказать неизменность `.env`, secrets и persistent data;
6. провести novice trial без устных подсказок;
7. зарегистрировать VPS evidence отдельно от локальных и release checks.

### Воспроизводимый audit embedded archive

Следующий блок работает в Bash на Ubuntu и macOS. Он заново скачивает immutable
assets, проверяет sidecar, извлекает payload без запуска installer, нормализует
пути относительно корня archive, строит file-level checksum manifest и запускает
встроенный secret scanner:

Контрольные значения в блоке не захардкожены под конкретный релиз — они уже
расходились с закреплённым релизом трижды за неделю. Якорей два, и оба
обновляются автоматически вместе с релизом: ожидаемый SHA-256 самого
`install.sh` берётся из этого документа (обе копии в нём сверяются с
`installerSha256` в коде построчно тестом `release_publication_test`), а
SHA-256 встроенного архива — из заголовка самого bootstrap: пересборка
`git archive` непереносима между версиями git, поэтому внешняя константа для
архива была бы ложным якорем. Число файлов и хэш инвентаря печатаются для
фиксации в отчёте аудита, а не сверяются: их целостность уже доказана цепочкой
installer → payload.

```bash
set -Eeuo pipefail

audit_dir="$(mktemp -d "${TMPDIR:-/tmp}/n8n-release-audit.XXXXXX")"
release_url="https://github.com/marcusaure1ius/alfa-ai-course/releases/download/v0.1.13"
# Значение обязано совпадать со строкой «Ожидаемый SHA-256 install.sh» выше;
# обе копии сверяются с installerSha256 в bootstrap-profile.ts автоматически.
expected_installer_sha256="0cbdcf1712e807f58bc17365dfaf2468b9e30480affc59fa5c653f5457d495a7"

if command -v sha256sum >/dev/null 2>&1; then
  checksum=(sha256sum)
else
  checksum=(shasum -a 256)
fi

curl -fsSL "$release_url/install.sh" -o "$audit_dir/install.sh"
curl -fsSL "$release_url/install.sh.sha256" -o "$audit_dir/install.sh.sha256"
(
  cd "$audit_dir"
  "${checksum[@]}" -c install.sh.sha256
  installer_hash="$("${checksum[@]}" install.sh | awk '{print $1}')"
  test "$installer_hash" = "$expected_installer_sha256"
  N8N_BOOTSTRAP_VERIFY_ONLY=1 sh install.sh
  awk 'capture && /^N8N_KIT_PAYLOAD$/ {exit} capture {print} /<<'\''N8N_KIT_PAYLOAD'\''$/ {capture=1}' install.sh \
    | base64 -d > release.tar.gz
)

declared_archive_sha256="$(sed -n "s/^ARCHIVE_SHA256='\([0-9a-f]\{64\}\)'$/\1/p" "$audit_dir/install.sh")"
test -n "$declared_archive_sha256"
archive_hash="$("${checksum[@]}" "$audit_dir/release.tar.gz" | awk '{print $1}')"
test "$archive_hash" = "$declared_archive_sha256"

mkdir "$audit_dir/extracted"
tar -xzf "$audit_dir/release.tar.gz" -C "$audit_dir/extracted"
archive_root="$audit_dir/extracted/n8n-entrepreneur-starter-kit"
(
  cd "$archive_root"
  find . -type f -print0 | LC_ALL=C sort -z \
    | xargs -0 "${checksum[@]}" > "$audit_dir/files.sha256"
)

printf 'FILE_COUNT=%s\n' "$(wc -l < "$audit_dir/files.sha256" | tr -d ' ')"
printf 'INVENTORY_SHA256=%s\n' "$("${checksum[@]}" "$audit_dir/files.sha256" | awk '{print $1}')"
"$archive_root/tests/secret_scan.sh" --path "$archive_root"
printf 'Audit PASS: %s\n' "$audit_dir"
```

Ожидаемый итог: `install.sh: OK`, два embedded `PASS`, строки `FILE_COUNT` и
`INVENTORY_SHA256` (зафиксируйте их в отчёте аудита), отчёт секрет-сканера с
`0 findings` и `Audit PASS`. Каталог выводится намеренно: reviewer может
изучить `files.sha256`, после чего удалить только этот временный каталог.

В артефакте не допускаются runtime `.env`, private keys, credentials, dumps,
backups, logs, Docker volumes или `.git`. Дополнительно к scanner reviewer
сверяет это по `find`/`files.sha256`; `.env.example` является разрешённым
безопасным шаблоном.

## Финальная форма для участника

В пользовательской документации остаётся одна команда:

```bash
curl -fsSL "https://github.com/marcusaure1ius/alfa-ai-course/releases/latest/download/install.sh" | sh
```

Никакие checksum, Git, archive, домен или DNS участник вручную не настраивает. Технические проверки остаются внутри артефакта и release process.
