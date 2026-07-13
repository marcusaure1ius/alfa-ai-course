# Email Assistant: настройка, контракт и privacy

Проверено: 2026-07-14. Workflow: `workflows/business/email-assistant.json`. Контракт: `1.0`.

Email Assistant читает новое письмо через IMAP, нормализует его, получает классификацию и черновик через shared LLM Gateway и оставляет владельцу результат для ручной проверки. Экспортированный workflow inactive, работает в `profileTestMode: true` и не содержит SMTP node или операции `authorizeSend`.

## Что делает workflow

1. Email Trigger (IMAP) читает максимум очередной bounded batch новых писем из `INBOX`, отмечает их прочитанными и не скачивает attachments.
2. `Core - Provider-Neutral Mail Gateway` проверяет адреса, IDs и threading metadata, удаляет опасный HTML и возвращает максимум 12 000 символов `safeText` с marker `untrustedContent: true`.
3. Bounded static state хранит последние 500 обработанных production `messageId`; повтор завершается как `DUPLICATE_MESSAGE` до LLM.
4. `Core - LLM Gateway (Generic)` получает только JSON внутри `BEGIN_UNTRUSTED_EMAIL` / `END_UNTRUSTED_EMAIL`. Tools и provider structured output выключены.
5. Локальный validator принимает только фиксированные enums/schema. Имя, email, телефон и компания сохраняются только при наличии evidence в отправителе, subject или `safeText`; иначе становятся `null`.
6. `Core - Provider-Neutral Mail Gateway` создаёт только `testMode: true`, `draftOnly: true` черновик.
7. `Core - Log Business Event` получает минимальное событие с opaque `correlationId`, без message text или email.
8. Owner review payload сохраняется в output execution. Никакого внешнего уведомления или письма workflow не отправляет.

LLM summary, category, priority, recommended action и draft — рекомендации, а не подтверждённые факты. Владелец обязан проверить их по исходному письму. Контактные поля дополнительно evidence-bound, но это не превращает весь model output в доверенный.

## Зависимости и порядок импорта

Сначала импортируйте:

1. `workflows/core/mail-gateway.json` — ID `coreMailGatewayV1`;
2. `workflows/core/llm-gateway.json` — ID `coreGenericLlmGatewayV1`;
3. `workflows/core/log-business-event.json` — ID `coreBusinessEventLogV1`;
4. `workflows/business/email-assistant.json`.

Все sub-workflow calls настроены с ожиданием завершения. Если n8n заменил IDs при конфликте, заново выберите соответствующие workflows в четырёх Execute Sub-workflow nodes.

## Настройка

### 1. IMAP

Следуйте [IMAP/SMTP guide](../credentials/mail.md), создайте credential типа IMAP и привяжите его к `Email Trigger (IMAP)`.

Безопасные defaults уже установлены:

- mailbox `INBOX`;
- format `Simple`;
- `Download Attachments: false`;
- `Fetch Only New Emails: true`;
- post-process `Mark as Read`;
- custom rule `UNSEEN`.

Используйте отдельный тестовый mailbox. Attachments представлены только metadata; OCR, antivirus scan и исполнение файлов не входят в workflow.

### 2. LLM Gateway

Настройте credential и profile в [Generic LLM provider guide](../generic-llm-provider.md). В `Email Assistant Profile` замените `REPLACE_WITH_MODEL_ID` на проверенный model ID. API key, Base URL и credential ID не передаются во входных данных Email Assistant.

### 3. Owner reference

Замените `REPLACE_WITH_OWNER_REF` на непрозрачный внутренний идентификатор, например `owner-001`. Не используйте email, имя или телефон. В MVP `ownerNotification.channel` равен `n8n_execution`: владелец проверяет результат в execution output либо будущий approved notification workflow забирает этот объект как вход.

### 4. Test mode и activation

1. Оставьте workflow inactive.
2. Запустите через `Called by Test Workflow` на synthetic fixture и убедитесь, что `externalSend` равен `false`.
3. Отправьте безопасное письмо в тестовый mailbox и выполните manual trigger ожидание.
4. Проверьте classification, removed-field warnings, draft и owner notification.
5. Для production polling измените `profileTestMode` на `false`. Это включает persistent dedupe, но не разрешает SMTP.
6. Только после теста опубликуйте workflow.

## Input

Production input создаёт штатный Email Trigger n8n в формате Simple: `from`, `to`, `cc`, `subject`, `date`, `textPlain`, `textHtml`, `metadata` и `attributes.uid`. Adapter берёт `message-id`, `in-reply-to` и `references` из metadata. Если `message-id` отсутствует, используется mailbox-local fallback `imap-uid:<uid>`.

Для fixture/test sub-workflow можно передать уже подготовленный `message` по [mail contract](../contracts/mail.md):

```json
{
  "message": {
    "messageId": "fixture-message-001",
    "from": "sender@example.com",
    "to": ["inbox@example.com"],
    "cc": [],
    "subject": "Тестовый запрос",
    "text": "Synthetic fixture without personal data",
    "receivedAt": "2026-07-14T08:00:00Z"
  }
}
```

Raw MIME, binary attachments, credential data и неизвестные mail fields будут отклонены shared Mail Gateway.

## Output

Успешный результат:

```json
{
  "ok": true,
  "status": "draft_ready",
  "correlationId": "opaque-trace-id",
  "messageId": "provider-message-id",
  "classification": {
    "category": "sales",
    "priority": "high",
    "summary": "Model-generated summary for review",
    "contact": {
      "name": null,
      "email": "sender@example.com",
      "phone": null,
      "company": null
    },
    "recommendedAction": "reply",
    "draftReply": "Draft for owner review"
  },
  "draft": {
    "draftOnly": true
  },
  "ownerNotification": {
    "channel": "n8n_execution",
    "requiresAttention": true
  },
  "externalSend": false,
  "warnings": []
}
```

Другие statuses:

| Status/reason | Значение |
|---|---|
| `needs_manual_review` | Gateway error или schema rejection; draft не создан |
| `DUPLICATE_MESSAGE` | `messageId` уже есть в последних 500 production IDs |
| `NORMALIZATION_FAILED` | Shared Mail Gateway отклонил адрес, HTML-only empty text, marker или contract |
| `LOOP_DETECTED` | IMAP adapter пометил собственное/повторно обработанное письмо canonical marker |

## Privacy и retention

Email content и model draft могут содержать персональные данные. Поэтому:

- workflow не пишет message content в Business Event Log;
- credentials и raw provider response не возвращаются;
- attachments не скачиваются;
- pin data пуст;
- outbound send отсутствует;
- success/error/manual execution data сохраняется, чтобы owner notification была доступна в n8n execution output, и удаляется общей pruning policy (`168` часов / `10000` executions по default runtime profile).

Для более чувствительного mailbox уменьшите retention до activation. Не копируйте production execution в fixtures или task evidence; используйте synthetic examples.

## Проверка репозитория

```bash
./tests/email_assistant_test.sh
```

Тест исполняет Code nodes непосредственно из workflow JSON, включает 13 security/schema/anti-invention fixtures и отдельно проверяет IMAP mapping, delimiters, dedupe, loop marker, draft-only, minimal logging и отсутствие SMTP/secrets. Clean import проверяется на pinned `docker.n8n.io/n8nio/n8n:2.29.10`.

Реальный IMAP и LLM smoke не заявляется без user-provided test mailbox и credentials.
