# LLM providers

Проверено: 2026-07-14. Gateway contract: `1.0.0`. Pinned n8n: `2.29.10`.

Документ описывает provider-specific setup поверх общего [LLM Gateway contract](contracts/llm-gateway.md). Реальный provider smoke не выполнен: в репозитории нет пользовательских credentials, а локальные fixtures проверяют только exported workflow contract и безопасную нормализацию.

## Yandex AI Studio

Adapter: `workflows/adapters/llm-yandex.json`, ID `adapterYandexAiStudioLlmV1`. Connection test: `workflows/diagnostics/yandex-llm-connection-test.json`, ID `diagnosticYandexAiStudioConnectionV1`.

Adapter принимает нормализованный запрос с `provider: yandex`, проверяет folder и полный model URI до HTTP, вызывает OpenAI-compatible Chat Completions и возвращает только общий success/error contract. API key хранится исключительно в n8n credential; workflow, fixtures, отчёт диагностики и ошибки не содержат key, request headers или raw provider body.

### Проверенные официальные факты Yandex

- API base: `https://ai.api.cloud.yandex.net/v1`;
- completion: `POST /chat/completions`;
- model discovery: `GET /models`;
- прямые REST-примеры передают API key как `Authorization: Api-Key <API-ключ>`; Chat Completions передаёт folder как `OpenAI-Project: <folder_ID>`, а Models operation — как `x-project: <folder_ID>`;
- model задаётся полным URI `gpt://<folder_ID>/<model>/<version>`; доступность конкретного URI проверяется через `/models`;
- сервисному аккаунту нужна роль `ai.languageModels.user`;
- актуальная инструкция Chat Completions требует scope `yc.ai.foundationModels.execute`, а инструкция model listing — `yc.ai.models.viewer`.

Официальные источники, перепроверенные 2026-07-14:

