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
