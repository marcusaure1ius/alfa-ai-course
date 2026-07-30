# ADR-0010: Provider-neutral cloud runtime и API discovery

- Статус: Accepted
- Дата: 2026-07-30
- Supersedes: ADR-0006 и ADR-0009 в части production environment gates и
  ручной настройки Timeweb project/SSH key IDs

## Context

Первый Timeweb smoke использовал временные kill-switches и ручные
`TIMEWEB_SMOKE_*` значения. Они дублировали данные аккаунта, уже доступные через
Public API, усложняли production deployment и ошибочно делали platform
orchestration зависимым от одного поставщика.

Платформе нужен обычный пользовательский вход и один серверный credential
активного cloud adapter. Добавление Yandex Cloud или Selectel не должно менять
browser DTO, RBAC, operation lifecycle и UI.

## Decision

- `PLATFORM_PROVIDER` выбирает зарегистрированный server-only adapter. Сейчас
  registry содержит `timeweb`; `fake` всегда используется вне production.
- У каждого adapter собственный credential contract. Для Timeweb это только
  encrypted Vercel Production secret `TIMEWEB_API_TOKEN`.
- UI, API routes, Cron и Workflow проверяют общий provider runtime, а не
  Timeweb-specific feature flags.
- Timeweb adapter получает projects через `GET /api/v1/projects`, а SSH keys
  через `GET /api/v1/ssh-keys`. Из пригодных положительных числовых ID
  детерминированно выбирается минимальный.
- Выбранные project/SSH key IDs существуют только в versioned
  `timeweb-provisioning-v3` operation snapshot. Они не являются environment
  configuration и перед mutation повторно сверяются с live catalog.
- Пустой или некорректный список project/SSH keys даёт понятную catalog/plan
  ошибку. Это не маскируется как закрытый mutation gate.
- RBAC, CSRF, fresh re-auth, TOTP delete, audit, idempotency, ownership,
  reconciliation и hard limit одного VPS остаются обязательными.

## Consequences

- Production Timeweb deployment настраивается двумя значениями:
  `PLATFORM_PROVIDER=timeweb` и secret `TIMEWEB_API_TOKEN`.
- Изменение или добавление проекта/SSH key в кабинете подхватывается следующим
  live preview без redeploy.
- Если владельцу понадобится явный выбор проекта или ключа, он добавляется в
  provider-neutral admin preference, а не как новый environment variable.
- Новый cloud provider добавляет registry entry и server-only adapter. Browser
  flow и доменный operation lifecycle не получают provider credentials или
  произвольные provider payload.

## Evidence

- [Timeweb API](https://timeweb.cloud/api-docs)
- [Официальный Timeweb CLI: project и ssh-key list](https://github.com/timeweb-cloud/twc/blob/master/docs/ru/CLI_REFERENCE.md)
- [Архитектура](../docs/architecture.md)
- [Требования платформы](../docs/course-platform-requirements.md)
