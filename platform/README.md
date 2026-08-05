# Course Control Plane

Изолированный web-продукт внутри multi-product репозитория. Единственный Vercel
project должен использовать **Root Directory `platform/`**. Root starter kit,
его Compose, scripts и workflows не входят в platform build context.

## Пользовательский путь

Платформа рассчитана на один обычный вход по адресу `https://neurokurs.ru`:

1. пользователь вводит email и пароль;
2. платформа определяет роль аккаунта;
3. администратор попадает в `/admin`, где управляет программой, материалами,
   учениками и учебными инструментами;
4. ученик попадает в закрытое пространство `/student` и видит только
   опубликованные материалы доступного ему курса.

Пользователь не выбирает provider mode, не вводит Vercel/cloud credentials и
не видит внутренние deployment gates. Эти параметры принадлежат только
server-side окружению проекта. Второй фактор, если он включён для аккаунта,
запрашивается отдельным шагом только после правильных email и пароля.

Раздел «Инструменты» показывает продуктовые типы и их учебные среды. n8n — первый
тип инструмента; конкретный VPS не становится сущностью верхнего уровня.
Регион, Ubuntu, публичный IPv4, backup и стоимость доступны только в setup и
техническом detail. Setup сначала создаёт чистый VPS. Отдельное действие
«Установить n8n» после fresh re-auth и exact-name confirmation переустанавливает
тот же VPS на Ubuntu 24.04 с exact starter-kit profile, настраивает owned DNS и
проверяет TLS/health. До успешного install интерфейс не выдаёт VPS за готовую
n8n-среду.

Удаление среды окончательное. Платформа не восстанавливает удалённый VPS и не
возобновляет операции его tombstone. Чтобы запустить инструмент снова,
администратор создаёт новую среду; старый audit/tombstone сохраняется только как
история.

## Отдельная установка n8n

`POST /api/admin/infrastructure/environments/:id/install-n8n` запускает durable
`install_environment` operation только для owned active/degraded plain VPS.
Операция разрушительна: системный диск переустанавливается, поэтому UI требует
пароль, при необходимости MFA, точное имя среды и отдельный checkbox потери
данных.

Production adapter:

- повторно проверяет exact VPS, floating IPv4, SSH key и Ubuntu 24.04 в live
  Timeweb catalog;
- резервирует `n8n.neurokurs.ru` и создаёт только owned A record;
- перед destructive mutation записывает durable marker;
- отправляет allowlisted `PATCH` того же server ID с Ubuntu 24.04 и exact
  `starter-kit-v0.1.1` cloud-init; bootstrap выполняется отдельным bounded
  systemd unit, поэтому interruption cloud-final или deployment не превращает
  установку в невозобновляемый one-shot;
- после reimage проверяет OS/status, повторно прикрепляет исходный SSH key и
  подтверждает DNS, 80/443, закрытые 5432/5678, TLS, `/healthz`, editor и
  `ready_owner_setup_required`;
- при retry не повторяет reimage вслепую, а сначала reconciles provider state.

Исходящий SSH из Vercel, browser-supplied cloud-init/provider IDs,
`releases/latest` и автоматическое создание owner запрещены. Подробное решение:
[`ADR-0011`](../adr/0011-control-plane-post-provisioning-install.md).

## Контент и доступ ученика

Миграция `0006_course_content.sql` добавляет минимальную text-first модель:

- `courses` → `course_sections` → `course_materials`;
- состояния `draft/published`, явный порядок, числовая версия и поля
  `created/updated/published by`;
- `course_memberships` для server-side доступа ученика;
- `material_progress` для позиции чтения и отметки завершения.

Это не полноценная LMS: в модели нет видео-хостинга, оценок, сертификатов,
платежей и сложного редактора. Материал хранится как Markdown ограниченного
набора. Raw HTML, исполняемые URL и embedded media отклоняются до записи;
student UI должен разбирать Markdown в React text nodes без
`dangerouslySetInnerHTML`.

Admin API:

- `GET/POST /api/admin/courses`;
- `PATCH /api/admin/courses/:id` — публикация курса;
- `POST /api/admin/courses/:id/sections`;
- `PATCH /api/admin/sections/:id` — публикация раздела;
- `GET/POST /api/admin/courses/:id/materials`;
- `PATCH /api/admin/materials/:id` — редактирование и публикация материала;
- `PUT /api/admin/sections/:id/materials/order` — атомарный полный порядок;
- `PUT /api/admin/students/:id/access` — выдать или отозвать доступ к курсу.
- `PUT /api/admin/tools/n8n/access/:studentId` — выдать или отозвать
  ограниченный по сроку доступ к основной n8n-среде;
- `GET /api/student/tools/n8n` — вернуть только учебное состояние, HTTPS URL и
  срок доступа без provider IDs, IP, тарифа, стоимости и operation logs.

