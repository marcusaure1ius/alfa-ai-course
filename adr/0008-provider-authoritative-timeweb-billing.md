# ADR-0008: Provider-authoritative billing для Timeweb mutations

- Статус: Accepted
- Дата: 2026-07-30
- Supersedes: ADR-0005 и ADR-0006 только в части client-side budget cap и budget gate

## Context

Первоначальные требования Course Control Plane вводили отдельный
`TIMEWEB_SMOKE_BUDGET_RUB`, warning/critical monthly budget и проверку
достаточности balance до provider mutation. Во время реального T-0057 smoke
выяснилось, что расчётный клиентский порог не отражает окончательное решение
Timeweb: provider самостоятельно принимает или отклоняет создание и возвращает
terminal `server.status=no_paid`.

Владелец оплачивает тестовый account, подтвердил production-shaped disposable
smoke и 2026-07-30 явно решил не использовать денежные лимиты платформы.

## Decision

Course Control Plane не применяет client-side monetary cap к Timeweb mutations.

- `TIMEWEB_SMOKE_BUDGET_RUB` не является runtime gate и не требуется.
- Provider price, account balance, `monthly_fee` и расчётная стоимость
  отображаются только как telemetry/preview.
- Недостаточный по клиентскому расчёту balance не блокирует provider request.
- Timeweb остаётся единственным источником решения о допустимости списания.
- Provider `no_paid` и `permanent_blocked` остаются terminal failure states:
  среда не активируется, запускается ownership-guarded cleanup.

Решение не отменяет остальные ограничения:

- hard limit одного active/creating/degraded VPS;
- production-only token и server-only typed adapter;
- exact project, SSH key, Ubuntu, region/zone и DNS ownership checks;
- MFA/re-auth, idempotency, durable operation log и обязательный cleanup;
- запрет удаления ресурсов без доказанного platform ownership.

## Accepted trade-off

Если Timeweb изменит цены или account получит больший balance, платформа может
разрешить самый дешёвый совместимый live plan без отдельного owner spending cap.
Владелец осознанно принимает этот риск. UI и audit обязаны показывать актуальную
provider price, но не представлять её как блокирующий лимит.

## Consequences

- Preview больше не возвращает `BUDGET_NOT_CONFIGURED`, `BUDGET_EXCEEDED` или
  клиентский `INSUFFICIENT_FUNDS`.
- Ошибка `no_paid`, полученная от Timeweb после mutation, остаётся видимой и
  проверяет failure/cleanup path, но не доказывает успешный fresh-VPS E2E.
- Реальный E2E по-прежнему не считается пройденным без готовых
  n8n/PostgreSQL/Caddy, DNS/TLS/ports checks, reboot persistence и cleanup.

## Evidence

- [Требования платформы](../docs/course-platform-requirements.md)
- [Timeweb n8n/DNS/TLS smoke](../docs/timeweb-n8n-lifecycle-smoke.md)
- [ADR-0005](0005-course-platform-control-plane.md)
- [ADR-0006](0006-single-vercel-project-for-course-platform.md)
