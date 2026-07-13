# Контракты core workflows

Проверено: 2026-07-14. Версия контрактов: `1.0`.

Документ описывает четыре transport-neutral sub-workflow. Бизнес-workflow вызывают их через Execute Sub-workflow и не копируют validation, approval, data minimization или error normalization.

## Общие правила

- Все workflow неактивны после импорта и содержат Sticky Note с безопасной настройкой.
- `contractVersion` по умолчанию и единственная поддерживаемая версия — `1.0`.
- `testMode` по умолчанию равен `true`.
- `correlationId` принимается только как непрозрачный идентификатор из символов `A-Z a-z 0-9 . _ : -`; если его нет, создаётся UUID.
- Не передавайте raw provider payload, credentials, токены, stack trace, email, телефон или имя как идентификатор.
- Ошибка контракта возвращает структурированный `ok: false`; она не разрешает бизнес-действие.
- Успешное выполнение Code node не означает, что внешнее действие произошло. Transport и approved persistence остаются у вызывающего workflow.

## Request Human Approval

Файл: `workflows/core/request-human-approval.json`.

Контракт состоит из двух вызовов с одним `idempotencyKey`:

1. `phase: request` валидирует действие и возвращает `status: pending`, `allowAction: false`, время запроса и expiry.
2. Бизнес-workflow отправляет запрос через отдельный transport и позже вызывает `phase: resolve`.
3. Только точное решение `decision.state: approved`, непросроченный `expiresAt` и безопасный `approverRef` возвращают `allowAction: true`.

Timeout, `denied`, пустое или неизвестное решение, malformed input и неподдерживаемая версия остаются fail-closed. Рекомендуемый timeout — 3600 секунд; разрешён диапазон 60–86400 секунд.

Пример запроса:

```json
{
  "phase": "request",
  "idempotencyKey": "lead-1042-email-v1",
  "correlationId": "corr-1042",
  "action": {
    "type": "email.send",
    "summary": "Отправить согласованный ответ клиенту",
    "risk": "high"
  }
}
```

До получения результата с `allowAction: true` вызывающий workflow ничего не отправляет и не изменяет.

## Normalize Incoming Message

Файл: `workflows/core/normalize-incoming-message.json`.

Provider adapter заранее преобразует вход в поля `channel`, `messageId`, `senderRef`, `text`, `receivedAt`, `attachments` и минимальный `metadata`. `senderRef` и `fileRef` должны быть непрозрачными псевдонимами, а не email, телефоном, username или путём к файлу.

Разрешённые metadata: `language`, `threadRef`, `replyToMessageId`, `sourceType`. Raw update и неизвестные поля отклоняются. Результат содержит стабильный `messageKey` вида `<channel>:<messageId>` для дедупликации.

## Log Business Event

Файл: `workflows/core/log-business-event.json`.

Минимальная запись содержит:

- `eventType` — стабильный taxonomy key;
- `outcome` — `success`, `failure`, `denied` или `skipped`;
- `correlationId`, `occurredAt` и необязательный непрозрачный `subjectRef`;
- metadata только из allowlist: `workflowKey`, `actionType`, `channel`, `durationMs`, `retryCount`, `errorCode`.

При default `testMode: true` результат имеет `disposition: preview`, `logged: false` и ничего не пишет в runtime log. При явном `testMode: false` workflow пишет одну минимальную JSON-строку `businessEvent` в runtime log и возвращает `disposition: emit`; вызывающий workflow при необходимости направляет запись в отдельно одобренный sink. Success execution data по умолчанию не сохраняется, а runtime logs подчиняются операционной retention policy. Произвольные metadata, message text, имя, email, телефон, credentials и raw payload не принимаются.

## Handle Workflow Error

Файл: `workflows/core/handle-workflow-error.json`.

Вызывающий error route передаёт `workflowKey`, исходный `correlationId` и минимальный объект `error`: `code`, `message`, `retryable`, `httpStatus`. Stack trace и execution payload не передаются.

Первый вызов возвращает нормализованную ошибку, `recursionDepth: 1` и marker `core-error-handler-v1`. Повторный вызов с `recursionDepth >= 1` или этим marker не обрабатывает ошибку снова и возвращает `RECURSION_PREVENTED`. Похожие на Bearer token и распространённые secret assignments фрагменты сообщения маскируются.

## Подключение в n8n

1. Импортируйте четыре JSON-файла из `workflows/core/`.
2. Оставьте их inactive: это вызываемые sub-workflow, у них нет публичного trigger.
3. В бизнес-workflow добавьте Execute Sub-workflow и выберите нужный core workflow.
4. Передайте вход строго по контракту и проверяйте `ok`, а для approval дополнительно `allowAction === true`.
5. Сохраните один `correlationId` по всей цепочке и стабильный `idempotencyKey` на одно опасное действие.

Проверка репозитория:

```bash
./tests/core_workflows_test.sh
```

Тест исполняет код из workflow JSON на 16 contract fixtures. Импорт в pinned n8n CLI выполняется в release/integration проверке отдельно.
