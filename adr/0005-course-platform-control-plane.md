# ADR-0005: Course control plane в текущем multi-product репозитории

- Статус: Accepted
- Дата: 2026-07-29
- Дополняет: ADR-0001 и ADR-0004 без изменения starter-kit runtime baseline

## Context

Репозиторий изначально содержал один продукт: устанавливаемый на Ubuntu VPS `n8n Entrepreneur Starter Kit`. Его product brief исключал автоматическую покупку VPS и managed platform из MVP, а архитектура описывала только runtime n8n/PostgreSQL/Caddy.

Владелец решил добавить второй продукт — web-платформу курса с ролями admin/student и управлением одним основным Timeweb VPS. Код должен остаться в текущем репозитории. Control plane размещается на Vercel, использует доменную зону `neurokurs.ru` и полностью автоматическое удаление инфраструктуры после усиленного подтверждения.

Без явной границы platform build, credentials и deployment могут случайно попасть в installer/runtime starter kit либо сломать его независимо проверенный release contract.

## Decision

Репозиторий становится multi-product:

- существующий root сохраняет starter kit: Compose, installer/scripts, workflow distribution и пользовательскую документацию;
- новый control plane размещается только в `platform/`;
- Vercel project `course-platform-web` имеет Root Directory `platform/web/`;
- Vercel project `course-platform-destroyer` имеет Root Directory `platform/destroyer/`;
- оба deployable содержат собственные package manifests, lockfiles, build, lint, typecheck, tests и Vercel configuration;
- root starter-kit release и Vercel platform release независимы; изменение одного не публикует другое автоматически.

Архитектура первого этапа platform:

- Next.js App Router и shadcn/ui;
- server-side RBAC `admin`/`student`;
- Vercel Functions для коротких HTTP API;
- Vercel Workflow в web project для durable multi-step provisioning и orchestration удаления;
- Vercel Cron с `CRON_SECRET` для reconciliation;
- Marketplace PostgreSQL как source of truth;
- Timeweb provisioner adapter доступен только server-side web project;
- destroyer project не имеет UI или произвольного provider proxy и вызывает только allowlisted delete endpoints;
- `TIMEWEB_PROVISIONER_TOKEN` существует только в production environment web project;
- `TIMEWEB_DESTROYER_TOKEN` существует только в production environment destroyer project;
- preview/development deployments не получают production Timeweb tokens;
- основной VPS содержит только n8n starter-kit runtime и не размещает control plane.

Первый этап допускает ровно один active/creating/degraded VPS. Default hostname — `n8n.neurokurs.ru`. VPS, Timeweb account, домен и расходы принадлежат владельцу курса. Перед предоставлением управляемого n8n ученикам сохраняется отдельный license gate.

Исходящий SSH из Vercel не используется. Bootstrap выполняется через Timeweb `cloud-init`, а готовность подтверждается provider state и внешними DNS/HTTPS/health checks. Remote SSH требует нового ADR.

## Security boundaries

- Root `.env`, VPS secrets, backup archives и Compose volumes не входят в Vercel build context.
- Platform secrets не записываются в Git, PostgreSQL, browser payload, audit или application logs.
- Provisioning и deletion используют разные Timeweb tokens и разные Vercel projects.
- Web Workflow отправляет destroyer project подписанную короткоживущую cleanup-команду; destroyer повторно проверяет confirmed operation и provider-resource ownership в PostgreSQL.
- Browser/API и web runtime не получают destroyer token.
- Delete требует shadcn `AlertDialog`, точного имени среды, подтверждения потери данных и свежей re-auth; после этого provider cleanup идёт автоматически без Telegram-кода.
- Provider ownership IDs и hard limit `1 VPS` проверяются до каждой платной mutation.

## CI и release boundaries

- Изменения `platform/web/**` и `platform/destroyer/**` обязаны проходить собственные lint, typecheck, unit/integration tests и Vercel builds.
- Изменения root starter kit проходят существующие shell/configuration/workflow checks.
- Изменения общих docs, installer release contract или platform bootstrap profile проходят обе релевантные группы проверок.
- Acceptance platform foundation включает доказательство, что root installer/runtime contract не изменён и существующие проверки проходят.

## Consequences

- Владелец работает в одной папке и одном Projects Control project.
- Два продукта имеют раздельные deployment и secret boundaries несмотря на общий Git history.
- Требуется path-aware CI, два явных Vercel Root Directory и versioned signed internal cleanup contract.
- Обычный Vercel HTTP request не используется как durable worker; orchestration зависит от Vercel Workflow и внешней PostgreSQL.
- Реальные Timeweb mutations остаются за отдельным budget/credentials/license gate.
- ADR-0001 продолжает определять starter-kit runtime; его запрет managed hosting относится к исходному starter-kit MVP и не описывает новый control plane.

## Evidence

- [Требования платформы](../docs/course-platform-requirements.md)
- [Vercel Workflow concepts](https://vercel.com/docs/workflows/concepts)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Postgres on Vercel](https://vercel.com/docs/postgres)
- [Timeweb API tokens](https://timeweb.cloud/docs/account-management/token)
