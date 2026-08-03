# ADR-0011: Post-provisioning установка n8n через provider-side reinstall

- Статус: Accepted
- Дата: 2026-07-31
- Supersedes: T-0057 и ADR-0005 только в части объединённого create + bootstrap
  flow

## Context

ADR-0009 отделил создание чистого VPS от установки starter kit. Deploy
configurator может выбрать Ubuntu 26.04, тогда как root starter kit и его
публичный installer проверены только на Ubuntu 24.04 LTS x86_64. Исходящий SSH
из Vercel запрещён каноническими требованиями.

Актуальная схема Timeweb Public API, проверенная 2026-07-31, допускает поля
`os_id` и `cloud_init` в allowlisted `PATCH /api/v1/servers/{server_id}`.
Timeweb CLI использует тот же update endpoint для переустановки сервера и после
неё повторно прикрепляет SSH-ключи. Переустановка уничтожает данные системного
диска, поэтому её нельзя маскировать под обычную настройку.

## Decision

Control Plane реализует установку n8n отдельной durable operation
`install_environment` после завершения server-only create flow.

- Admin запускает `POST .../install-n8n` только для единственного owned
  `active` или восстанавливаемого `degraded` plain VPS.
- Перед operation обязательны свежая re-auth, точное имя среды и отдельное
  подтверждение полной потери данных VPS.
- Server-side preflight повторно проверяет exact owned server, привязанный
  floating IPv4, исходный SSH key и наличие Ubuntu 24.04 в live catalog.
- Provider mutation переустанавливает **тот же server ID** через allowlisted
  `PATCH` с Ubuntu 24.04 и exact versioned cloud-init. Второй VPS или IP не
  создаётся.
- После переустановки adapter идемпотентно проверяет и при необходимости
  повторно прикрепляет исходный SSH key.
- До reimage платформа резервирует `n8n.neurokurs.ru`, создаёт только owned A
  record и ждёт совпадения DNS с exact floating IP. Это позволяет installer и
  Caddy получить TLS без SSH-команд со стороны Control Plane.
- Cloud-init скачивает exact starter-kit release `v0.1.0`, проверяет закреплённый
  SHA-256 и запускает installer с `N8N_HOST=n8n.neurokurs.ru`. `releases/latest`
  запрещён.
- Durable marker записывается **до** destructive PATCH. Retry или новый worker
  сначала reconciles provider status и OS, не повторяя reimage вслепую.
- Готовность подтверждается только внешними DNS, TCP, TLS, `/healthz`, editor и
  owner-state checks. Успех заканчивается `ready_owner_setup_required`.
- Permanent/исчерпанные ошибки переводят среду в `degraded`; обычный owned
  delete flow очищает DNS, VPS и floating IP после success или partial failure.

## Security boundary

- Vercel не хранит и не использует SSH private key и не открывает исходящий SSH.
- Browser не передаёт provider ID, OS ID, cloud-init или произвольный payload.
- Cloud-init не содержит Timeweb/Vercel credentials, пользовательских паролей
  или заранее сгенерированного `N8N_ENCRYPTION_KEY`.
- Provider IDs остаются только в durable ownership records; UI показывает
  пользовательские состояния и безопасные redacted errors.
- Автоматическое создание owner n8n не выполняется.

## Consequences

- Созданный plain VPS можно использовать отдельно, пока admin явно не выбрал
  разрушительную установку n8n.
- Выбранная в configurator Ubuntu 26.04 не расширяет support matrix starter kit:
  install flow осознанно переустанавливает системный диск на Ubuntu 24.04.
- Любые данные, добавленные на plain VPS между create и install, будут потеряны;
  UI и API требуют повторного подтверждения этого факта.
- Совместимость starter kit с Ubuntu 26.04 потребует отдельного ADR, pins и
  реального E2E; текущий flow нельзя незаметно переключить на новый образ.

## Evidence

- [Timeweb Public API](https://timeweb.cloud/api-docs)
- [Timeweb cloud-init](https://timeweb.cloud/docs/cloud-servers/manage-servers/cloud-init)
- [ADR-0009](0009-timeweb-deploy-configurator.md)
- [Требования Control Plane](../docs/course-platform-requirements.md)
- [Архитектура](../docs/architecture.md)
- [Redacted production E2E](../docs/reports/t0086-control-plane-n8n-install-e2e-2026-07-31.md)
