# Настройка Telegram credential и allowlist

Проверено: 2026-07-14. Инструкция не требует и не допускает сохранения bot token в Git, workflow JSON, fixtures, логах или Projects Control evidence.

Официальные источники, проверенные 2026-07-14: [создание bot через BotFather](https://core.telegram.org/bots/tutorial), [возможности и настройки BotFather](https://core.telegram.org/bots/features), [Telegram credential в n8n](https://docs.n8n.io/integrations/builtin/credentials/telegram/) и [Telegram node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/).

## 1. Создайте credential в n8n

1. Получите token у официального `@BotFather` в Telegram.
2. В n8n откройте **Credentials → New credential → Telegram API**.
3. Вставьте token в поле **Access Token**. Оставьте официальный Base URL `https://api.telegram.org`, если вы осознанно не используете собственный Bot API server.
4. Сохраните credential и выполните встроенную проверку соединения.
5. Не вставляйте token в Code/Set node, `.env`, комментарий, screenshot, issue или evidence.

## 2. Привяжите credential

Импортируйте `workflows/core/send-telegram-message.json`, откройте node **Send Allowlisted Plain Text** и выберите созданный Telegram API credential вместо placeholder. Credential reference может храниться в workflow; сам token остаётся зашифрованным в n8n database постоянным `N8N_ENCRYPTION_KEY`.

## 3. Настройте разрешённые chats

1. Добавьте бота только в нужный private chat/group/channel и выдайте минимальные права на отправку.
2. Получите numeric chat ID контролируемым тестом. Для group/channel он обычно отрицательный; используйте точное значение, показанное Telegram update/event.
3. В node **Telegram Safety Profile - Edit Me** замените `REPLACE_WITH_ALLOWED_CHAT_IDS` на один или несколько numeric ID через запятую, пробел или новую строку.
4. Не используйте `@username`: он может измениться и контракт его отклонит.
5. Сначала оставьте `profileTestMode=true` и `profileDraftOnly=true`.

Allowlist — конфигурация workflow, а не caller input. Изменяйте его только после проверки владельца chat и назначения данных.

Для group используйте включённый Privacy Mode, если workflow не должен получать все сообщения. Для разработки предпочтителен отдельный test bot: его token и webhook не затрагивают production bot.

## 4. Безопасный ввод в эксплуатацию

1. Запустите sub-workflow с валидным запросом в default profile. Ожидается `status: preview`; сообщения в Telegram нет.
2. Установите только `profileTestMode=false`, оставив `profileDraftOnly=true`. Ожидается `status: draft`; сообщения всё ещё нет.
3. Выберите отдельный тестовый chat из allowlist, передайте caller `testMode=false`, `draftOnly=false` и новый idempotency key.
4. Только для этого контролируемого smoke установите `profileDraftOnly=false` и выполните один запуск.
5. Проверьте chat, `status: sent` и numeric `messageId`. Верните безопасные profile defaults, если production automation ещё не одобрена.

Никогда не retry один и тот же запуск автоматически. При 429/timeout/5xx сначала проверьте историю chat: ключ уже зарезервирован, потому что результат отправки может быть неоднозначным.

## Ожидаемый результат и ошибки

| Шаг | Ожидаемый результат |
|---|---|
| Credential check | n8n подтверждает соединение без показа token |
| Default profile | `status: preview`, Telegram API не вызывается |
| `draftOnly: true` | `status: draft`, сообщение не отправлено |
| Controlled smoke | `status: sent` и numeric `messageId` в allowlisted test chat |

| Ошибка | Проверка и действие |
|---|---|
| `AUTH_FAILED` | перепроверьте binding; перевыпустите token через BotFather |
| `CHAT_NOT_ALLOWED` | используйте numeric chat ID и добавьте его в profile allowlist |
| `CHAT_NOT_FOUND` | сначала начните диалог с bot или проверьте членство/права в group/channel |
| `RATE_LIMITED` | выдержите provider backoff; не запускайте blind retry |
| `PROVIDER_UNAVAILABLE` | проверьте Telegram status и историю chat до повторной отправки |

## Ротация и инцидент

- Для плановой ротации создайте новый token в BotFather, обновите credential в n8n, повторите preview/draft/single-smoke и только затем отзовите старый token.
- При утечке немедленно отзовите token через `@BotFather`, создайте новый и обновите только credential в n8n.
- Удалите бота из лишних chats, сузьте allowlist и проверьте execution retention.
- Не прикладывайте старый или новый token к диагностике. Достаточно error code из нормализованного результата.
- После изменения allowlist повторите preview/draft/single-smoke последовательность.
- Сохранённое значение в n8n не является способом provider-side отзыва.
