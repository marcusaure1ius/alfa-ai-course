# Course Control Plane

Изолированный web-продукт внутри multi-product репозитория. Единственный Vercel
project должен использовать **Root Directory `platform/`**. Root starter kit,
его Compose, scripts и workflows не входят в platform build context.

## Локальный запуск без cloud credentials

Требования: Node.js 24 и Docker Compose. Production Vercel/Neon/Timeweb ресурсы
для локальной разработки не нужны.

```bash
cd platform
cp .env.example .env.local
docker compose -f compose.dev.yml up -d
npm ci
npm run db:migrate
npm run dev
```

Ожидаемый результат:

- PostgreSQL 17 доступен только на `127.0.0.1:55432`;
- приложение открывается на `http://localhost:3000`;
- `PLATFORM_PROVIDER=fake`, поэтому Timeweb API не вызывается;
- в `.env.local` нет production credentials.

Миграции версионируются в `src/server/db/migrations/`. Повторный запуск
`npm run db:migrate` безопасен: применённая миграция пропускается, а изменение
её checksum после применения считается ошибкой.

## Первый администратор

После миграций создайте первого администратора один раз. Пароль не передаётся
аргументом команды и не печатается:

```bash
cd platform
read -s BOOTSTRAP_ADMIN_PASSWORD
export BOOTSTRAP_ADMIN_PASSWORD
npm run auth:bootstrap-admin -- --email admin@example.test
unset BOOTSTRAP_ADMIN_PASSWORD
```

Ожидаемый результат: пользователь с ролью `admin` создан, а bootstrap
необратимо закрыт в той же транзакции. Повторная команда завершается ошибкой.
Для локального файла окружения используйте `chmod 600 .env.local`.

Production admin не сможет завершить password-only вход: gate требует активный
подтверждённый MFA factor и успешно пройденный challenge. TOTP/WebAuthn
enrollment и challenge намеренно не имитируются, поэтому до их реализации
production gate остаётся закрытым.

## Auth и RBAC

- `GET /api/auth/csrf` выдаёт подписанный CSRF token;
- `POST /api/auth/login` создаёт opaque session; в PostgreSQL хранится только
  SHA-256 token hash;
- `POST /api/auth/logout` отзывает текущую session;
- `POST /api/auth/sessions/revoke-all` отзывает все session пользователя;
- `/admin` и `/api/admin/**` проверяют server-side permission
  `admin:access`; ученик получает `403` без данных control plane.

Пароли хешируются Argon2id. Session cookie имеет `HttpOnly`, `SameSite=Lax`,
`Secure` в production и недельный срок. Изменение credentials и destructive
operations должны дополнительно вызывать общий ten-minute fresh re-auth guard.
Login rate limit хранится в PostgreSQL, а auth-события пишутся в append-only
`audit_events` без паролей и session tokens.

Остановить локальную базу:

```bash
docker compose -f compose.dev.yml down
```

Добавьте `--volumes`, только если нужно явно удалить локальные данные.

## Quality gates

```bash
cd platform
npm ci
npm run quality
```

Команда последовательно запускает lint, typecheck, unit tests и production
build. Интеграционные проверки с локальным PostgreSQL:

```bash
npm run test:integration
```

Path-aware GitHub Actions workflow запускает PostgreSQL 17 service, миграции,
unit/integration tests и остальные проверки только для изменений platform или
её архитектурных контрактов.

## Durable operations и fake Timeweb

Create/delete выполняются функциями с директивами `use workflow`, а атомарные
PostgreSQL transitions и provider-действия — отдельными `use step`. HTTP
mutation сразу отвечает `202` и `operationId`; повтор того же
`idempotencyKey` от того же admin возвращает исходную operation.

Fake adapter не обращается в сеть и поддерживает сценарии `success`,
`timeout_after_create`, `insufficient_funds`, `dns_failure`, `tls_failure` и
`partial_cleanup`. Unknown outcome сначала сверяется с ownership records,
поэтому retry не создаёт второй server. Диагностика проходит recursive
redaction и bounded timeline.

```bash
cd platform
npm run test:workflow
```

Команда использует in-process Workflow runtime и локальный PostgreSQL. Она не
создаёт Vercel project, Timeweb VPS, DNS или платные ресурсы.

## Responsive shell

`/admin` открывает первым раздел «Инфраструктура». На desktop используется
сворачиваемая shadcn Sidebar, на mobile тот же navigation автоматически
переходит в focus-trapped Sheet и закрывается после перехода. Поиск разделов
доступен по `Cmd/Ctrl+K`.

Для локальной проверки empty/fake/error состояний без provider API:

```text
/admin/infrastructure
/admin/infrastructure?demo=list
/admin/infrastructure?demo=error
```

Параметр `demo` игнорируется в production. `/student` использует отдельную
оболочку без admin navigation, provider ID, IP, стоимости и operation data.
Запрос ученика к `/admin/**` останавливается server-side Proxy policy с `403`;
скрытие ссылок не используется как контроль доступа.

## Границы foundation

- UI: Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui.
- Database: Neon Postgres через Vercel Marketplace; runtime использует pooled
  `DATABASE_URL`. Регион выбирается рядом с основным Vercel Functions region до
  создания ресурса.
- Local database: отдельный PostgreSQL 17 container с синтетическими значениями.
- Provider: `src/server/providers/timeweb/` импортирует `server-only`, публикует
  versioned typed allowlist и принудительно использует fake mode вне production.
- `TIMEWEB_API_TOKEN` не добавляется в `.env.example`, preview или development.
- Реальные Vercel, Neon и Timeweb ресурсы в рамках foundation не создаются.

Решение по БД и окружениям зафиксировано в
[`adr/0007-neon-postgres-for-course-platform.md`](../adr/0007-neon-postgres-for-course-platform.md).

## Read-only Timeweb connection

Раздел `/admin/timeweb` запускает только allowlisted read contract:

- account status и баланс;
- список серверов и безопасные status;
- актуальные presets, OS, regions и availability zones.

В development/preview результат всегда приходит из fake adapter. Production
adapter доступен только server-side; raw Timeweb response отбрасывается до
формирования DTO `timeweb-read-v1`. Неизвестный status возвращается как
`unsupported/degraded`, а не ломает страницу.

Актуальная schema, точные endpoint и границы token permissions описаны в
[`docs/timeweb-readonly-adapter.md`](../docs/timeweb-readonly-adapter.md).

## Guarded Timeweb mutations

Browser API принимает только параметры операции платформы: имя среды,
`idempotencyKey`, подтверждение и fake-сценарий вне production. Provider URL,
HTTP method, произвольный payload и Timeweb resource ID отклоняются.

Каждый provider-step повторно сверяет в PostgreSQL:

- активную admin session и re-auth не старше 10 минут;
- operation, ожидаемый environment state и лимит одного VPS;
- точное подтверждение удаления;
- ownership и provider resource ID, записанные самой платформой.

Production mutation adapter имеет только typed create/update/delete/reconcile
методы с фиксированными Timeweb endpoint. Он остаётся недоступен, пока отдельно
не включены production provider mode, mutation kill-switch и подтверждение
capabilities. В текущей foundation реализации workflow использует только fake
adapter и не совершает реальных provider mutation.

Полный контракт, reconciliation и checklist production-подключения описаны в
[`docs/timeweb-mutation-guard.md`](../docs/timeweb-mutation-guard.md).
