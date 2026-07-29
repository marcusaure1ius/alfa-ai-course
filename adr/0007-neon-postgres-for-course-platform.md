# ADR-0007: Neon Postgres для Course Control Plane

- Статус: Accepted
- Дата: 2026-07-29
- Дополняет: ADR-0005 и ADR-0006

## Context

ADR-0005 и ADR-0006 требуют Marketplace PostgreSQL как source of truth, но не
выбирают конкретного провайдера. Foundation должен поддерживать serverless
Vercel runtime, не передавать production credentials в preview/development и
давать разработчику локальную PostgreSQL-среду без создания cloud resources.

## Decision

Course Control Plane использует **Neon Postgres через нативную интеграцию Vercel
Marketplace**.

- Единственный Vercel project имеет Root Directory `platform/`.
- Application runtime получает pooled `DATABASE_URL`, пригодный для serverless
  Functions. Строка подключения остаётся server-only и не имеет префикса
  `NEXT_PUBLIC_`.
- Direct/unpooled connection допускается только для будущих migrations и
  административных задач, если выбранный migration tool этого потребует.
- Перед созданием production Neon resource регион выбирается максимально близко
  к основному Vercel Functions region. Foundation не фиксирует неподтверждённый
  регион и не создаёт ресурс.
- Preview может получить только отдельную Neon preview branch/credential после
  отдельной задачи. Production database credential не копируется в preview или
  development.
- Локальная разработка использует PostgreSQL `17.10-bookworm` из
  `platform/compose.dev.yml`, loopback port и синтетические credentials из
  `platform/.env.example`.
- Timeweb остаётся в fake mode локально и в preview; `TIMEWEB_API_TOKEN` там не
  задаётся.

## Consequences

- Провайдер выбран конкретно, но production Vercel/Neon resource остаётся за
  отдельной deployment/credentials задачей.
- Pooled connection уменьшает риск исчерпания Postgres connections в
  serverless runtime.
- Локальные tests/build не зависят от Neon, Vercel или Timeweb credentials.
- До production provisioning нужно подтвердить Vercel Functions region,
  Neon region, backup/retention policy и preview branching policy.

## Evidence

- [Neon в Vercel Marketplace](https://vercel.com/marketplace/neon)
- [Neon теперь доступен в Vercel Marketplace](https://vercel.com/changelog/neon-now-available-on-vercel-marketplace)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
