# CRM: credentials, contracts и Bitrix24 adapter

Проверено: 2026-07-14. Версия контрактов: `1.0`.

В MVP есть два provider-neutral HTTP workflow и один подтверждённый example adapter для Bitrix24:

- `workflows/core/crm-generic-lead-upsert.json`;
- `workflows/core/crm-generic-task-create.json`;
- `workflows/adapters/crm-bitrix24.json`.

Все они импортируются inactive, работают в `testMode: true` по умолчанию и не содержат credentials. Реальные CRM-вызовы требуют явного `testMode: false` и credential, настроенного внутри n8n.

## Общий контракт данных

Обязательные envelope-поля:

| Поле | Правило |
|---|---|
| `contractVersion` | Необязательно; если передано, только `1.0` |
| `testMode` | По умолчанию `true`; HTTP mutation полностью обходится |
| `correlationId` | Непрозрачный trace ID; при отсутствии создаётся UUID |
| `idempotencyKey` | Стабильный ключ логического lead/task, 8–128 безопасных символов |
| `provenance` | Для каждого изменяемого поля: `user`, `system`, `crm` или `import` |

Значение с provenance `llm` не принимается. Если LLM подготовил черновик, человек или детерминированная система должны проверить его и только затем передать подтверждённые поля с корректным источником.

### Отсутствующее, пустое и очищаемое поле

- Поля, которого нет в JSON, workflow не отправляет и не изменяет.
- Пустая строка запрещена: она не считается отсутствующим значением.
- Generic lead adapter очищает только явно перечисленные `clearFields`; в outgoing `fields` они становятся `null`.
- Bitrix24 example adapter не выполняет generic clear для contact multi-fields: такая операция требует чтения существующих `fm` IDs и отдельного контракта. Он завершится с ошибкой, а не проигнорирует очистку.
- Неизвестное поле отклоняется как `INVENTED_FIELD` или `UNSUPPORTED_FIELD`; silent mapping запрещён.

## Generic HTTP adapter

Base URL задаётся в Set node соответствующего workflow, а не caller input. Используйте только HTTPS и OAuth2 credential.

Ожидаемый API:

| Операция | HTTP contract |
|---|---|
| Поиск duplicate lead | `POST /leads/search`, body `{ "match": { "field", "value" }, "limit": 2 }` |
| Создание lead | `POST /leads`, body `{ "fields", "idempotencyKey" }` |
| Обновление lead | `PATCH /leads/{id}`, body `{ "fields", "idempotencyKey" }` |
| Создание task | `POST /tasks`, body `{ "fields", "idempotencyKey" }` |

Поиск выполняется по `externalId`, затем email, затем phone. Ноль совпадений создаёт lead, одно обновляет его, больше одного возвращает `DUPLICATE_AMBIGUOUS` и не вызывает mutation. API обязан атомарно применять `idempotencyKey`; HTTP `409` нормализуется как `IDEMPOTENCY_CONFLICT`.

## Bitrix24: почему выбран этот API path

Официальная документация Bitrix24 теперь помечает `crm.lead.list` deprecated и предлагает универсальный `crm.item.list`. Поэтому adapter использует только актуальные универсальные CRM methods:

