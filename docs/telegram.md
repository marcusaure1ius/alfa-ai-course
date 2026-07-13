# Telegram: подключение и безопасный запуск

Проверено: 2026-07-14 для n8n `2.29.10`.

Используйте этот порядок:

1. Создайте отдельного bot через официальный [BotFather tutorial](https://core.telegram.org/bots/tutorial).
2. Создайте Telegram API credential и allowlist по [подробной инструкции](credentials/telegram.md).
3. Настройте [sender contract](contracts/telegram.md), оставив `testMode: true` и `draftOnly: true`.
4. Для входящих сообщений настройте [Telegram Assistant](workflows/telegram-assistant.md). Один bot поддерживает только один активный trigger webhook.
5. Выполните preview → draft → один controlled send в отдельный allowlisted test chat.

Минимальные права: bot добавлен только в нужные chats, в group включён Privacy Mode, если workflow не должен видеть все сообщения. Token хранится только в n8n credential — не в Git, workflow JSON, `.env`, screenshot или evidence.

Успех: credential check проходит, preview/draft не вызывает Telegram API, controlled smoke возвращает `status: sent` и numeric `messageId`. Типовые `AUTH_FAILED`, `CHAT_NOT_ALLOWED`, `CHAT_NOT_FOUND`, `RATE_LIMITED` и неоднозначные provider errors разобраны в credential guide.

Ротация: выпустите новый token в BotFather, обновите credential, повторите controlled smoke, затем отзовите старый token. При утечке отзыв выполняется немедленно до диагностики.
