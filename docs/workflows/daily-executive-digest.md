# Daily Executive Digest

Проверено: 2026-07-14. Workflow: `workflows/business/daily-executive-digest.json`. Версия входного контракта: `1.0`.

Daily Executive Digest формирует короткую сводку за предыдущие 24 часа, заканчивающиеся в 09:00 по Москве, и передаёт её владельцу через общий Telegram sender. Workflow не выдаёт отсутствие данных за нулевую активность: полный источник даёт точные значения, частичный — наблюдаемые значения с предупреждением, отсутствующий — `н/д`.

## Расписание и окно

- timezone workflow: `Europe/Moscow`;
- запуск: ежедневно в 09:00;
- окно: `[предыдущие 09:00, текущие 09:00)` по Москве;
- событие ровно в начале входит в окно, ровно в конце относится к следующему дайджесту;
- стабильный `idempotencyKey` сообщения строится по дате окончания окна.

Если workflow запустить вручную до 09:00 по Москве, он использует последнее уже завершённое окно. Параметр `runAt` существует только для локальных contract tests; штатный schedule использует время исполнения n8n.

## Что нужно импортировать

До Daily Executive Digest импортируйте общие workflow:

1. Generic LLM Gateway — `coreGenericLlmGatewayV1`;
2. Send Telegram Message — `coreSendTelegramMessageV1`;
3. Handle Workflow Error — `coreWorkflowErrorV1`;
4. Log Business Event — `coreBusinessEventLogV1`.

Затем импортируйте `workflows/business/daily-executive-digest.json`. Workflow импортируется неактивным, с `testMode=true`, `draftOnly=true` и отключённым источником.

## Источник business events

`Log Business Event` определяет каноническую схему и возвращает нормализованную запись, но текущая foundation-реализация не сохраняет историю и не предоставляет запрос за интервал. Поэтому сам logger нельзя считать источником метрик. Для production нужен отдельно проверенный source adapter или event store.

Встроенный Schedule Trigger — единственный планировщик production-цепочки. В 09:00 он формирует точный запрос окна и синхронно вызывает sub-workflow, указанный в `profileSourceWorkflowId`. Сам source adapter не должен иметь отдельный schedule: иначе появятся двойные дайджесты. `Called by Test or Source Workflow` сохраняется только для ручной проверки и прямой передачи fixture batch.

Запрос к source adapter:

```json
{
  "ok": true,
  "contractVersion": "1.0",
  "operation": "listBusinessEvents",
  "correlationId": "digest-run-2026-07-14",
  "testMode": true,
  "window": {
    "timezone": "Europe/Moscow",
    "semantics": "[start,end)",
    "start": "2026-07-13T06:00:00.000Z",
    "end": "2026-07-14T06:00:00.000Z"
  }
}
```

Ответ source adapter:

```json
{
  "contractVersion": "1.0",
  "correlationId": "digest-run-2026-07-14",
  "source": {
    "name": "approved-business-event-store",
    "configured": true,
    "complete": true,
    "coverageStart": "2026-07-13T06:00:00.000Z",
    "coverageEnd": "2026-07-14T06:00:00.000Z"
  },
  "events": [
    {
      "eventType": "lead.handler.processed",
      "outcome": "success",
      "correlationId": "lead-run-1042",
      "occurredAt": "2026-07-13T07:15:00.000Z",
      "subjectRef": "opaque-reference",
      "metadata": {
        "workflowKey": "business.lead-handler"
      }
    }
  ]
}
```

Допустимы только поля канонического logger contract:

| Поле | Правило |
|---|---|
| `eventType` | lower-case machine key, например `lead.handler.processed` |
| `outcome` | `success`, `failure`, `denied` или `skipped` |
| `correlationId` | непрозрачный ID, 1–128 безопасных символов |
| `occurredAt` | валидный ISO 8601 timestamp |
| `subjectRef` | допустим на входе, но не передаётся LLM |
| `metadata` | только `workflowKey`, `actionType`, `channel`, `durationMs`, `retryCount`, `errorCode` |

Ответ допускает только `contractVersion`, совпадающий `correlationId`, `source` и массив `events`. Неизвестные поля, ошибка sub-workflow, несовпадающий correlation ID или неверная metadata источника fail-closed направляются в общий error workflow. Adapter может передавать как саму запись, так и logger envelope `{"record": {...}}`. Повтор с одинаковыми `eventType + correlationId + occurredAt` считается один раз.

`complete=true` принимается только если `coverageStart` не позже начала окна, `coverageEnd` не раньше конца окна, JSON разобран и нет невалидных событий. Иначе статус автоматически становится `partial`.

## Метрики

| Метрика | Определение |
|---|---|
| Обработанные лиды | число `eventType = lead.handler.processed` |
| Ошибки | `outcome = failure` или присутствует разрешённый `metadata.errorCode` |
| Необработанные письма | `email.assistant.processed` с неуспешным outcome либо `actionType = unhandled`, `manual_review` или `failed` |
| Ожидают согласования | разрешённый `actionType = pending` или `pending_approval` |
| Прочие события | события окна за вычетом lead и email assistant events |

Служебно считаются также `invalidEvents`, `duplicatesIgnored` и `outsideWindow`. Это показатели качества источника, а не бизнес-результаты.

## Поведение при неполных данных

- `complete`: LLM получает только окно, `sourceStatus` и агрегированные метрики; Telegram содержит точные числа;
- `partial`: LLM не вызывается; Telegram показывает наблюдаемые числа и предупреждение о неполном coverage;
- `missing`: LLM не вызывается; бизнес-метрики равны `null` и показываются как `н/д`, а не как ноль;
- неверный профиль, время или тип `events`: выполнение fail-closed проходит через общий error workflow;
- ошибка LLM или Telegram также проходит через общий error workflow.

Raw events, `subjectRef`, event correlation IDs и metadata не передаются LLM. Модель не имеет tools и обязана вернуть ровно `headline`, `summary`, `attentionRequired`; точные числа в Telegram формирует Code node, а не модель.

## Настройка test mode

1. Импортируйте проверенный source adapter как неактивный вызываемый sub-workflow с Execute Workflow Trigger и контрактом выше.
2. В `Digest Profile and Source Defaults` укажите его ID в `profileSourceWorkflowId`, включите `profileSourceConfigured=true`, затем укажите проверенный `profileModel` и разрешённый `profileOwnerChatId`.
3. Оставьте `profileTestMode=true` и `profileDraftOnly=true`.
4. В общем Telegram workflow добавьте тот же chat ID в allowlist и настройте credential внутри n8n.
5. Запустите Daily Executive Digest вручную через Schedule Trigger или передайте fixture через test trigger с покрытием ровно одного завершённого окна.
6. Убедитесь, что Telegram sender вернул `preview`, а внешний запрос не выполнялся.
7. Проверьте отдельно `partial` и `missing`: в тексте должно быть явное предупреждение.
8. Production delivery разрешайте только после controlled smoke с пользовательскими credentials и evidence.

Не помещайте Telegram token, LLM API key, email, телефон, имя клиента или текст переписки в profile, workflow JSON, fixtures и business events.

## Локальная проверка

```bash
./tests/executive_digest_test.sh
```

Тест исполняет Code nodes прямо из workflow JSON и проверяет 14 fixtures, schedule → source-adapter graph, точный request window, response correlation, coverage semantics, метрики, privacy-minimized LLM prompt, строгий LLM output, общий Telegram contract, error branches и отсутствие секретов. Чистый импорт проверяется отдельно на закреплённой версии n8n. Реальная доставка Telegram, LLM provider и production event store без credentials и controlled smoke не считаются проверенными.