- [Базовый Chat Completions request](https://aistudio.yandex.ru/docs/ru/ai-studio/operations/generation/completions-basic.html);
- [Получение списка моделей](https://aistudio.yandex.ru/docs/ru/ai-studio/operations/models/get.html);
- [REST List models](https://aistudio.yandex.ru/docs/ru/ai-studio/models/listModels);
- [REST Create Chat Completion](https://aistudio.yandex.ru/docs/ru/ai-studio/api/Chat-Completions/createChatCompletion.html);
- [API keys, scopes и rotation rule](https://yandex.cloud/ru/docs/iam/concepts/authorization/api-key);
- [Structured output в Chat Completions](https://aistudio.yandex.ru/docs/ru/ai-studio/operations/generation/completions-structured.html).

### Минимальные права и credential

1. Создайте отдельный service account для starter kit и выдайте ему роль `ai.languageModels.user` только в нужном folder.
2. Создайте API key с ограниченным сроком действия.
3. Для runtime chat добавьте scope `yc.ai.foundationModels.execute`.
4. Для обязательной connection diagnostics добавьте `yc.ai.models.viewer`. Не добавляйте несвязанные scopes.
5. В n8n создайте **HTTP Header Auth** credential:
   - Name: `Authorization`;
   - Value: `Api-Key <API-ключ>`.
6. Привяжите один credential к `Yandex Chat Completion`, `Discover Yandex Models` и `Minimal Yandex Completion`.

Scope `yc.ai.languageModels.execute` существует для Text Generation API, но этот adapter реализует текущий OpenAI-compatible Chat Completions contract. Поэтому setup следует operation-specific официальным инструкциям выше, а не переносит scope между разными API по предположению.

### Folder и model URI

В `Yandex Provider Profile` и `Yandex Test Profile - Edit Me` замените placeholder на 20-символьный folder ID. В test profile задайте model, который реально вернул `/models`, например:

```text
gpt://<folder_ID>/yandexgpt/latest
```

Adapter отклоняет до сети:

- произвольный Base URL;
- незаполненный или неверного формата folder ID;
- model без схемы `gpt://`;
- model URI из другого folder;
- caller-supplied credential/profile fields и неизвестные поля.

Model URI не следует угадывать или бессрочно копировать из примера: доступные модели и их жизненный цикл меняются. Перед controlled smoke запускайте connection workflow; он сначала требует успешный `/models`, проверяет точное наличие configured URI и только затем выполняет один минимальный completion.

### Structured output и retries

Официальный Chat Completions API документирует `response_format: json_schema`, но поддержка зависит от выбранной модели и account. Без authenticated capability evidence MVP не включает provider-native mode и tools.

При `output.mode=json` adapter:

1. принимает только ограниченную локальную JSON Schema без `$ref`;
2. добавляет bounded JSON instruction к messages;
3. разбирает ответ локально и проверяет schema;
4. возвращает `OUTPUT_VALIDATION_FAILED`, если JSON невалиден;
5. добавляет warning `PROVIDER_STRUCTURED_OUTPUT_DISABLED` к успешному локально проверенному результату.

Adapter не делает автоматический retry для `401`, `403` или invalid model. `408`, `429` и `5xx` только помечаются retryable в нормализованном результате; политика bounded retry остаётся на уровне gateway/runtime, а не скрытого HTTP-node retry.

### Controlled smoke

1. Заполните folder и model URI, привяжите credential.
2. Запустите `Diagnostics - Yandex AI Studio Connection Test` с неперсональным тестовым текстом.
3. Ожидайте `modelDiscovery: available`, `completionShape: valid`, `ok: true`.
4. Запустите adapter в `output.mode=text`.
5. Запустите `output.mode=json` с простой локальной schema.
6. Намеренно задайте отсутствующий model URI: ожидается `MODEL_NOT_FOUND` без raw response body.
7. Зафиксируйте только safe status, model URI, latency и credential ID; не сохраняйте key, headers, prompt или полный provider response.

Без пользовательского credential можно утверждать только, что exports импортируются, request/response contract проходит fixtures, ошибки redacted и secret scan чист. Реальную доступность folder, role, scopes, model и provider-native schema это не доказывает.

### Ротация Yandex API key

1. Создайте новый API key для того же service account с теми же минимальными scopes и ограниченным сроком.
2. Обновите значение единственного HTTP Header Auth credential в n8n.
3. Запустите connection test и один controlled adapter smoke.
4. После успеха удалите старый key в Yandex Cloud.
5. Если key мог утечь, удалите его немедленно; не прикладывайте secret к evidence, issue или support message.

### Troubleshooting Yandex

| Симптом | Безопасная проверка | Действие |
|---|---|---|
| `CONFIGURATION_ERROR` до HTTP | Base URL, folder format, совпадение folder в model URI | исправьте profile; не передавайте profile через caller input |
| `AUTH_FAILED` на `/models` | credential binding, role, `yc.ai.models.viewer`, `x-project` без показа key | исправьте scope/folder или ротируйте key |
| `AUTH_FAILED` на completion | `yc.ai.foundationModels.execute`, `OpenAI-Project` | исправьте scope/folder; не переносите header другого endpoint по предположению |
| `MODEL_NOT_FOUND` | точный список `/models` в нужном folder | выберите URI из discovery output |
| `OUTPUT_VALIDATION_FAILED` | локальная schema и класс ответа | упростите schema; partially valid JSON не принимайте |
| `RATE_LIMITED` | safe status/latency | уменьшите concurrency; не включайте бесконечный retry |
| `PROVIDER_UNAVAILABLE` | status page и исходящая TLS-сеть | повторите позже по bounded policy; не отключайте TLS verification |

### Локальная проверка Yandex

```bash
./tests/yandex_adapter_test.sh
```

Тест исполняет Code nodes из exports, проверяет input/folder/model validation, official endpoint/header wiring, model discovery, text/JSON normalization, representative auth/model/rate/timeout errors, redaction и отсутствие secrets. Clean import отдельно выполняется на pinned n8n `2.29.10`.

## GigaChat

Workflow: `workflows/adapters/llm-gigachat.json`. ID: `adapterGigaChatLlmV1`.

Adapter принимает тот же нормализованный запрос, что общий gateway, но требует `provider: gigachat`. Он получает временный OAuth token, вызывает GigaChat chat completion и возвращает только общий success/error contract. Authorization key, access token, raw headers и provider error body наружу не передаются.

### Проверенные официальные факты

- OAuth exchange: `POST https://ngw.devices.sberbank.ru:9443/api/v2/oauth` с form-urlencoded `scope`, заголовком UUID4 `RqUID` и долгоживущим authorization key в `Authorization: Basic ...`;
- access token действует 30 минут; token endpoint ограничен 10 запросами в секунду;
- scopes: `GIGACHAT_API_PERS`, `GIGACHAT_API_B2B`, `GIGACHAT_API_CORP`;
- основной API base: `https://gigachat.devices.sberbank.ru/api/`; для договора «Салют для Бизнеса»: `https://api.giga.chat/`;
- chat completion возвращает отдельные классы ошибок `400`, `401`, `404`, `422`, `429`, `500`;
- для TLS нужен доверенный корневой сертификат Минцифры; production-инструкция не разрешает отключать certificate verification.

Официальные источники, перепроверенные 2026-07-14:

- [Авторизация, scopes и base URLs](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/gigachat-api);
- [Получение access token](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-token);
- [Chat completions и коды ответа](https://developers.sber.ru/docs/ru/gigachat/api/reference/rest/post-chat);
- [Установка сертификатов Минцифры](https://developers.sber.ru/docs/ru/gigachat/certificates).

### Почему token не хранится между executions

Adapter хранит access token только в item data текущего execution между OAuth и HTTP Request nodes. Workflow отключает сохранение success, error и manual execution payload. Token не пишется в workflow static data, business events, fixtures или final output.

Такой per-execution cache сознательно меняет reuse на безопасность:

- параллельные executions не перезаписывают общий token и не создают refresh race;
- истёкший token не переживает рестарт и не требует ручной замены;
- каждый обычный execution выполняет один OAuth exchange;
- token с `expires_at` ближе 60 секунд обновляется до chat request;
- первый chat `401` делает ровно один новый exchange и один retry;
- второй `401` возвращает `AUTH_FAILED` с `attempts: 2`;
- HTTP nodes не используют автоматический retry.

Профиль рассчитан на небольшую нагрузку starter kit. При приближении к официальному лимиту token endpoint 10 rps нужен отдельный durable cache/lock design и concurrency test; добавлять shared static data без такой задачи запрещено.

### Создание credential

1. Создайте проект GigaChat API в личном кабинете и получите authorization key. Не копируйте access token вручную.
2. В n8n создайте credential типа **HTTP Header Auth**.
3. Name: `Authorization`.
4. Value: `Basic <authorization_key>`.
5. Сохраните credential и привяжите его к обеим OAuth nodes:
   - `Exchange Initial OAuth Token`;
   - `Exchange Refreshed OAuth Token`.
6. Убедитесь, что exported JSON содержит только credential reference, а не значение.

Authorization key является долгоживущим секретом. Не передавайте его в Set/Code node, `.env`, Git, screenshots, execution evidence или сообщения поддержки.

### Scope и API base

В `GigaChat Provider Profile` выберите только значения, соответствующие вашему договору:

| Тип доступа | `profileScope` | `profileApiBaseUrl` |
|---|---|---|
| Физическое лицо | `GIGACHAT_API_PERS` | `https://gigachat.devices.sberbank.ru/api/v1` |
| ИП/юрлицо, платный пакет | `GIGACHAT_API_B2B` | `https://gigachat.devices.sberbank.ru/api/v1` |
| ИП/юрлицо, pay-as-you-go | `GIGACHAT_API_CORP` | `https://gigachat.devices.sberbank.ru/api/v1` |
| «Салют для Бизнеса» | scope из договора | `https://api.giga.chat/v1` |

Adapter отклоняет произвольные OAuth/API URLs и неизвестные scopes до сетевого запроса. `tools` и provider-native structured output выключены. `output.mode=json` использует обычный chat response, затем локально разбирает и проверяет ограниченную JSON Schema без remote `$ref`.

### CA trust на Ubuntu 24.04

Официальная документация GigaChat требует корневой и выпускающий сертификаты Минцифры. Получите их только по официальной ссылке из документации/Госуслуг и отдельно проверьте источник и fingerprint по действующим официальным данным.

На VPS:

```bash
sudo install -d -m 0755 /usr/local/share/ca-certificates/russian-trusted
sudo install -m 0644 russian_trusted_root_ca_pem.crt /usr/local/share/ca-certificates/russian-trusted/
sudo install -m 0644 russian_trusted_sub_ca_pem.crt /usr/local/share/ca-certificates/russian-trusted/
sudo update-ca-certificates -v
trust list | grep -E 'Russian Trusted (Root|Sub) CA'
docker compose up -d --force-recreate n8n
```

Ожидаемый результат: обе CA видны в host trust store, n8n container пересоздан, а read-only `/etc/ssl/certs/ca-certificates.crt` доступен внутри как `/etc/n8n/host-ca-bundle.pem`. Compose задаёт `NODE_EXTRA_CA_CERTS` на этот файл.

Не используйте `NODE_TLS_REJECT_UNAUTHORIZED=0`, `rejectUnauthorized=false`, `allowUnauthorizedCerts` или HTTP вместо HTTPS. Если официальные fingerprints нельзя проверить, остановите setup.

### Test mode и controlled smoke

1. Импортируйте adapter; он остаётся inactive и вызывается как sub-workflow.
2. Привяжите credential и настройте scope/base.
3. Передайте минимальный запрос с неперсональным текстом и явным model ID.
4. Проверьте text response, затем `output.mode=json` с простой локальной schema.
5. Намеренно укажите неверную модель: ожидается `MODEL_NOT_FOUND` без raw provider body.
6. Для проверки rotation создайте новый authorization key, перепривяжите credential, выполните smoke, затем отзовите старый key.
7. Зафиксируйте только status, safe request ID, model и latency. Не сохраняйте prompt, key, token или headers.

Без пользовательского credential и HTTPS smoke разрешено утверждать только: JSON импортируется, branching/normalization проходят fixtures и secret scan. Нельзя утверждать, что account, scope, CA chain или provider model реально работают.

### Rotation

1. Создайте новый authorization key в личном кабинете GigaChat, не удаляя старый.
2. Обновите единственный HTTP Header Auth credential в n8n.
3. Выполните controlled smoke с неперсональным prompt.
4. Убедитесь, что OAuth и chat успешны, а новый token не появляется в outputs.
5. Отзовите старый authorization key.
6. Если старый key мог утечь, не прикладывайте его к incident evidence; укажите только время отзыва и безопасный credential ID.

Access token отдельно не ротируется и не восстанавливается: adapter получает новый автоматически на каждом execution.

### Troubleshooting

| Симптом | Безопасная проверка | Действие |
|---|---|---|
| `CONFIGURATION_ERROR` до HTTP | scope/base/profile | выберите только allowlisted значение из договора |
| OAuth `AUTH_FAILED` | credential binding и scope без показа value | перепривяжите/ротируйте authorization key |
| `CERTIFICATE_VERIFY_FAILED` | `trust list`, host bundle mount | установите обе официальные CA и пересоздайте n8n; TLS не отключайте |
| `RATE_LIMITED` на OAuth | частота executions | снизьте параллелизм; shared cache требует отдельного design |
| Первый chat `401` | final attempts | adapter обновит token сам; второй `401` требует credential/scope check |
| `MODEL_NOT_FOUND` | model ID по текущей официальной модели/account | исправьте явный ID, не включайте model discovery автоматически |
| `OUTPUT_VALIDATION_FAILED` | локальная schema и model text class | упростите поддерживаемую schema; partially valid JSON не принимается |
| `PROVIDER_UNAVAILABLE` | status/latency без raw body | проверьте сеть, CA и официальный status; не печатайте request headers |

## Локальная проверка

```bash
./tests/gigachat_adapter_test.sh
```

Тест выполняет Code nodes из export, проверяет 27 contract fixtures, endpoint/scope allowlists, execution-local token lifecycle, expiry refresh, bounded `401`, JSON validation, redaction, отсутствие TLS bypass и credential-only long-lived secret. Clean import проверяется отдельно на pinned n8n `2.29.10`.
