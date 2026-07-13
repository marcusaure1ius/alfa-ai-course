# CRM: Bitrix24 OAuth2 и безопасный rehearsal

Проверено: 2026-07-14 для n8n `2.29.10`.

Используйте этот порядок:

1. Убедитесь по официальному [Bitrix24 REST access guide](https://apidocs.bitrix24.com/first-steps/access-to-rest-api.html), что portal поддерживает нужный API.
2. Создайте local application по официальному [OAuth 2.0 protocol](https://apidocs.bitrix24.com/settings/oauth/index.html) со scopes только `crm` и `task`.
3. Настройте credential, mapping и adapter по [подробной CRM-инструкции](credentials/crm.md).
4. Импортируйте [Lead Handler](workflows/lead-handler.md) и оставьте `testMode: true`.
5. Выполните preview, затем один lead upsert и один task rehearsal только на test portal/test records.

Client secret и token pair хранятся только в n8n OAuth2 credential — не в Git, workflow JSON, webhook URL, fixture, screenshot или evidence. Incoming webhook не является экспортируемым production auth path.

Успех: preview возвращает `mutated: false`; controlled upsert возвращает один safe entity ID и повтор с тем же `idempotencyKey` не создаёт дубль; task возвращает ID/`XML_ID`. `DUPLICATE_AMBIGUOUS` и `AMBIGUOUS_TASK_STATE` требуют ручной reconciliation, а не blind retry.

Ротация: создайте новую application/credential с теми же минимальными scopes, повторите read/upsert/task rehearsal, затем отзовите старую application/token pair в Bitrix24.
