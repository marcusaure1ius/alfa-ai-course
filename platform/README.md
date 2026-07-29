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
npm run dev
```

Ожидаемый результат:

- PostgreSQL 17 доступен только на `127.0.0.1:55432`;
- приложение открывается на `http://localhost:3000`;
- `PLATFORM_PROVIDER=fake`, поэтому Timeweb API не вызывается;
- в `.env.local` нет production credentials.

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
build. Те же команды выполняет path-aware GitHub Actions workflow только для
изменений platform или её архитектурных контрактов.

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
