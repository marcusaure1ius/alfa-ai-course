# Публикация one-command installer

Проверено: 2026-07-14. Этот документ описывает границу между готовым кодом bootstrap и реальной командой, которую можно дать участнику.

## Текущий статус

Оригинальные файлы проекта лицензированы по Apache-2.0, а исходники опубликованы в публичном репозитории:

- repository: `https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit`;
- stable installer: `https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/latest/download/install.sh`;
- immutable v0.1.3 installer: `https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/download/v0.1.3/install.sh`;
- checksum: соседний asset `install.sh.sha256` в том же versioned release.

Public download, checksum и verify-only подтверждаются release evidence. Fresh-VPS domainless run и novice trial остаются честно не выполненными external gates.

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

GitHub Releases реализует stable channel через `/releases/latest/download/install.sh` и immutable channel через `/releases/download/<version>/install.sh`. Временный VPS преподавателя, IP-адрес из занятия или hostname работающего n8n не считаются distribution endpoint.

## Проверка после публикации

На новой Ubuntu 24.04 x86_64 VPS:

1. скачать URL отдельно и сравнить опубликованный SHA-256;
2. выполнить точную однострочную команду из Quick Start;
3. подтвердить автоматический hostname, валидный HTTPS и `doctor.sh` с `FAIL=0`;
4. подтвердить закрытый внешний TCP 5432;
5. повторить ту же команду и доказать неизменность `.env`, secrets и persistent data;
6. провести novice trial без устных подсказок;
7. зарегистрировать VPS evidence отдельно от локальных и release checks.

## Финальная форма для участника

В пользовательской документации остаётся одна команда:

```bash
curl -fsSL "https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/latest/download/install.sh" | sh
```

Никакие checksum, Git, archive, домен или DNS участник вручную не настраивает. Технические проверки остаются внутри артефакта и release process.
