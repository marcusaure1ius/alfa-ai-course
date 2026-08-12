# Vercel foundation платформы курса

- Подготовлено: 2026-07-30
- Deployable root: `platform/`
- Provider mode foundation: только `fake`
- Vercel project: `alfa-ai-course-platform`
  (`prj_Ot0S3wUkIij7HN4RMfdjuAeBpADi`)
- Neon resource: `alfa-ai-course-platform-db`
  (`store_4g5YKEC5u4zeYG3j`, Frankfurt)

## Как выкатывается production

Проверено 2026-08-04.

Production **не выкатывается автоматически**. `platform/vercel.json` содержит
`git.deploymentEnabled: {"main": false}`, поэтому merge в `main` не создаёт
production deployment. Выкатка — явное действие:

```bash
cd platform
vercel --prod
```

Preview для веток в конфигурации включены, но фактически не используются:
ветки остаются локальными и на GitHub не уходят — см. «Ветки и выкатка» в
[AGENTS.md](../AGENTS.md). Если ветка всё же попадёт на `origin`, её превью
упрётся в лимит плана и будет красным независимо от кода.

Откат — на предыдущий READY deployment:

```bash
vercel rollback <previous-deployment-id-or-url>
```

Чтобы узнать, что сейчас в production, нельзя полагаться на git-историю:
сверяйте `meta.githubCommitSha` последнего production deployment с `main`.

История вопроса: до 2026-08-04 project был привязан к репозиторию-зеркалу
`n8n-entrepreneur-starter-kit`, где нет каталога `platform/`. Единственная
git-триггерная production-сборка 2026-07-31 упала с
`NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST`, а push в рабочий репозиторий не
запускал ничего. Привязка переведена на `alfa-ai-course`.

## Архитектурный контракт

Создаётся один Vercel project с Root Directory `platform/`. Starter-kit root,
его Compose, scripts и workflows не должны попадать в build context.
`platform/vercel.json` объявляет один Cron:

```text
GET /api/cron/reconcile
17 3 * * * (UTC, один раз в сутки)
```

По официальной документации Vercel Cron активируется только production
deployment. Vercel передаёт `CRON_SECRET` как Bearer credential; route также
проверяет `VERCEL_ENV=production` и `PLATFORM_PROVIDER=fake`.

Cron claim хранится в `operations.workflow_run_id` как короткий
`reconcile:<uuid>`. Claim получает только `queued/running` operation без
прикреплённого Workflow run или с claim старше пяти минут. PostgreSQL
`FOR UPDATE SKIP LOCKED` предотвращает двойной claim. После `start()` marker
атомарно заменяется реальным Workflow run ID. Ошибка освобождает claim для
следующего запуска. Ответ и log содержат только агрегированные счётчики.

## Environment inventory

Ресурсы и значения ниже созданы 2026-07-30 после явного разрешения владельца.
Secret values не копируются в evidence или логи.

| Key | Development | Preview | Production |
|---|---|---|---|
| `VERCEL_ENV` | system/development | system/preview | system/production |
| `PLATFORM_PROVIDER` | `fake` | `fake` | `fake` |
| `DATABASE_URL` | local pooled-equivalent | Marketplace-managed preview scope | production pooled |
| `DATABASE_URL_UNPOOLED` | local fallback | Marketplace-managed preview scope | production direct, migration only |
| `APP_ORIGIN` | localhost | вычисляется из `VERCEL_URL` | production origin |
| `AUTH_SECRET` | unique local synthetic | отдельный encrypted secret | отдельный encrypted secret |
| `CRON_SECRET` | отсутствует | отсутствует | encrypted, не менее 32 символов |
| `TIMEWEB_API_TOKEN` | отсутствует | отсутствует | отсутствует на foundation |

Ни один secret не имеет префикс `NEXT_PUBLIC_`. В Neon integration включено
`Create database branch for deployment: Preview` и обязательная готовность
resource до deployment. Git-triggered Preview получает deployment-specific
credentials отдельной copy-on-write Neon branch; общие Marketplace variable
scopes в project inventory не означают, что Preview использует production
connection string.

