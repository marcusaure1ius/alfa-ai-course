# Lead Handler: webhook → approval → CRM → Telegram

Проверено: 2026-07-14. Workflow: `workflows/business/lead-handler.json`. Версия входного контракта: `1.0`.

Lead Handler принимает заявку через закрытый webhook, нормализует контакт, консервативно извлекает бизнес-факты через LLM Gateway и запрашивает решение владельца. До точного непросроченного approval CRM не изменяется. После approval workflow безопасно вызывает общие CRM lead/task adapters и отправляет владельцу итог через общий Telegram sender.

## Безопасные defaults

- workflow импортируется неактивным;
- Webhook node использует `Header Auth`, секрет хранится только в credential n8n;
- `profileTestMode: true` и `profileDraftOnly: true` включены по умолчанию;
- один и тот же production `eventId` повторно не обрабатывается;
- LLM не получает имя, email и телефон отдельными полями и не может разрешить mutation;
- неизвестные поля входа и LLM-ответа отклоняются;
- отсутствующий бизнес-факт остаётся `null`;
- задача CRM создаётся только после успешного lead upsert;
- неясный результат task create не повторяется автоматически.

## Настройка

1. Импортируйте общие workflow из зависимостей: LLM Gateway, Request Human Approval, CRM Lead Upsert, CRM Task Create, Send Telegram Message, Handle Workflow Error и Log Business Event.
2. Импортируйте `workflows/business/lead-handler.json`.
3. В `Authenticated Lead Webhook` создайте новый Header Auth credential. Используйте случайное значение не короче 32 байт. Не помещайте его в JSON, Git, query string или логи.
4. В `Lead Handler Profile` замените:
   - `profileOwnerRef` — стабильный непрозрачный ID владельца;
   - `profileOwnerChatId` — разрешённый Telegram chat ID владельца;
   - `profileResponsibleRef` — ID ответственного в CRM;
   - `profileModel` — проверенный model ID LLM Gateway.
5. Оставьте `profileTestMode=true` и `profileDraftOnly=true` для первой проверки.
6. Настройте credentials и profile внутри общих CRM/Telegram/LLM workflow по соответствующим руководствам.
7. Активируйте workflow только после import/test-mode проверки.

Ожидаемый результат первого запроса: `status: pending_approval`, `mutated: false` и `approvalKey`. HTTP mutation CRM в test mode не выполняется.

## Intake webhook schema

Метод: `POST`. Content-Type: `application/json`. Header Auth проверяет n8n до запуска workflow.

```json
{
  "phase": "intake",
  "eventId": "site-form-event-1042",
  "idempotencyKey": "site-form-lead-1042",
  "lead": {
    "name": "Анна",
    "lastName": "Иванова",
    "company": "Пример",
    "email": "anna@example.org",
    "phone": "+7 999 123-45-67",
    "message": "Нужна CRM для отдела продаж",
    "source": "site-form",
    "taskDueAt": "2026-07-15T09:00:00+03:00"
  }
}
```

Обязательные поля:

| Поле | Правило |
|---|---|
| `eventId` | Стабильный ID доставки, 8–128 безопасных символов; повтор блокируется в production |
| `idempotencyKey` | Стабильный ID логической заявки, 8–100 безопасных символов; не меняйте при retry |
| `lead` | Объект только с перечисленными ниже полями |
| `lead.email` или `lead.phone` | Нужен хотя бы один контакт |

Допустимые поля `lead`:

| Поле | Нормализация и ограничение |
|---|---|
| `name`, `lastName` | Trim, 1–100 символов |
| `company` | Trim, 1–200 символов |
| `email` | Lowercase, валидный адрес, максимум задаётся CRM contract |
| `phone` | Только цифры; российский префикс `8` переводится в `+7`; результат E.164, 8–15 цифр |
| `message` | Trim, 1–4000 символов; считается недоверенным текстом |
| `source` | Trim, 1–100 символов; default `webhook` |
| `taskDueAt` | Валидная ISO 8601 дата/время |

Не передавайте `approved`, CRM IDs, произвольные custom fields или credentials. Неизвестное поле завершает запрос ошибкой.

## Что извлекает LLM

Строгий JSON содержит только:

```json
{
  "need": "Автоматизировать продажи",
  "product": "CRM",
  "priority": "high",
  "nextStep": "Позвонить и уточнить число пользователей"
}
```

Каждое значение, кроме `priority`, — строка или `null`. `priority`: `low`, `medium`, `high` или `null`. LLM получает только bounded `lead.message`, обёрнутый как untrusted content; tools отключены. Модель обязана вернуть `null`, если факт не сказан явно.

Извлечение остаётся черновиком. Только approval владельца переводит его в подтверждённые CRM notes/task fields с provenance `user`.

## Approval и resolve

Intake создаёт pending approval на 3600 секунд и сообщает `approvalKey` владельцу через Telegram. Для решения отправьте новый аутентифицированный POST:

```json
{
  "phase": "resolve",
  "approvalKey": "lead-approval-site-form-lead-1042",
  "decision": {
    "state": "approved",
    "approverRef": "owner-001"
  }
}
```

Для отказа используйте `state: denied`. Workflow проверяет одновременно approval key, owner ref, сохранённую заявку и срок действия. При отказе или expiry возвращается `mutated: false`; CRM и внешнее сообщение о завершении не вызываются.

## CRM mapping

Lead Handler передаёт данные в provider-neutral CRM contracts. Фактический provider mapping задаётся CRM adapter.

### Lead

| Intake/extraction | Generic lead field | Provenance после approval |
|---|---|---|
| `idempotencyKey` | `externalId = webhook:<key>` | system marker, не mutable provenance |
| `product` | `title = Заявка: <product>` | `system`, если product отсутствует — `Новая заявка` |
| `name`, `lastName`, `company`, `email`, `phone` | одноимённые поля | `user` |
| `source` | `source` | `system` |
| `need`, `product`, `priority`, `nextStep` | bounded `notes` | `user`, потому что подтверждено approval |

Generic CRM adapter сначала выполняет duplicate lookup по `externalId`, затем создаёт или обновляет ровно одну запись. Несколько совпадений дают `DUPLICATE_AMBIGUOUS` без mutation.

### Task

| Источник | Generic task field |
|---|---|
| `nextStep`, затем `need`, затем default | `title` |
| `need` | `description` |
| `profileResponsibleRef` | `responsibleRef` |
| CRM lead ID | `relatedLeadRef`; в test preview используется `externalId` |
| `taskDueAt` | `dueAt` |

## Idempotency и ошибки

- `eventId` защищает от повторной webhook-доставки до вызова LLM.
- `idempotencyKey` остаётся одинаковым для approval, lead и task с разными стабильными префиксами.
- Если lead upsert неуспешен, task не создаётся, ошибка проходит через общий error workflow.
- Если lead уже успешно изменён, а task create не подтверждён, результат имеет `status: partial_failure`, `reconciliationRequired: true` и `retryable: false`. Сначала найдите lead/task по idempotency markers в CRM; не отправляйте новый ключ автоматически.
- Raw provider response, Authorization header и contact values не попадают в business event log. Event содержит только correlation ID, status и partial-failure flag.

## Локальная проверка

```bash
./tests/lead_handler_test.sh
```

Тест исполняет Code nodes прямо из workflow JSON, проверяет 21 fixture, shared contracts, replay, approval binding, test-mode CRM preview, partial failure и отсутствие credentials. Чистый импорт проверяется отдельно pinned n8n image. Реальный webhook, CRM, Telegram или LLM provider не считается проверенным без пользовательских credentials и отдельного smoke evidence.
