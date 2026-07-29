# ADR-0006: Один Vercel project для Course Control Plane

- Статус: Accepted
- Дата: 2026-07-29
- Supersedes: ADR-0005 только в части двух Vercel projects, отдельного `platform/destroyer` и второго Timeweb token

## Context

ADR-0005 зафиксировал отдельные `platform/web` и `platform/destroyer`, чтобы token удаления не был доступен основному web runtime. Такая граница уменьшает blast radius, но требует второго deployable, отдельного внутреннего протокола, двух наборов secrets, двух release lifecycle и дополнительной диагностики.

Первый этап предназначен для небольшой контролируемой аудитории. Владелец курса оплачивает инфраструктуру, управляет одним основным VPS и считает отдельный destroyer избыточным. Для этого масштаба эксплуатационная простота важнее отдельной process/deployment boundary.

## Decision

Course Control Plane остаётся отдельным продуктом внутри текущего репозитория, но имеет один deployable root `platform/` и один Vercel project.

Внутри него находятся:

- Next.js App Router и shadcn/ui;
- server-side auth и RBAC `admin`/`student`;
- Vercel Functions, Workflow и Cron;
- Marketplace PostgreSQL как source of truth;
- один server-only Timeweb adapter для read/create/update/delete/DNS операций, необходимых первому этапу.

Используется один `TIMEWEB_API_TOKEN`:

- token задаётся только в encrypted production environment Vercel;
- preview и development environments token не получают;
- token никогда не попадает в browser bundle, HTTP response, PostgreSQL, audit или application logs;
- фактическая гранулярность service permissions и разрешение удаления без Telegram-кода проверяются по Timeweb до production mutation; документ не предполагает неподтверждённого action-scoped delete-only token.

Timeweb adapter не является generic provider proxy. Он экспортирует фиксированный allowlist typed-операций для connection test, чтения catalog/account state, создания и reconciliation owned resources, DNS и удаления. Произвольные URL, HTTP methods, provider payload или resource IDs от browser не принимаются.

Удаление остаётся автоматическим только после всех проверок:

- server-side RBAC `admin`;
- shadcn `AlertDialog`;
- ввод точного имени среды и отдельное подтверждение потери данных;
- свежая повторная аутентификация;
- confirmed durable operation и audit event;
- удаление только сохранённых provider IDs с ownership платформы;
- idempotency, допустимое state transition и повторная reconciliation;
- hard limit одного active/creating/degraded VPS.

Основной VPS по-прежнему не размещает control plane и не получает Vercel/Timeweb secrets. Bootstrap выполняется через `cloud-init`, а готовность подтверждается provider state и внешними DNS/HTTPS/health checks.

## Accepted trade-off

Компрометация production server runtime потенциально даёт доступ и к create, и к delete capabilities одного token. Владелец осознанно принимает этот повышенный blast radius ради простоты небольшой учебной платформы.

Риск снижают production-only secret, deny-by-default server routes, typed allowlist вместо proxy, ownership checks, один VPS, re-auth, audit, idempotency и budget guardrails. Эти меры не эквивалентны отдельной deployment boundary и не должны так описываться.

## Условия пересмотра

Отдельный destroyer service и credential boundary снова рассматриваются, если выполняется хотя бы одно условие:

- платформа обслуживает несколько независимых организаций или внешних клиентов;
- разрешено более одного одновременно активного VPS;
- число администраторов и destructive operations заметно растёт;
- появляется делегированное управление инфраструктурой учениками;
- security review, incident или требования провайдера требуют отдельной isolation boundary.

Возврат к двум deployable оформляется новым ADR.

## Consequences

- Bootstrap, локальная разработка, Vercel configuration, CI и observability становятся проще.
- Не нужен signed internal cleanup protocol между двумя Vercel projects.
- Все provider mutations находятся в одном server runtime и требуют особенно строгой проверки server-only import boundaries.
- ADR-0005 продолжает определять multi-product repository, Vercel Workflow/PostgreSQL orchestration, starter-kit isolation, один VPS, домен и ownership model; только решение о двух projects/tokens заменено этим ADR.
- Реальные Timeweb mutations по-прежнему закрыты отдельным credentials, budget, capability и license gate.

## Evidence

- [Требования платформы](../docs/course-platform-requirements.md)
- [Архитектура](../docs/architecture.md)
- [ADR-0005](0005-course-platform-control-plane.md)
- [Timeweb API tokens](https://timeweb.cloud/docs/account-management/token)