## Безопасный порядок provisioning

Фактически выполненный порядок provisioning:

1. Создан один Vercel project с Root Directory `platform/`, Node.js `24.x` и
   Functions region `fra1`.
2. Через Vercel Marketplace создан Neon Postgres 17 в Frankfurt; runtime
   использует pooled URL, migrations — direct URL.
3. Подключены Production и Preview scopes, включена branch-per-preview
   настройка и Git integration.
4. Добавлены environment variables по inventory. Не добавлен
   `TIMEWEB_API_TOKEN`.
5. `vercel env ls` проверен только по именам/scopes.
6. До deployment применены четыре versioned migrations под advisory lock.

Migration runner предпочитает `DATABASE_URL_UNPOOLED`, использует PostgreSQL
advisory lock и проверяет checksum уже применённых файлов. Migration не входит
в `build` или автоматический start приложения.

## Preview и production-safe checks

Preview:

1. Проверить, что `VERCEL_ENV=preview`, provider остаётся fake, а
   `TIMEWEB_API_TOKEN` и `CRON_SECRET` отсутствуют.
2. Выполнить login/create/delete fake lifecycle и проверить operation timeline.
3. Убедиться, что Cron route отвечает `404`.
4. Проверить logs на token/password/private key markers.

Production foundation:

1. Проверить fake lifecycle с synthetic course data.
2. Запустить Cron через `vercel crons run /api/cron/reconcile`.
3. Подтвердить `claimed/started/released` без operation ID и raw ошибок.
4. Выпустить новый deployment и убедиться, что текущий Workflow завершился.

## Observability и rollback

Безопасные события:

- `cron.reconcile.completed` с version и агрегированными счётчиками;
- operation timeline с bounded/redacted error;
- Vercel deployment/build status без environment values.

После deployment сохранить ID текущего и предыдущего READY deployment. При
runtime-регрессии:

```bash
vercel rollback <previous-deployment-id-or-url>
vercel rollback status
```

Schema migrations forward-only. Rollback приложения допускается только когда
предыдущая версия совместима с уже применённой schema; иначе сначала нужен
отдельный corrective migration и review. Факт rollback подтверждается
deployment ID, status и redacted runtime log.

## Проверки 2026-07-30

- Git-triggered Preview deployment `dpl_9y24DnJm9gBa9UdAk2WvtD5ZL6Us` собран
  из branch `codex/t0055-preview-isolation` без локальных `.env` в build
  context.
- Vercel integration создала Neon branch
  `preview/codex/t0055-preview-isolation`
  (`br-cold-voice-asc0yh8e`) от `main`.
- Fake create/delete завершились `succeeded`; проверены 5 create steps и
  4 delete steps, после удаления environment имеет status `deleted`. Synthetic
  environment существовала в Preview branch и отсутствовала в production
  `main`, что подтверждает фактическую DB isolation.
- Operation `44016af0-d13b-4915-b68c-6fcab90a573f` с retry
  `timeout_after_create` доступна и terminal после нового deployment.
- Preview Cron route вернул `404`.
- Production deployment `dpl_AGg3p9vKzmjZ6k2o9kXuzR89V7e8` имеет status
  `READY`; ручной Cron invocation вернул `200` и безопасный агрегат
  `claimed: 0, started: 0, released: 0`.
- После чистого deployment `dpl_4fjj1DZkjmAf557Km2ozHDDt984V` выполнен
  rollback на `dpl_AGg3p9vKzmjZ6k2o9kXuzR89V7e8`; rollback status успешен,
  production alias указывает на целевой deployment и отвечает `200`.
- За окно проверки Vercel не показал runtime error/fatal logs; application logs
  не содержали паролей, session tokens или environment values.

Production Timeweb mutation, MFA enrollment и несинтетические пользовательские
данные не включены в foundation.
