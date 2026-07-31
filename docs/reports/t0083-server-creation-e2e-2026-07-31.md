# T-0083 — создание Timeweb VPS, evidence 2026-07-31

- Дата проверки: 2026-07-31
- Scope: текущий `timeweb-provisioning-v3` plain-VPS configurator
- Итог: **PASS**
- Disposable Timeweb mutation: **выполнены и полностью удалены**

## Подтверждённые факты

Live read-only preflight с локальным production-shaped adapter:

- account: `ready`;
- degraded catalog: `false`;
- VPS: `0`;
- floating IPv4: `1` исходный baseline;
- project: `1`;
- SSH keys: `2`;
- Ubuntu: `22.04`, `24.04`, `26.04`;
- floating IPv4: `180 ₽/месяц`;
- balance после пополнения: `1003,53 ₽`;
- текущий provider `monthly_fee`: `181 ₽`.

Нормализованный configurator вернул по пять актуальных Premium NVMe shapes для
Москвы, Амстердама и Франкфурта. Legacy `nsk_base` не входит в catalog. Самый
дешёвый поддержанный Moscow plan:

- 2 vCPU;
- 2 GiB RAM;
- 40 GiB NVMe;
- VPS `800 ₽/месяц`;
- новый IPv4 `180 ₽/месяц`;
- total preview `980 ₽/месяц`.

## Найденный блокирующий дефект

`ProductionTimewebLifecycleAdapter.reservePublicIp()` выполнял повторный live
provider preflight до первой mutation. После `T-0060` этот preflight
безусловно требовал exact owned IPv4, хотя IPv4 ещё не был создан. Любая
production create operation завершалась до `POST /api/v1/floating-ips` с
`PUBLIC_IP_NOT_READY`.

Исправление разделяет два момента:

1. до резервирования IPv4 проверяется live catalog/selection без owned IP;
2. до создания VPS повторный preflight обязательно проверяет уже сохранённый
   exact owned IP и его `unbound` state.

Regression integration test выполняет production-shaped initial preflight на
mocked Timeweb contract, доказывает ровно один IP mutation и наличие exact
active owned resource в durable state.

## Реальный disposable E2E

После owner-authorized пополнения выполнен production-shaped smoke с отдельной
пустой PostgreSQL database:

1. live preflight выбрал минимальный Moscow Premium NVMe plan, Ubuntu 26.04
   x86_64 и отдельный публичный IPv4 — `980 ₽/месяц`;
2. production MFA login и fresh re-auth прошли;
3. create operation создала один IPv4 и один VPS;
4. reconcile дождался provider status `on`, подтвердил exact IPv4 binding и
   применение backup policy;
5. повтор create с тем же idempotency key вернул исходную operation и не
   создал дубль;
6. delete operation удалила VPS и созданный IPv4;
7. live provider catalog вернулся к baseline `0 VPS / 1 исходный IP`.

Durable state после удаления:

- environment: `deleted`;
- active owned resources: `0`;
- server resource: `deleted`;
- public IP resource: `deleted`;
- create: `succeeded`, 5/5 шагов, около 20,4 секунды;
- delete: `succeeded`, 7/7 шагов, около 2,3 секунды.

Временная smoke database
`course_platform_timeweb_smoke_20260731_0834` удалена после фиксации
агрегированного evidence. Provider resource IDs, IP-адрес и credentials в
отчёт и logs не включены.

## Выполненные проверки

- live read-only Timeweb catalog/preflight — PASS;
- disposable create/reconcile/delete и возврат provider baseline — PASS;
- targeted production initial-preflight regression — PASS;
- platform quality — PASS: ESLint, TypeScript, 28 test files / 110 tests,
  Next.js 16.2.12 production build;
- integration suite — PASS: 6 files / 47 tests;
- Workflow suite — PASS: 1 file / 3 tests;
- repository `make quality` — PASS, `QUALITY_FAILURES=0`, artifact
  `test-results/quality/20260731T083411Z-75350`, manifest SHA-256
  `2b3613a590afa9baba3901177a16d916863761b5ab439795b3871cc9089c990d`;
- smoke CLI `--help`/guard contract — PASS.

## Production hotfix

Чтобы не включать параллельные незавершённые UI-изменения, production artifact
собран в отдельном clean worktree от последнего production commit `027007a` с
единственным cherry-pick исправления T-0083.

- artifact commit: `96c429d9b25ac7273f714a6a647fee2b595504bd`;
- Vercel deployment: `dpl_CoPwJKSf8dkZdhimChCnVAV1w2dw`;
- target/status: `production / READY`;
- alias: `https://neurokurs.ru`;
- post-deploy HTTP: `/login` — `200`, unauthenticated infrastructure preview —
  `401` fail-closed;
- post-deploy Vercel error/fatal log scan: `0`.

Первоначальный hotfix сделал доступным исправленный порядок preflight. Полный
fresh-VPS E2E выше теперь отдельно подтверждает production mutation path.