Выдача student URL закрыта по умолчанию. Production должен явно задать
`N8N_STUDENT_ACCESS_LICENSE_MODE=written_permission`, `commercial_agreement`
либо `product_owner_risk_acceptance` и
`N8N_STUDENT_ACCESS_LICENSE_EVIDENCE` со ссылкой или идентификатором
подтверждающего решения. Последний mode фиксирует отдельное принятие риска
владельцем продукта и не означает разрешение n8n. Значения проверяются только
на сервере, а их snapshot сохраняется в `tool_access`; browser их не получает.
Каждое назначение имеет обязательный срок не более 366 дней. Перенос VPS и
billing не обещается.

Ученик входит в n8n **по собственному аккаунту** ([ADR-0016](../adr/0016-direct-n8n-student-accounts.md)).
Платформа показывает адрес инструмента и состояние доступа, но не проксирует
вход: ticket, gateway cookie и `forward_auth` удалены. Отсюда важное следствие —
**отзыв доступа в платформе больше не мгновенный**. Он скрывает адрес и
запрещает новые выдачи, но уже вошедший ученик продолжит работать, пока его
аккаунт не отключат в самом n8n.

Для управляемой среды порядок такой:

1. Установка из Course Platform автоматически включает
   `docker-compose.platform.yml`, создаёт внутренний secret управления из
   `AUTH_SECRET` и сохраняет VPS-конфигурацию с mode `0600`.
2. Admin открывает среду по её адресу и завершает owner setup.
3. Owner один раз создаёт n8n API key со scopes `user:read` и `user:create` и
   сохраняет его только в server environment платформы как
   `N8N_MANAGEMENT_API_KEY`.
4. Admin нажимает «Выдать доступ» в карточке ученика. Платформа сама находит или
   приглашает Member по точному email; ученик задаёт собственный пароль.
   Платформа пароль не хранит и не показывает.
5. При revoke/expiry account и учебные данные не удаляются автоматически.
   Одноразовые данные приглашения удаляются сразу при revoke либо ежедневным
   reconciliation после expiry. Окончательное отключение или удаление account
   выполняется отдельно в n8n после выбора передачи или удаления
   workflow/credentials.

Student API:

- `GET /api/student/courses/:slug`;
- `GET /api/student/materials/:slug`;
- `PUT /api/student/materials/:id/progress`.

Все mutation требуют CSRF token. Student-запросы повторно проверяют в
PostgreSQL активный membership и три уровня публикации: курс, раздел и
материал. Поэтому отзыв доступа и снятие с публикации применяются немедленно,
а не зависят от скрытия ссылок в интерфейсе.

Кабинет ученика построен вокруг чтения, а не метрик:

- `/student` показывает одно текущее действие, карту опубликованных материалов
  и доступные учебные инструменты;
- `/student/program` сохраняет порядок разделов и честный прогресс;
- `/student/materials/:slug` использует ограниченную ширину текста, локальное
  оглавление, предыдущий/следующий материал и явную отметку завершения;
- на mobile курс открывается через отдельную навигацию, а оглавление материала —
  через компактный dialog;
- `/student/tools` не показывает provider ID, IP, стоимость, VPS lifecycle и
  другие детали control plane.

Если доступа, опубликованной программы или материала нет, интерфейс показывает
отдельное объяснение с безопасным следующим действием. Страница помощи не
имитирует отправку сообщения, пока канал связи не подключён.

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

Production deployment Vercel автоматически выполняет этот migration gate перед
`next build`. Preview deployment не меняет shared database schema.

## Первый администратор

После миграций создайте первого администратора один раз. Пароль не передаётся
аргументом команды и не печатается:

```bash
cd platform
printf 'Пароль administrator: '
IFS= read -rs BOOTSTRAP_ADMIN_PASSWORD && printf '\n'
export BOOTSTRAP_ADMIN_PASSWORD
npm run auth:bootstrap-admin -- --email admin@example.test
unset BOOTSTRAP_ADMIN_PASSWORD
```

Ожидаемый результат: пользователь с ролью `admin` создан, а bootstrap
необратимо закрыт в той же транзакции. Повторная команда завершается ошибкой.
Для локального файла окружения используйте `chmod 600 .env.local`.

Если для администратора включён второй фактор, после правильного пароля форма
отдельно попросит шестизначный код. TOTP/WebAuthn challenge не имитируется. Для
существующего администратора TOTP enrollment выполняется одноразовой
CLI-командой с обязательной проверкой первого кода; технический порядок описан в
[`docs/timeweb-lifecycle-smoke.md`](../docs/timeweb-lifecycle-smoke.md).

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

`/admin` перенаправляет в `/admin/tools` — основной рабочий раздел текущей
версии. В навигации остаются только подключённые области: ученики, материалы и
инструменты. Незавершённые обзор, операции, история и настройки не выдаются за
готовые экраны и перенаправляются в основной раздел.

