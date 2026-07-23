# RF Email Triage to Telegram

Проверено: 2026-07-23. Workflow: `workflows/business/rf-email-telegram-triage.json`. ID: `businessRfEmailTelegramTriageV1`.

Сценарий читает новое письмо Gmail или Яндекс Почты, безопасно нормализует его, классифицирует через LLM Gateway и готовит Telegram alert только для high/urgent или security. Он не отвечает на письмо, не удаляет его и по умолчанию не отправляет реальное сообщение в Telegram.

## Что получает владелец

Telegram preview содержит:

- приоритет и категорию;
- subject длиной не более 160 символов;
- маскированный адрес вида `m***@example.com`;
- LLM-summary, краткую причину и рекомендованное ручное действие;
- явное напоминание проверить исходное письмо.

Полный email address, raw body, raw HTML, MIME, attachments, credential и provider response в Telegram не передаются.

## Порядок импорта

Импортируйте:

1. `workflows/core/mail-gateway.json`;
2. `workflows/core/llm-gateway.json`;
3. выбранный LLM adapter: `workflows/adapters/llm-yandex.json` или `workflows/adapters/llm-gigachat.json`;
4. `workflows/core/send-telegram-message.json`;
5. `workflows/core/log-business-event.json`;
6. `workflows/business/rf-email-telegram-triage.json`.

Если n8n изменил ID из-за конфликта, заново выберите четыре sub-workflows в Execute Sub-workflow nodes.

## Настройка за четыре действия

1. Создайте IMAP credential по готовому профилю [Gmail или Яндекс Почты](../credentials/mail.md) и привяжите его к `Email Trigger (IMAP)`.
2. Настройте [Yandex AI Studio или GigaChat](../llm-providers.md), проверьте adapter, затем укажите `profileLlmProvider` (`yandex` или `gigachat`) и соответствующий model ID в `RF Triage Profile`. Default — `yandex`; `generic` остаётся третьим вариантом.
3. Создайте Telegram bot, привяжите credential в `Core - Send Telegram Message`, добавьте owner chat ID в allowlist и тот же ID укажите в `profileOwnerChatId`.
4. Оставьте `profileTestMode: true` и `profileDraftOnly: true`, запустите synthetic test и проверьте `notification_preview`.

Default threshold `profileNotifyMinPriority: high`: `low` и `normal` остаются в inbox без Telegram alert. Категория `security` всегда создаёт alert независимо от model priority, но сообщение остаётся рекомендацией до проверки человеком.

Execute Sub-workflow не принимает workflow ID из email или caller input. Закрытая карта выбирает ровно один из трёх импортированных LLM contracts: generic, Yandex AI Studio или GigaChat. Provider-specific URL, folder, scope и credentials остаются внутри выбранного adapter.

## Privacy boundaries

- IMAP читает только `UNSEEN`, использует `Simple`, отмечает письмо прочитанным и не скачивает attachments.
- Mail Gateway удаляет raw HTML и ограничивает `safeText`.
- В LLM уходит максимум `profileMaxLlmTextChars=6000` символов, sender domain, subject и receivedAt.
- Email local-part не передаётся LLM.
- В Telegram уходит маскированный sender и нет raw body.
- Последние 500 production `messageId` используются только для bounded dedupe внутри workflow static data.
- Business Event Log получает opaque `correlationId`, status и channel без адресов, subject или message ID.

Email content и summary всё равно могут содержать персональные данные. До activation проверьте retention и при необходимости сократите default `168` часов.

## Controlled smoke

1. Используйте отдельный test mailbox и письмо с вымышленным содержанием без персональных данных.
2. Запустите через `Called by Test Workflow` либо получите одно новое IMAP-письмо.
3. Ожидайте `notification_preview` для high/urgent fixture или `classified_no_alert` для normal/low.
4. Убедитесь, что Telegram sender не выполнил реальную отправку.
5. Проверьте маскирование адреса, отсутствие body/HTML и корректную ссылку на исходное письмо через mailbox, а не через model output.
6. Только после этого отдельно смените `profileTestMode` на `false`; для реальной Telegram отправки также осознанно смените `profileDraftOnly` на `false`.

Изменение обоих flags — production decision. Реальная почта и Telegram требуют user-owned credentials; локальные fixtures этого не доказывают.

## Результаты

| Status | Значение |
|---|---|
| `notification_preview` | важное письмо классифицировано, Telegram Gateway вернул безопасный preview |
| `notification_sent` | сообщение реально отправлено после явного отключения safe defaults |
| `classified_no_alert` | письмо ниже threshold и осталось без Telegram |
| `needs_manual_review` | LLM/Gateway/schema failure; внешнего действия нет |
| `skipped` + `DUPLICATE_MESSAGE` | письмо уже обработано |
| `skipped` + `NORMALIZATION_FAILED` | Mail Gateway отклонил вход |

## Проверка репозитория

```bash
./tests/rf_email_telegram_triage_test.sh
```

Тест исполняет Code nodes из workflow JSON, проверяет 12 schema/threshold fixtures, IMAP mapping, 6000-char minimization, sender masking, dedupe, shared gateway wiring, minimal logging и отсутствие secrets/direct outbound nodes.

Полный порядок и clean import: [workflow catalog](../workflow-catalog-and-test-report.md).
