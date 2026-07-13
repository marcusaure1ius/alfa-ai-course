# Настройка Telegram credential и allowlist

Проверено: 2026-07-14. Инструкция не требует и не допускает сохранения bot token в Git, workflow JSON, fixtures, логах или Projects Control evidence.

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

## 4. Безопасный ввод в эксплуатацию

1. Запустите sub-workflow с валидным запросом в default profile. Ожидается `status: preview`; сообщения в Telegram нет.
2. Установите только `profileTestMode=false`, оставив `profileDraftOnly=true`. Ожидается `status: draft`; сообщения всё ещё нет.
3. Выберите отдельный тестовый chat из allowlist, передайте caller `testMode=false`, `draftOnly=false` и новый idempotency key.
4. Только для этого контролируемого smoke установите `profileDraftOnly=false` и выполните один запуск.
5. Проверьте chat, `status: sent` и numeric `messageId`. Верните безопасные profile defaults, если production automation ещё не одобрена.

Никогда не retry один и тот же запуск автоматически. При 429/timeout/5xx сначала проверьте историю chat: ключ уже зарезервирован, потому что результат отправки может быть неоднозначным.

## Ротация и инцидент

- При утечке немедленно отзовите token через `@BotFather`, создайте новый и обновите только credential в n8n.
- Удалите бота из лишних chats, сузьте allowlist и проверьте execution retention.
- Не прикладывайте старый или новый token к диагностике. Достаточно error code из нормализованного результата.
- После изменения allowlist повторите preview/draft/single-smoke последовательность.