`/admin/students` показывает доступ к курсу и честный прогресс, а detail screen
позволяет открыть или отозвать доступ через существующий protected API.
`/admin/content` сохраняет порядок курса и разделов; material detail даёт
минимальный Markdown-редактор с draft/published состоянием. Создание аккаунтов и
структуры курса не имитируется кнопками, пока соответствующий workflow не
подключён.

На desktop используется
сворачиваемая shadcn Sidebar, на mobile тот же navigation автоматически
переходит в focus-trapped Sheet и закрывается после перехода. Поиск разделов
доступен по `Cmd/Ctrl+K`.

`/admin/tools` всегда открывает один и тот же продуктовый экран без
query-переключателей. Старые `/admin/infrastructure/**` перенаправляются на
пользовательские routes «Инструментов». `/student` использует отдельную оболочку без admin
navigation, provider ID, IP, стоимости и operation data. Запрос ученика к
`/admin/**` останавливается server-side Proxy policy с `403`; скрытие ссылок не
используется как контроль доступа.

## Типографика

Платформа self-hosted использует ту же текстовую пару, что и production-сайт
`https://kurs.alfabank.ru`:

- `Alfa Interface Sans` 400/500/700 — основной интерфейсный и читательский
  шрифт;
- `Styrene A LC Medium` — заголовки внутри материалов и системных компонентов;
- `Styrene A LC Black` — display-заголовки и wordmark.

Пять исходных webfont-файлов сохранены в `public/fonts/`. Их URL взяты из
`https://kurs.alfabank.ru/styles.10f4cf05af2f6cbd.css` и проверены
2026-07-31. Иконочный шрифт `kurs` намеренно не копируется: интерфейс
использует SVG-иконки компонентов. Шрифты не запрашиваются с внешнего CDN во
время работы Neurokurs.

## Границы foundation

- UI: Next.js App Router + TypeScript + Tailwind CSS + shadcn/ui.
- Database: Neon Postgres через Vercel Marketplace; runtime использует pooled
  `DATABASE_URL`. Регион выбирается рядом с основным Vercel Functions region до
  создания ресурса.
- Local database: отдельный PostgreSQL 17 container с синтетическими значениями.
- Provider: `src/server/providers/runtime.ts` содержит общий registry, а
  `src/server/providers/timeweb/` — первый `server-only` adapter с versioned
  typed allowlist. Вне production registry принудительно выбирает fake mode.
- `TIMEWEB_API_TOKEN` не добавляется в `.env.example`, preview или development.
- Для T-0055 созданы Vercel project и Neon Marketplace database; их проверенные
  IDs, scopes и ограничения записаны в runbook. Timeweb VPS, DNS и provider
  credentials в foundation не создаются и не подключаются.

Решение по БД и окружениям зафиксировано в
[`adr/0007-neon-postgres-for-course-platform.md`](../adr/0007-neon-postgres-for-course-platform.md).

## Read-only Timeweb connection

Раздел `/admin/timeweb` запускает только allowlisted read contract:

- account status и баланс;
- список серверов и безопасные status;
- актуальные presets, OS, regions и availability zones.

В development/preview результат всегда приходит из fake adapter. Production
adapter доступен только server-side; raw Timeweb response отбрасывается до
формирования DTO `timeweb-read-v2`. Неизвестный status возвращается как
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
методы с фиксированными Timeweb endpoint. Для production нужны
`PLATFORM_PROVIDER=timeweb` и единственный provider secret
`TIMEWEB_API_TOKEN`. Project и SSH key adapter получает из Public API; ручные
provider IDs и feature gates не настраиваются. В preview/development workflow
использует fake adapter и не совершает реальных provider mutation.

`/api/v1/account/services/cost` возвращает цену только уже активных сервисов.
При нулевом baseline цена нового IPv4 задаётся двумя несекретными production
переменными после ручной сверки с [официальной страницей Timeweb](https://timeweb.cloud/docs/public-ip):
`TIMEWEB_PUBLIC_IPV4_MONTHLY_ROUBLES` и
`TIMEWEB_PUBLIC_IPV4_PRICE_VERIFIED_AT`. Подтверждение действует семь суток;
отсутствующее, некорректное или просроченное значение блокирует paid create.
Если API уже видит активный IPv4, его цена имеет приоритет.

Полный контракт, reconciliation и checklist production-подключения описаны в
[`docs/timeweb-mutation-guard.md`](../docs/timeweb-mutation-guard.md).

## Vercel foundation

`platform/vercel.json` объявляет один production-only Cron
`/api/cron/reconcile`. Route скрыт вне production, требует
`Authorization: Bearer <CRON_SECRET>` и проверяет общий provider runtime. Он
восстанавливает лишь operation без прикреплённого durable Workflow run;
terminal operation и существующий run не перезапускаются.

Root Directory `platform/`, раздельные Neon credentials, контролируемая
migration, preview E2E, observability и rollback описаны в
[`docs/vercel-foundation-runbook.md`](../docs/vercel-foundation-runbook.md).
Runbook отделяет фактическое evidence 2026-07-30 от ещё не проверенных gates.
