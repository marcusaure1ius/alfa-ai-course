# Контракт Send Telegram Message

Проверено: 2026-07-14. Версия контракта: `1.0`. Закреплённая версия n8n: `2.29.10`.

`workflows/core/send-telegram-message.json` — inactive sub-workflow для одной безопасной операции: отправить plain-text сообщение в заранее разрешённый Telegram chat. Он централизует allowlist, test/draft режимы, лимит сообщения, idempotency reservation и безопасную нормализацию ответа Telegram Bot API.

## Вход

```json
{
  "contractVersion": "1.0",
  "testMode": true,
  "draftOnly": true,
  "correlationId": "assistant-message-1042",
  "idempotencyKey": "telegram-assistant-message-1042-v1",
  "chatId": "123456789",
  "text": "Текст для проверки",
  "format": "plain",
  "disableNotification": false
}
```

| Поле | Правило |
|---|---|
| `contractVersion` | Необязательно; поддерживается только `1.0` |
| `testMode` | По умолчанию `true`; внешний вызов недостижим |
| `draftOnly` | По умолчанию `true`; внешний вызов недостижим |
| `correlationId` | Безопасный trace ID до 128 символов; при отсутствии создаётся UUID |
| `idempotencyKey` | Обязательный стабильный ключ 8–128 символов из `A-Z a-z 0-9 . _ : -` |
| `chatId` | Только numeric chat ID; `@username` запрещён из-за неоднозначности назначения |
| `text` | 1–4096 Unicode-символов без управляющих байтов |
| `format` | Только `plain`; HTML, legacy Markdown и MarkdownV2 fail-closed |
| `disableNotification` | Необязательный boolean |

Неизвестные поля отклоняются. Контракт не принимает token, credential, URL, reply markup, media или raw Telegram payload.

## Условия внешней отправки

Telegram node достижим, только если одновременно:

1. workflow profile имеет корректный непустой numeric allowlist;
2. `chatId` присутствует в этом allowlist;
3. и caller, и workflow profile явно установили `testMode=false`;
4. и caller, и workflow profile явно установили `draftOnly=false`;
5. вход прошёл строгую проверку полей, формата и длины;
6. `idempotencyKey` ещё не резервировался.

Profile node выполняется перед validator и перезаписывает свои `profile*` поля, поэтому caller не может передать собственный allowlist или отключить безопасные defaults. До осознанной настройки profile остаётся `REPLACE_WITH_ALLOWED_CHAT_IDS`, `profileTestMode=true`, `profileDraftOnly=true` и fail-closed.

## Idempotency и повторы

Перед единственным внешним вызовом ключ резервируется в workflow static data. Повтор с тем же ключом получает `status: duplicate` и не доходит до Telegram node. Хранится максимум 500 резервов не старше семи суток.

Автоматический retry в Telegram node не включён. Это сознательный at-most-once guard: после timeout, 429, 5xx или неожиданного ответа нельзя слепо повторять запрос, потому что неизвестно, получил ли Telegram сообщение. Сначала проверьте chat и историю выполнения; затем оператор решает, нужен ли новый versioned idempotency key. После рестарта между фактической отправкой и сохранением static data теоретически возможен дубль — это явно не exactly-once transport.

## Результат

Безопасные статусы до внешнего вызова: `preview`, `draft`, `rejected`, `duplicate`, `authorized`. После Telegram API: `sent` или `failed`. Результат не возвращает исходный text, полный chat ID, provider description или raw response; `chatRef` содержит только последние четыре цифры.

| Error code | Смысл / действие |
|---|---|
| `ALLOWLIST_NOT_CONFIGURED` | Настроить profile node, не обходить allowlist |
| `CHAT_NOT_ALLOWED` | Проверить numeric ID и получить явное разрешение владельца |
| `INVALID_MESSAGE_TEXT` | Исправить пустой, слишком длинный или управляющий текст |
| `UNSUPPORTED_FORMAT` | Передать plain text; не подмешивать Telegram markup |
| `AUTH_FAILED` | Проверить credential в n8n |
| `CHAT_FORBIDDEN` | Проверить membership/permissions бота и ID |
| `FORMATTING_REJECTED` / `REQUEST_REJECTED` | Исправить запрос; исходный provider body не возвращается |
| `RATE_LIMITED` | Учитывать `retryAfter`, но не повторять автоматически |
| `PROVIDER_UNAVAILABLE` / `INVALID_PROVIDER_RESPONSE` | Сверить Telegram chat перед решением о повторе |

## Проверка

```bash
./tests/telegram_sender_test.sh
```

Тест исполняет JavaScript прямо из workflow JSON на 20 fixtures, проверяет graph isolation, defaults, allowlist, duplicate reservation и API error mapping. Реальный Telegram smoke не заявляется без user-provided bot credential и разрешённого тестового chat.
