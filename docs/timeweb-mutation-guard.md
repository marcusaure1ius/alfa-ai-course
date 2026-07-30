# Guarded Timeweb mutation adapter платформы курса

- Проверено: 2026-07-29
- Scope: typed mutation contract, VPS/public IP lifecycle, guards и reconciliation
- Реальный Timeweb token подключается только после Real Mutation Gate

## Зафиксированный provider contract

Контракт сверялся с официальным
[Timeweb Cloud Go SDK](https://github.com/timeweb-cloud/go-sdk/tree/a5150b7fec777ada7ee99fa65434e75a84186e10)
на commit `a5150b7fec777ada7ee99fa65434e75a84186e10`.
Для server adapter разрешены только фиксированные вызовы:

| Операция adapter | HTTP-вызов |
|---|---|
| Создать public IP | `POST /api/v1/floating-ips` |
| Сверить public IP | `GET /api/v1/floating-ips/{floating_ip_id}` |
| Удалить public IP | `DELETE /api/v1/floating-ips/{floating_ip_id}` |
| Создать server | `POST /api/v1/servers` |
| Изменить имя server | `PATCH /api/v1/servers/{server_id}` |
| Удалить server | `DELETE /api/v1/servers/{server_id}` |
| Сверить неизвестный результат | `GET /api/v1/servers/{server_id}` |

Create body строится внутри adapter только из validated provider plan:
`name`, `comment`, `preset_id`, `os_id`, `availability_zone` и
`network.floating_ip`. Public IP создаётся только для выбранной зоны без DDoS
option. Update body содержит только `name`. `server_id` обязан быть
положительным числовым ID из PostgreSQL. У adapter нет метода, который принимает
произвольный URL, HTTP method или raw payload.

Актуальные preset и OS ID сначала читаются через read-only catalog. Их нельзя
фиксировать в коде или принимать как provider proxy payload из браузера.

## Browser и internal command boundary

Browser route создания разрешает только `name`, `idempotencyKey` и локальный
`simulation`. Route удаления разрешает только `confirmationName`,
`idempotencyKey` и `simulation`. Поля `providerResourceId`, `url`, `method` и
`payload` приводят к `400` до создания operation.

Workflow формирует короткую internal command `timeweb-mutation-v1`:

```text
version, operationId, action, resourceKind
```

Лишнее поле или неизвестное значение отклоняется. Environment ID и Timeweb
resource ID отсутствуют в command: guard получает их только через operation и
ownership records в PostgreSQL.

## Guard перед каждым provider mutation

Непосредственно перед create/delete step server повторно проверяет:

1. requester всё ещё active admin с permission `infrastructure:manage`;
2. исходная auth session не отозвана, не истекла и принадлежит requester;
3. `reauthenticated_at` не старше 10 минут;
4. operation имеет ожидаемые kind и `queued/running` state;
5. environment находится ровно в `creating` или `deleting`;
6. нет второй live environment;
7. delete snapshot содержит точное подтверждённое имя среды;
8. resource принадлежит платформе и для kind существует не более одной active
   ownership record.

Delete получает точный provider ID из этой ownership record. Kind-only delete,
поиск ресурса по browser ID и удаление external ownership запрещены.

## Idempotency и неизвестный результат

Operation резервируется по `idempotencyKey`; step использует lease fence.
Если provider успел создать ресурс, но ответ потерян, повторный step сначала
находит active ownership record. Server ищется по точному неприватному marker
`course-platform:<environmentId>`. Public IP восстанавливается только когда
ровно один новый свободный IP появился в ожидаемой зоне относительно
pre-mutation snapshot; при неоднозначности повторное создание запрещено.

Delete exact resource допускает повтор после потерянного ответа: уже удалённая
ownership record считается согласованным состоянием. Повтор terminal operation,
неожиданный environment state, неправильное ownership или два active resource
отклоняются до provider call. Partial cleanup сохраняет оставшийся платный
ресурс active и переводит среду в `cleanup_required`.

## Production kill-switch

Mutation adapter может быть создан только server-side при одновременных
условиях:

```text
VERCEL_ENV=production
PLATFORM_PROVIDER=timeweb
TIMEWEB_API_TOKEN=<encrypted production environment variable>
TIMEWEB_MUTATIONS_ENABLED=true
TIMEWEB_CAPABILITIES_VERIFIED=true
TIMEWEB_SMOKE_BUDGET_RUB=<owner-approved integer>
```

В development, preview и test factory возвращает fake/disabled mode до чтения
token. `TIMEWEB_API_TOKEN` не получает placeholder/value в `.env.example` и не
попадает в browser DTO, PostgreSQL, logs или audit.

Значения kill-switch в репозитории намеренно не включены. Перед production
подключением владелец обязан отдельно:

- проверить service scope и срок token по
  [официальной инструкции Timeweb](https://timeweb.cloud/docs/account-management/token);
- осознанно настроить отдельное permission удаления без Telegram;
- подтвердить budget, один VPS, ownership и cleanup policy;
- выполнить provider test в отдельной задаче с evidence.

Production delete дополнительно требует TOTP и свежую re-auth через пароль +
authenticator code. TOTP secret хранится только как AES-256-GCM ciphertext;
encryption key находится в production-only `AUTH_FACTOR_ENCRYPTION_KEY`.
