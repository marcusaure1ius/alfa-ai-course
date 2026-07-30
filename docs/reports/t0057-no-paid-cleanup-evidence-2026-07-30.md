# T-0057 — redacted Timeweb `no_paid` / cleanup evidence

- Дата: 2026-07-30
- Scope: owner-authorized production-shaped disposable smoke
- Token, IP address, provider response bodies и credentials: не сохранены

## Итог

После удаления client-side budget/balance gate выполнены три provider mutation
attempts. Во всех случаях Timeweb сохранил terminal `server.status=no_paid`.
Каждая попытка завершилась automatic guarded cleanup.

Ни одна попытка не считается успешным fresh-VPS E2E: n8n, PostgreSQL, Caddy,
DNS/TLS/ports и reboot persistence не достигли ready state.

## Durable evidence последней попытки

Последняя попытка временно проверяла documented custom configuration и
безопасный reuse единственного baseline IP. Этот экспериментальный путь был
после проверки удалён и не входит в commit `c40a641`; evidence используется
только для подтверждения provider rejection и cleanup.

Create operation:

- operation ID: `a28905ff-4855-4dda-953e-cd1eab100d8c`;
- status: `failed`;
- code: `SERVER_BILLING_BLOCKED`;
- started: `2026-07-30T12:26:26.476199Z`;
- finished: `2026-07-30T12:27:01.757205Z`.

Create timeline:

| Step | Status | Attempts | Result |
| --- | --- | ---: | --- |
| `reserve_public_ip` | succeeded | 1 | exact baseline IP lease recorded |
| `configure_dns` | succeeded | 1 | owned A record recorded |
| `create_server` | succeeded | 1 | owned server recorded |
| `provider_installing` | failed | 3 | `SERVER_BILLING_BLOCKED` |

Cleanup operation:

- operation ID: `3ad0458b-712f-463b-8823-41c0a9344421`;
- status: `succeeded`;
- started: `2026-07-30T12:27:01.907804Z`;
- finished: `2026-07-30T12:27:03.363211Z`;
- ambiguity resolvers: public IP, server и DNS — succeeded;
- delete DNS/server и возврат baseline IP в unbound — succeeded;
- final environment status: `deleted`.

Provider resource identities сохранены только как MD5 redaction fingerprints:

| Kind | Ownership | Final lifecycle | Provider ID fingerprint |
| --- | --- | --- | --- |
| `public_ip` temporary lease | platform | deleted | `0deda2d8a3ba679f85a473766b25df58` |
| `dns_record` | platform | deleted | `b4c77bf27e0d4cb85090fa2565f9c6d1` |
| `server` | platform | deleted | `7a30a520b476af90be2c5b7513486f3a` |

## Независимая финальная read-only проверка

После cleanup:

- account: `ready`;
- VPS: `0`;
- floating IP: `1` исходный unbound baseline;
- `n8n.neurokurs.ru`: отсутствует.

Таким образом, failure/cleanup path и возврат provider baseline доказаны.
Acceptance успешной готовой n8n-среды остаётся непройденным.
