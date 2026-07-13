# LLM providers

Проверено: 2026-07-14. Gateway contract: `1.0.0`. Pinned n8n: `2.29.10`.

Документ описывает provider-specific setup поверх общего [LLM Gateway contract](contracts/llm-gateway.md). Реальный provider smoke не выполнен: в репозитории нет пользовательских credentials, а локальные fixtures проверяют только exported workflow contract и безопасную нормализацию.

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
