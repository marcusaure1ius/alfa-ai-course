# Vercel foundation платформы курса

- Подготовлено: 2026-07-30
- Deployable root: `platform/`
- Provider mode foundation: только `fake`
- Production/preview deployment и Neon resource этим документом не подтверждены

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

Значения ниже создаются только после явного разрешения владельца. Secret values
не копируются в evidence или логи.

| Key | Development | Preview | Production |
|---|---|---|---|
| `VERCEL_ENV` | system/development | system/preview | system/production |
| `PLATFORM_PROVIDER` | `fake` | `fake` | `fake` |
| `DATABASE_URL` | local pooled-equivalent | отдельная preview branch | production pooled |
| `DATABASE_URL_UNPOOLED` | local fallback | отдельная preview direct | production direct, migration only |
| `APP_ORIGIN` | localhost | preview-specific origin | production origin |
| `AUTH_SECRET` | unique local synthetic | отдельный encrypted secret | отдельный encrypted secret |
| `CRON_SECRET` | отсутствует | отсутствует | encrypted, не менее 32 символов |
| `TIMEWEB_API_TOKEN` | отсутствует | отсутствует | отсутствует на foundation |

Ни один secret не имеет префикс `NEXT_PUBLIC_`. Production database credential
не выдаётся preview. Preview использует отдельную Neon branch/credential.

## Безопасный порядок provisioning

Команды ниже — runbook, а не evidence выполненного provisioning.

1. В Vercel создать один project и установить Root Directory `platform/`.
2. Выбрать Functions region, затем создать Neon через Vercel Marketplace в
   максимально близком доступном регионе.
3. Подключить production pooled/direct credentials. Для preview создать
   отдельную Neon branch и отдельные credentials.
4. Добавить environment variables по inventory. Не добавлять
   `TIMEWEB_API_TOKEN`.
5. Из `platform/` выполнить `vercel env ls` и сверить только имена/scopes.
6. До deployment применить migrations direct connection:

```bash
cd platform
vercel env run -e production -- npm run db:migrate
```

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

## Непройденные внешние gates

До завершения T-0055 нужны реальные evidence:

- project ID/settings с Root Directory `platform/`;
- Neon integration, регионы и разделённые credential scopes;
- применённые production migrations;
- preview/production-safe fake E2E;
- Cron после production deployment;
- Workflow через новый deployment;
- logs/redaction и успешный rollback.

Без этих evidence нельзя заявлять, что Vercel foundation развёрнут.
