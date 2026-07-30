# Guarded Timeweb mutation adapter платформы курса

- Проверено: 2026-07-30
- Scope: typed mutation contract, VPS/public IP lifecycle, guards и reconciliation
- Реальный Timeweb token подключается только после Real Mutation Gate

## Зафиксированный provider contract

Контракт сверялся с официальным
[Timeweb Cloud Go SDK](https://github.com/timeweb-cloud/go-sdk/tree/a5150b7fec777ada7ee99fa65434e75a84186e10)
на commit `a5150b7fec777ada7ee99fa65434e75a84186e10`.
Public IP DTO и endpoints дополнительно сверены с официальным
[Python SDK](https://github.com/timeweb-cloud/sdk-python/tree/1927c2e2894cd37f86d3e42c3590bbeb9e77e139)
на commit `1927c2e2894cd37f86d3e42c3590bbeb9e77e139`, а server
`network.floating_ip` — с официальным
[Timeweb Cloud CLI](https://github.com/timeweb-cloud/twc/tree/45315c2a008e5490580d0b5c429059a4a90c74a8)
на commit `45315c2a008e5490580d0b5c429059a4a90c74a8`.
Для server adapter разрешены только фиксированные вызовы:

| Операция adapter | HTTP-вызов |
|---|---|
| Найти IP, атомарно созданный с owned server | `GET /api/v1/floating-ips` |
| Сверить public IP | `GET /api/v1/floating-ips/{floating_ip_id}` |
| Удалить public IP | `DELETE /api/v1/floating-ips/{floating_ip_id}` |
| Создать server | `POST /api/v1/servers` |
| Изменить имя server | `PATCH /api/v1/servers/{server_id}` |
| Удалить server | `DELETE /api/v1/servers/{server_id}` |
| Сверить неизвестный результат | `GET /api/v1/servers/{server_id}` |

Create body строится внутри adapter только из validated provider plan:
`name`, `comment`, `preset_id`, `os_id`, `availability_zone` и
`project_id`, один `ssh_keys_ids`, `is_root_password_required=false` и
`network.floating_ip=create_ip`. IP создаётся атомарно с server, затем
принимается в ownership только по точному `resource_type=server` и
`resource_id` созданного owned server. Отдельный `POST /floating-ips` запрещён:
его неоднозначный timeout нельзя безопасно отличить от чужого concurrent IP.
Update body содержит только `name`. `server_id` обязан быть
положительным числовым ID из PostgreSQL. У adapter нет метода, который принимает
произвольный URL, HTTP method или raw payload.

Актуальные preset и OS ID сначала читаются через read-only catalog. Их нельзя
фиксировать в коде или принимать как provider proxy payload из браузера.

## Browser и internal command boundary

Browser route создания разрешает только `name`, `idempotencyKey` и локальный
`simulation`. Route удаления разрешает только `confirmationName`,
`confirmedLoss=true`, `idempotencyKey` и `simulation`. Поля
`providerResourceId`, `url`, `method` и `payload` приводят к `400` до создания
operation.

Workflow формирует короткую internal command `timeweb-mutation-v1`:

```text
version, operationId, action, resourceKind
```

Лишнее поле или неизвестное значение отклоняется. Environment ID и Timeweb
resource ID отсутствуют в command: guard получает их только через operation и
ownership records в PostgreSQL.

Provider mode также закреплён durable state: create operation с
`providerPlan` и любая operation с active owned Timeweb resource обязаны
продолжаться только через real adapter. Изменение kill-switch/provider между
steps даёт `PROVIDER_MODE_DRIFT`; переход real → fake и fake → real запрещён.

## Guard перед каждым provider mutation

Непосредственно перед create/delete step server повторно проверяет:

1. requester всё ещё active admin с permission `infrastructure:manage`;
2. исходная auth session не отозвана, не истекла и принадлежит requester;
3. `reauthenticated_at` не старше 10 минут;
4. в production session содержит свежий `mfa_authenticated_at`, установленный
   только после успешной проверки TOTP;
5. operation имеет ожидаемые kind и `queued/running` state;
6. environment находится ровно в `creating` или `deleting`;
7. нет второй live environment;
8. delete snapshot содержит точное подтверждённое имя среды;
9. resource принадлежит платформе и для kind существует не более одной active
   ownership record.

Delete получает точный provider ID из этой ownership record. Kind-only delete,
поиск ресурса по browser ID и удаление external ownership запрещены.
Destructive preview перечисляет все active owned resources с kind, provider ID,
state и остаточной месячной стоимостью и явно сообщает, что backup не создаётся.

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

Перед первой production mutation workflow повторяет полный read-only preflight:
balance, hard limit, catalog IDs, project, SSH key и provider price обязаны
совпасть с сохранённым plan. VPS получает `active` только при status `on`;
installing/starting сверяются с интервалом 15 секунд в ограниченном окне.
Unknown/blocked status или исчерпание окна переводит среду в
`cleanup_required`, не оставляя operation в бесконечном `creating`.

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
TIMEWEB_SMOKE_PROJECT_ID=<existing disposable Timeweb project>
TIMEWEB_SMOKE_SSH_KEY_ID=<existing smoke SSH key>
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
- убедиться, что `/api/v1/account/services/cost` возвращает однозначную
  стоимость `floating_ip`; при отсутствии данных mutation запрещена;
- подготовить отдельный disposable project и SSH key; root password отключён;
- выполнить provider test в отдельной задаче с evidence.

Production delete дополнительно требует TOTP и свежую re-auth через пароль +
authenticator code. TOTP secret хранится только как AES-256-GCM ciphertext;
encryption key находится в production-only `AUTH_FACTOR_ENCRYPTION_KEY`.
