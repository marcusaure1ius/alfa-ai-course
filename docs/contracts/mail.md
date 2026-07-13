# Контракт provider-neutral mail gateway

Проверено: 2026-07-14. Версия контракта: `1.0`.

Файл `workflows/core/mail-gateway.json` — inactive sub-workflow с одним provider-neutral envelope и тремя операциями:

- `normalizeIncoming` принимает нормализованный результат IMAP adapter;
- `createDraft` создаёт безопасный plain-text черновик;
- `authorizeSend` проверяет черновик и результат `Core - Request Human Approval`, после чего либо возвращает preview/denial, либо направляет данные в SMTP node.

Workflow не принимает hostname, port, login, password или token. IMAP/SMTP transport и credentials настраиваются только в n8n.

## Общий envelope

| Поле | Правило |
|---|---|
| `contractVersion` | Необязательно; поддерживается только `1.0` |
| `operation` | `normalizeIncoming`, `createDraft` или `authorizeSend` |
| `testMode` | По умолчанию `true`; SMTP недостижим |
| `correlationId` | Непрозрачный trace ID до 128 безопасных символов; при отсутствии создаётся UUID |

Неизвестные envelope-поля отклоняются. Любой результат, кроме точного `sendAuthorized: true`, не разрешает внешнюю отправку.

## `normalizeIncoming`

IMAP adapter передаёт объект `message`:

```json
{
  "operation": "normalizeIncoming",
  "message": {
    "messageId": "<message-1042@example.com>",
    "inReplyTo": "<previous@example.com>",
    "references": ["<root@example.com>", "<previous@example.com>"],
    "from": "client@example.com",
    "to": ["inbox@example.com"],
    "cc": [],
    "subject": "Вопрос",
    "text": "Текст сообщения",
    "html": "<p>Резервная HTML-версия</p>",
    "receivedAt": "2026-07-14T08:00:00Z",
    "attachments": []
  }
}
```

Правила нормализации:

- plain text предпочтительнее HTML;
- HTML не сохраняется и не возвращается: `script`, `style`, `iframe`, `object`, `embed`, `form`, `svg`, `math`, comments и tags удаляются, entities декодируются, результат ограничивается 12 000 символами;
- даже очищенный `safeText` помечается `untrustedContent: true`: это данные, а не инструкция для LLM или workflow;
- `messageId`, `inReplyTo` и максимум 20 `references` формируют provider-neutral threading metadata;
- адреса нормализуются в lowercase, header injection через CR/LF отклоняется;
- `processingMarker: alfa-mail-gateway-v1` на входе означает собственное исходящее письмо и возвращает `LOOP_DETECTED`;
- raw MIME/provider payload и неизвестные поля не принимаются.

IMAP adapter отвечает за durable deduplication: он сравнивает `messageId` с уже обработанными IDs и помечает собственные исходящие сообщения `processingMarker` по сохранённой записи отправки. Сам marker не извлекается из произвольного body/subject, чтобы клиент не мог подделать управляющий header текстом письма.

Attachment принимается только как metadata `{fileRef, fileName, mimeType, size}`. Максимум 10 файлов, 10 MiB на файл и 20 MiB суммарно. Binary/base64, path, URL и дополнительные поля отклоняются. Содержимое attachment не считается проверенным.

## `createDraft`

```json
{
  "operation": "createDraft",
  "draft": {
    "idempotencyKey": "reply-message-1042-v1",
    "to": ["client@example.com"],
    "cc": [],
    "bcc": [],
    "subject": "Re: Вопрос",
    "bodyText": "Проверенный человеком текст",
    "inReplyTo": "<message-1042@example.com>",
    "references": ["<message-1042@example.com>"]
  }
}
```

Результат всегда имеет `sendAuthorized: false`. `draftOnly` по умолчанию `true`; canonical `processingMarker` добавляется автоматически. HTML запрещён. Subject и recipients проходят CR/LF validation, body ограничивается 12 000 символами.

## `authorizeSend`

Передайте тот же `draft`, `sender` и результат `Core - Request Human Approval`:

```json
{
  "operation": "authorizeSend",
  "testMode": false,
  "draft": {
    "idempotencyKey": "reply-message-1042-v1",
    "to": "client@example.com",
    "subject": "Re: Вопрос",
    "bodyText": "Согласованный текст",
    "draftOnly": false
  },
  "sender": {
    "fromEmail": "owner@example.com",
    "replyTo": "support@example.com"
  },
  "approval": {
    "contractVersion": "1.0",
    "ok": true,
    "status": "approved",
    "allowAction": true,
    "idempotencyKey": "reply-message-1042-v1",
    "expiresAt": "2026-07-14T10:00:00Z",
    "decision": {
      "state": "approved",
      "approverRef": "owner-001"
    }
  }
}
```

SMTP выполняется только если одновременно:

1. `testMode === false`;
2. `draft.draftOnly === false`;
3. attachment list пуст;
4. approval имеет точные `contractVersion`, `ok`, `status`, `allowAction`, `decision.state` и безопасный `approverRef`;
5. approval и draft имеют одинаковый `idempotencyKey`;
6. `expiresAt` существует и находится в будущем;
7. approval не содержит неизвестных полей.

Отсутствующий, denied, ambiguous, malformed или mismatched approval возвращает `status: denied`. В test mode возвращается `preview`; draft-only возвращает `draft`. Все ветки имеют `sendAuthorized: false` и физически обходят SMTP node.

Исходящие attachments в MVP fail-closed с `ATTACHMENT_REVIEW_REQUIRED`: metadata validation не заменяет antivirus/content scanning. Email отправляется только как plain text, TLS certificate verification не отключается.

### Ограничение threading pinned Send Email node

Контракт сохраняет `inReplyTo`, `references` и `threadRef` для бизнес-логики и дедупликации. Штатный Send Email node pinned n8n `2.29.10` документирует `Reply To`, но не предоставляет параметры SMTP `In-Reply-To`, `References` или custom headers. Поэтому текущий SMTP transport не обещает нативную группировку ответа в mail client и не передаёт `processingMarker` как header. Не маскируйте это subject/body marker. Если строгий RFC-threading обязателен, добавьте отдельный transport adapter и contract tests до production; core contract менять не нужно.

## Ошибки и повторная обработка

| Code | Действие |
|---|---|
| `LOOP_DETECTED` | Не обрабатывать и не отвечать; проверить IMAP rule и marker |
| `INVALID_ATTACHMENTS` | Удалить binary/raw поля, проверить count и byte limits |
| `INVALID_RECIPIENT` / `INVALID_SUBJECT` | Отклонить header injection или неверный адрес |
| `EXPLICIT_APPROVAL_REQUIRED` | Создать/разрешить approval по контракту T-0017 с тем же key |
| `ATTACHMENT_REVIEW_REQUIRED` | Оставить draft; не обходить gate |
| SMTP node error | Не менять idempotency key и не retry вслепую; сначала сверить Sent mailbox/provider status |

## Проверка

```bash
./tests/mail_gateway_test.sh
```

Тест исполняет контракт прямо из workflow JSON на 20 security/format fixtures и проверяет, что только точный unexpired approved production case достигает SMTP-ветки. Реальный IMAP/SMTP smoke не заявляется без user-provided mailboxes и credentials.
