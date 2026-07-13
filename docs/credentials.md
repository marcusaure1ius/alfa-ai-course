# Credentials и внешние интеграции

Проверено: 2026-07-14 для n8n `2.29.10`. Это стартовая точка для подключения LLM, Telegram, IMAP/SMTP и Bitrix24 после установки starter kit.

## Главное правило

Секрет вводится только в **Credentials** внутри n8n или в официальной панели provider. Не вставляйте API key, bot token, пароль, OAuth client secret, access/refresh token или полный Bitrix24 webhook URL в:

- Git и `.env.example`;
- workflow JSON, Code, Set или Sticky Note;
- fixture, screenshot, issue, чат поддержки или Projects Control evidence;
- caller input, query string, business log или нормализованную ошибку.

Workflow может содержать credential reference/placeholder, например `REPLACE_WITH_<CREDENTIAL_ID>`, но не значение секрета. Общие правила n8n: [credential management](https://docs.n8n.io/credentials/) и [workflow sharing](https://docs.n8n.io/workflows/sharing/). Проверяйте доступ к workflow: редактор может запускать узлы с уже привязанными credentials.

## Перед подключением

1. Убедитесь, что n8n открыт по HTTPS и доступен только нужным пользователям.
2. Не меняйте существующий `N8N_ENCRYPTION_KEY`: им зашифрованы credentials. Храните его вместе с защищённым backup, но не в Git.
3. Создайте отдельный тестовый bot/mailbox/portal account там, где это возможно.
4. Выдайте минимальные scopes и права только для нужных операций.
5. Импортируйте workflow выключенным и оставьте `testMode: true`/`draftOnly: true`.

## Безопасный порядок подключения

1. Создайте или получите secret в официальной панели provider.
2. Сразу запишите владельца, назначение, scopes и дату следующей ротации — без значения secret.
3. Создайте credential в n8n и вставьте secret только в его закрытое поле.
4. Привяжите credential к указанным в guide nodes. Не передавайте credential ID через business input.
5. Выполните встроенную проверку credential, если она доступна.
6. Запустите preview/diagnostic на неперсональных тестовых данных.
7. Выполните один controlled smoke в отдельном тестовом получателе/account.
8. Только после ожидаемого результата снимайте безопасный режим. Не включайте несколько интеграций одновременно.

## Куда идти дальше

| Интеграция | Руководство | Безопасный первый результат |
|---|---|---|
| Generic LLM | [Generic provider](generic-llm-provider.md) | `ok: true`; при недоступном `/models` допустим `MODEL_DISCOVERY_UNAVAILABLE`, но manual completion успешен |
| Yandex / GigaChat | [LLM providers](llm-providers.md) | Connection test подтверждает model/completion; capability остаётся `external_unverified` без реального credential smoke |
| Telegram | [Telegram credential и allowlist](credentials/telegram.md) | сначала `preview`, затем `draft`, после отдельного smoke — `sent` в allowlisted test chat |
| IMAP / SMTP | [Mail credentials](credentials/mail.md) | одно тестовое письмо получено; draft/approval preview не отправляет письмо; controlled SMTP smoke появляется у тестового получателя |
| Bitrix24 CRM | [CRM credentials](credentials/crm.md) | `testMode: true` возвращает preview без mutation; controlled rehearsal создаёт/обновляет только тестовый lead/task |

## Что можно записать в evidence

Разрешены: дата/время, workflow ID, provider, safe credential ID/name, model ID, HTTP status class, latency, нормализованный error code и итог `preview`/`sent`/`mutated`. Перед публикацией удалите персональные данные.

Запрещены: secret value, Authorization/Cookie headers, raw provider body, prompt/message/email body, token endpoint response и полный webhook URL.

## Ротация и отзыв

Плановая ротация:

1. Создайте новый secret с теми же минимальными правами.
2. Обновите существующий credential в n8n или создайте новый и перепривяжите только нужные nodes.
3. Повторите diagnostic/preview и один controlled smoke.
4. Проверьте, что старый secret больше нигде не привязан.
5. Отзовите старый secret в официальной панели provider.
6. Зафиксируйте только время отзыва и safe credential reference.

При подозрении на утечку порядок другой: немедленно отзовите secret, остановите затронутые workflow, выпустите новый, проверьте executions и сузьте scopes/allowlists. Не ждите планового smoke, чтобы отозвать скомпрометированный secret.

## Общая диагностика

| Симптом | Безопасная проверка | Действие |
|---|---|---|
| Credential test не проходит | тип credential, binding, endpoint, системное время | исправьте конфигурацию; не выводите secret в log |
| `AUTH_FAILED` / `401` / `403` | срок, scopes, provider account и права технического пользователя | перевыпустите или ротируйте credential с минимальными правами |
| `MODEL_NOT_FOUND` / validation error | model ID, folder/portal mapping, required fields | используйте discovery/официальные IDs; не угадывайте значения |
| `RATE_LIMITED` / `429` | safe status и provider quota | дождитесь backoff; не делайте blind retry внешнего действия |
| timeout / `5xx` | provider status и историю целевого объекта/сообщения | сначала исключите неоднозначный успех, затем повторяйте по documented policy |
| TLS error | hostname, время, CA chain, provider TLS requirements | исправьте trust chain; никогда не отключайте certificate verification |

Если guide и интерфейс provider расходятся, остановитесь и перепроверьте официальную документацию. Не переносите secret в обычное поле только потому, что UI изменился.
