# Telegram Assistant: безопасный demo

Проверено: 2026-07-14. Workflow: `workflows/business/telegram-assistant.json`. Pinned n8n: `2.29.10`.

Telegram Assistant принимает только новые text messages из явного numeric allowlist, передаёт минимизированный текст в shared LLM Gateway, локально проверяет structured draft и создаёт pending approval. Ответ пользователю возможен только отдельным запуском после точной команды владельца. Экспорт не активен и имеет `profileTestMode=true`, `profileDraftOnly=true`.

## Используемые shared workflows

- `coreNormalizeMessageV1` — строгий входной envelope;
- `coreGenericLlmGatewayV1` — provider-neutral structured LLM call без tools;
- `coreHumanApprovalV1` — request/resolve и exact unexpired decision;
- `coreSendTelegramMessageV1` — повторный allowlist, idempotency и safe transport;
- `coreWorkflowErrorV1` — redaction и нормализация ошибок;
- `coreBusinessEventLogV1` — минимальный business event без текста сообщения.

Business workflow не содержит bot token и не вызывает Telegram/LLM HTTP API напрямую.

## Настройка

1. Импортируйте core workflows, затем `workflows/business/telegram-assistant.json`.
2. В **Telegram Trigger** выберите тот же Telegram API credential, который настроен по `docs/credentials/telegram.md`.
3. В поле **Restrict to Chat IDs** замените placeholder на numeric ID пользовательских chats и owner chat через запятую.
4. В **Telegram Assistant Profile** задайте тот же `profileAllowedChatIds`, точные `profileOwnerChatId`, `profileOwnerUserId`, непрозрачный `profileOwnerRef` и `profileModel`.
5. В `Core - Send Telegram Message` отдельно настройте credential и allowlist, включающий user chats и owner chat.
6. Оставьте оба safe-флага `true` для первого demo. Активируйте только после clean import и проверки test path.

Один Telegram bot поддерживает только один активный Telegram Trigger webhook. Не активируйте другой trigger с тем же bot credential одновременно.

## Вход и маршрутизация

Поддерживается только raw Telegram `message` update с integer `update_id`, integer `message_id`, numeric `chat.id`, numeric `from.id` и `text` длиной 1–4096 символов. Photo/file/callback/edited update не обрабатываются. `from.is_bot=true` возвращает `BOT_LOOP_DETECTED`.

Защита выполняется дважды:

1. native Telegram Trigger отбрасывает chats вне `Restrict to Chat IDs`;
2. Code validator повторно проверяет workflow-owned `profileAllowedChatIds` до normalization/LLM.

До настройки placeholder возвращается `ALLOWLIST_NOT_CONFIGURED`. Caller не может переопределить profile, потому что Set node выполняется после обоих triggers.

Update ID сохраняется в bounded static state только при `profileTestMode=false`: повтор получает `DUPLICATE_UPDATE` до LLM. Хранятся последние 500 ID.

## Draft и approval

LLM получает только delimited untrusted text и timestamp. Tools/provider-native structured output выключены. Ожидаемый JSON:

```json
{
  "intent": "question",
  "summary": "Пользователь спрашивает статус",
  "shouldReply": true,
  "replyText": "Проверим статус и вернёмся с ответом."
}
```

Неизвестные поля, неверные enums, reply при `shouldReply=false` и текст длиннее 2000 символов отклоняются. Валидный draft получает ключ `telegram-reply-<update_id>` и pending approval сроком на час.

При production profile pending state хранит только approval key, user chat ID, draft, summary, режимы и expiry; raw user text не сохраняется. Максимум 100 записей, expired записи удаляются.

Owner notification содержит две точные команды:

```text
/approve telegram-reply-1001
/deny telegram-reply-1001
```

Команда принимается только когда одновременно совпадают owner chat и owner user ID. Свободный текст владельца не попадает в LLM. Команда из пользовательского chat возвращает `UNAUTHORIZED_APPROVAL`.

## Условия ответа пользователю

Reply-ветка достижима только если:

1. pending key существует и имеет status `awaiting`;
2. shared approval вернул exact `ok=true`, `status=approved`, `allowAction=true`;
3. key, owner reference и непросроченный `expiresAt` совпали;
4. business `testMode=false` и `draftOnly=false` были зафиксированы при создании pending и остаются выключены при решении;
5. shared Telegram sender отдельно разрешает chat и production send.

`/deny`, timeout, missing/mismatched key и неоднозначное состояние не отправляют ответ. Telegram sender использует отдельный idempotency key `telegram-send-<approval-key>` и не делает автоматический retry.

## Safe demo

1. С `profileTestMode=true`, `profileDraftOnly=true` вызовите **Called by Test Workflow** на fixture-shaped update. Ожидается pending/preview, без owner notification и user reply.
2. Установите только `profileTestMode=false`, оставив draft-only. Повторите с новым `update_id`: pending может сохраниться, но sender вернёт draft и ничего не отправит.
3. Для controlled smoke используйте отдельные allowlisted owner/user chats, новые IDs и один draft. Только после визуальной проверки временно выключите `profileDraftOnly` в business profile и core sender.
4. Владелец отправляет точную `/approve ...` команду. Проверьте `status: replied` и `externalReply: true`.
5. Верните safe defaults, если автоматизированная production-работа ещё не одобрена.

Реальный Telegram/LLM smoke не считается выполненным без user-provided credentials и evidence.

## Fixture matrix

`tests/fixtures/telegram-assistant/contracts.json` содержит 20 cases: allowlisted input, bot loop, missing/update shapes, unconfigured model/allowlist, outside allowlist, non-text/oversize, forged approval, owner free text, exact approve/deny, production duplicate, valid draft/no-reply, gateway error, unknown field, invalid intent, inconsistent reply и oversized draft.

```bash
./tests/telegram_assistant_test.sh
```
