# T-0083 — создание Timeweb VPS, evidence 2026-07-31

- Дата проверки: 2026-07-31
- Scope: текущий `timeweb-provisioning-v3` plain-VPS configurator
- Итог на момент отчёта: **PARTIAL / provider funding blocker**
- Новые Timeweb mutation: **не выполнялись**

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
- balance: `503,78 ₽`;
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

## Почему реальная mutation не запускалась

Предыдущие owner-authorized попытки 2026-07-30 уже доказали, что Timeweb
завершает создание как `no_paid`, когда account не покрывает актуальную
стоимость. Текущий минимальный поддержанный plan `980 ₽/месяц` больше live
balance `503,78 ₽`; кроме того, account уже показывает `monthly_fee 181 ₽`.

Запуск ещё одной заведомо неуспешной попытки мог создать тарифицируемый IPv4,
снова задействовать daily IP limit и потребовать cleanup, но не мог дать
fresh-VPS PASS. Поэтому новые платные mutation не выполнялись. Это внешнее
ограничение account, а не успешное E2E evidence.

## Выполненные проверки

- live read-only Timeweb catalog/preflight — PASS;
- targeted production initial-preflight regression — PASS;
- platform quality — PASS: ESLint, TypeScript, 26 test files / 105 tests,
  Next.js 16.2.12 production build;
- integration suite — PASS: 6 files / 47 tests;
- Workflow suite — PASS: 1 file / 3 tests;
- repository `make quality` — PASS, `QUALITY_FAILURES=0`, artifact
  `test-results/quality/20260731T075904Z-23596`, manifest SHA-256
  `c4258b8f53f5a741b325613f63918490625b549e338cc9df979a98b9c7ed606d`;
- smoke CLI `--help`/guard contract — PASS.

## Условие продолжения

Для полного E2E нужен balance, достаточный для решения Timeweb по самому
дешёвому поддержанному plan, и сброшенный daily public-IP limit. После этого
запускается:

```bash
cd platform
npm run smoke:timeweb-plain-vps -- --confirm-disposable-smoke
```

PASS требует реальный status `on`, exact IPv4 binding, применённую backup
policy, idempotency replay, successful delete и возврат live provider catalog к
baseline `0 VPS / 1 исходный IP`.
