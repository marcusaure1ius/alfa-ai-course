# Changelog

Все существенные изменения n8n Entrepreneur Starter Kit фиксируются здесь.
Формат основан на Keep a Changelog; версии соответствуют публичным GitHub
Releases.

## [Unreleased]

### Release gate

- Полный MVP claim остаётся `NO-GO`, пока новый независимый новичок не завершит
  чистый путь до editor за 15–30 минут без устных подсказок.
- Реальные Generic/Yandex/GigaChat, Telegram, email и CRM provider smokes
  остаются external-unverified, если для конкретного provider не указано иное.

## [0.1.6] - 2026-08-11

Релиз выпущен потому, что общий managed-профиль нёс личный файл подтверждения
права собственности в поисковой консоли. Файл привязан к **аккаунту** владельца,
а не к сайту, а `config/Caddyfile.platform` едет в публичном релизном артефакте
и разворачивается на произвольных хостах: любая посторонняя установка starter
kit начинала отдавать чужое доказательство владения. Практическая экспозиция
удерживалась только guard по хосту в коде платформы, который распространяется
отдельно от конфига.

### Исправлено

- имя файла подтверждения приходит из `SITE_VERIFICATION_FILE` конкретного
  хоста, тело ответа выводится из него же; без переменной endpoint остаётся на
  заведомо инертном пути (T-0123);
- гейт `compose-config` привязан к **пути** обработчика, а не только к телу
  ответа: переименование `handle /robots.txt` оставляло проверки зелёными, пока
  `/robots.txt` снова уходил в n8n и отдавал SPA-оболочку с кодом `200`;
- исправлено неверное утверждение в `config/Caddyfile.platform` и
  `docs/security.md` о том, что `robots.txt` обязан стоять до общего `handle`:
  Caddy сортирует `handle` по специфичности матчера, а не по месту в файле;
- `.env.platform.example` больше не предлагает снятую `PLATFORM_GATE_ORIGIN`
  (ADR-0016) и описывает новую переменную.

### Ловушка конфигурации

Пустое значение `SITE_VERIFICATION_FILE` опаснее отсутствующего: подстановка
`{$VAR:default}` внутри Caddyfile читает `default` только когда переменная не
определена вовсе, а определённое пустое значение оставляет матчер `/` и
перехватывает корень сайта — вход в n8n начинает отдавать `404`. Отсюда `:-` в
`docker-compose.platform.yml` и отдельная проверка в гейте.

Закреплённые образы не менялись: n8n `2.29.10`, PostgreSQL `17.10-bookworm`,
Caddy `2.11.4-alpine`.

## [0.1.5] - 2026-08-09

Релиз выпущен из-за того, что закреплённый `v0.1.4` ломал новую установку
управляемой среды. Он был собран за день до снятия gateway и нёс
`docker-compose.platform.yml` с обязательной переменной `PLATFORM_GATE_ORIGIN`,
которую после ADR-0016 больше никто не задаёт: `docker compose` отказывался
резолвить конфигурацию ещё до запуска контейнеров.

Расхождение не было видно в `git diff`, потому что конфигурация едет внутри
`install.sh` встроенным архивом.

### Изменено

- managed Caddy profile без `forward_auth` и `/__neurokurs/exchange`: ученик
  входит в n8n по собственному аккаунту (ADR-0016);
- одноразовый токен приглашения редактируется в access- и error-логах Caddy;
- добавлены собственный `robots.txt` с `Disallow: /` и заголовок
  `X-Robots-Tag: noindex, nofollow`;
- добавлен файл подтверждения владения Google Search Console, переживающий
  переустановку среды.

Закреплённые образы не менялись: n8n `2.29.10`, PostgreSQL `17.10-bookworm`,
Caddy `2.11.4-alpine`.

## [0.1.4] - 2026-08-04

Первый релиз из консолидированного репозитория
`marcusaure1ius/alfa-ai-course`. Канал установки переехал туда же.

### Added

- Обход Docker Hub `429` через официальный proxy Timeweb в основной ветке.
- Технический E2E публичной установки на чистом VPS как отдельное evidence.

### Changed

- Payload one-command installer больше не содержит исходники Course Control
  Plane: границы distributable заданы в `.gitattributes` и закреплены тестом.
- Провижининг платформы указывает на новый installer; версия bootstrap-профиля
  поднята до `starter-kit-v0.1.5`, поэтому сохранённый план со старым
  установщиком отвергается как `INVALID_INSTALL_PLAN`.
- Разведена коллизия трёх ADR-0012.

### Прочее

Релизы `0.1.2` и `0.1.3` публиковались из релизной ветки и отдельных записей
здесь не получили. Они остаются доступны в заархивированном репозитории
`n8n-entrepreneur-starter-kit` как путь отката.

## [0.1.1] - 2026-07-31

### Added

- Пошаговый SSH onboarding с нуля для macOS/Linux и Windows 10/11, включая
  создание ключа и путь через provider web-console.
- Timeweb-specific allowlisted Docker registry proxy с bounded retry и
  сохранением exact image tags.
- Структурированный novice route с явными действиями, вставкой команд и
  ожидаемыми результатами.

### Changed

- Clean install сразу устанавливает n8n `2.29.10`; пара `2.29.9 → 2.29.10`
  описана только как отдельный lifecycle update/rollback rehearsal.
- Stable installer пересобран из commit
  `68063340c8113d98586f71704c30adc6d1f0eb3a`.

### Verified

- Public asset checksum и embedded payload verification.
- Реальный Timeweb install через proxy до HTTPS owner setup и editor.
- Novice trial остаётся FAIL как полный 15–30-минутный path; targeted recovery
  после исправлений прошёл.

## [0.1.0] - 2026-07-14

### Added

- Первый публичный one-command installer для Ubuntu 24.04 LTS x86_64.
- Pinned n8n, PostgreSQL, Caddy, Docker Engine и Compose runtime.
- Install, doctor, backup, restore, update, rollback, uninstall и workflow
  portability scripts.
- Русская документация, workflow distribution, quality gates и Apache-2.0
  project license boundary.

[Unreleased]: https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/tag/v0.1.1
[0.1.0]: https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/tag/v0.1.0