- [`crm.item.list`](https://apidocs.bitrix24.com/api-reference/crm/universal/crm-item-list.html) для lookup;
- [`crm.item.add`](https://apidocs.bitrix24.com/api-reference/crm/universal/crm-item-add.html) для create;
- [`crm.item.update`](https://apidocs.bitrix24.com/api-reference/crm/universal/crm-item-update.html) для update;
- [`tasks.task.add`](https://apidocs.bitrix24.com/api-reference/tasks/tasks-task-add.html) для task;
- [`OAuth 2.0 protocol`](https://apidocs.bitrix24.com/settings/oauth/index.html) для получения и обновления tokens.

Универсальный API задаёт Lead как `entityTypeId: 1`. `crm.item.add/update` выполняют permission, required-field и field-value checks; update должен получать только реально изменяемые поля. `tasks.task.add` требует `TITLE` и `RESPONSIBLE_ID`, а CRM binding передаётся как `UF_CRM_TASK: ["L_<id>"]`.

REST API Bitrix24 доступен только на подходящем платном тарифе; проверьте это по [официальному access guide](https://apidocs.bitrix24.com/first-steps/access-to-rest-api.html).

## Безопасный upsert Bitrix24

Adapter не ищет «похожих людей» по имени и не перезаписывает существующий lead по одному совпавшему email/phone. Для каждой созданной им записи используются:

```json
{
  "originatorId": "n8n-starter-kit",
  "originId": "<idempotencyKey>"
}
```

Перед mutation выполняется `crm.item.list` по этой паре:

- 0 записей → `crm.item.add`;
- 1 запись → `crm.item.update` только этой записи;
- 2 и более → `DUPLICATE_AMBIGUOUS`, mutation не выполняется.

Повтор одной логической операции обязан использовать тот же `idempotencyKey`. Новый ключ означает новый lead.

## Mapping table Bitrix24

### Lead

| Normalized field | Bitrix24 field | Примечание |
|---|---|---|
| `title` | `title` | Для example adapter обязательно; default title не изобретается |
| `name` | `name` | Только подтверждённое значение |
| `lastName` | `lastName` | Только подтверждённое значение |
| `company` | `companyTitle` | Не создаёт отдельную Company |
| `source` | `sourceId` | Должен существовать на portal |
| `notes` | `comments` | До 4000 символов |
| `assignedTo` | `assignedById` | Числовой Bitrix24 user ID |
| `phone` | `fm.n*.PHONE/WORK` | Новый multi-field value |
| `email` | `fm.n*.EMAIL/WORK` | Новый multi-field value |
| `idempotencyKey` | `originId` | Вместе с constant `originatorId` |

Custom fields намеренно не поддерживаются: сначала вызовите [`crm.item.fields`](https://apidocs.bitrix24.com/api-reference/crm/universal/crm-item-fields.html), зафиксируйте mapping в отдельной версии контракта и добавьте fixtures.

### Task

| Normalized field | Bitrix24 field |
|---|---|
| `title` | `TITLE` |
| `description` | `DESCRIPTION` |
| `responsibleRef` | `RESPONSIBLE_ID` — числовой user ID |
| `dueAt` | `DEADLINE` — ISO 8601 |
| `relatedLeadRef` | `UF_CRM_TASK: ["L_<id>"]` |
| `idempotencyKey` | `XML_ID: "n8n-starter-kit:<key>"` |

Generic `priority` example adapter не принимает, пока его mapping не подтверждён отдельным contract test.

`tasks.task.add` не документирует атомарную idempotency guarantee. Поэтому adapter записывает traceable `XML_ID`, не делает автоматических retry и при transport/5xx/неоднозначном rate-limit ответе возвращает `AMBIGUOUS_TASK_STATE`. Перед новой попыткой найдите task по marker доступным portal способом или вручную и повторяйте create только после подтверждения отсутствия записи. Успешный response с task ID считается завершённым.

## Настройка OAuth2 credential в n8n

1. В Bitrix24 создайте local application с API-only flow и scopes `crm` и `task`; административный доступ обязателен.
2. Используйте portal authorization URL `https://<portal>/oauth/authorize/` и token URL `https://oauth.bitrix.info/oauth/token/`.
3. В n8n создайте OAuth2 API credential. Client ID, client secret, access token и refresh token хранятся только там.
4. В `Adapter - Bitrix24 CRM (OAuth2)` замените placeholder credential и установите portal base URL вида `https://<portal>/rest` в Set node.
5. Оставьте `testMode: true`, импортируйте workflow и проверьте preview.
6. Отдельно выполните credential smoke на тестовом portal. Только после успешного read/add/update/task rehearsal разрешайте `testMode: false`.

OAuth authorization code действует 30 секунд, а access token имеет ограниченный срок; refresh token нужно обновлять при каждой ротации пары. Не копируйте token в workflow JSON, input, fixture или log. Incoming webhook содержит secret прямо в URL и не используется в экспортируемом adapter.

## Пример preview lead

```json
{
  "operation": "lead.upsert",
  "idempotencyKey": "lead-form-1042",
  "fields": {
    "title": "Заявка с сайта",
    "name": "Подтверждённое имя"
  },
  "provenance": {
    "title": "system",
    "name": "user"
  }
}
```

Без `testMode: false` результат содержит `mutated: false` и HTTP node не выполняется.

## Ошибки и диагностика

| Code | Действие |
|---|---|
| `AUTH_FAILED` | Проверить scopes, portal user permissions и OAuth refresh |
| `DUPLICATE_AMBIGUOUS` | Устранить несколько записей с одной origin-парой; автоматически не выбирать |
| `IDEMPOTENCY_CONFLICT` | Не менять key на retry; проверить payload первоначальной операции |
| `CRM_VALIDATION_FAILED` | Сверить required/custom fields portal и mapping |
| `RATE_LIMITED` | Для lead повторить с bounded backoff и тем же key |
| `CRM_UNAVAILABLE` | Для lead повторить позже с тем же key |
| `AMBIGUOUS_TASK_STATE` | Не retry автоматически; reconcile task по `XML_ID` |

Raw response, `error_description`, Authorization header и webhook URL не возвращаются из workflows.

## Проверка репозитория

```bash
./tests/crm_workflows_test.sh
```

Тест исполняет Code nodes прямо из workflow JSON на contract fixtures. Реальный Bitrix24 smoke не заявляется без user-provided portal и credential.
