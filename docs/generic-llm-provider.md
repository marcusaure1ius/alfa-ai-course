# Generic OpenAI-compatible provider

Реализация contract `1.0.0` состоит из [`Core - LLM Gateway (Generic)`](../workflows/core/llm-gateway.json) и [`Diagnostics - Generic LLM Connection Test`](../workflows/diagnostics/generic-llm-connection-test.json). Оба workflow импортируются выключенными и требуют user-side configuration.

## Настройка

1. В n8n создайте **HTTP Header Auth** credential: header name `Authorization`, value `Bearer <provider-key>`. Ключ не помещайте в workflow JSON, input, Sticky Note или Git.
2. Импортируйте оба JSON и привяжите credential к HTTP Request nodes.
3. В `Test Profile - Edit Me` задайте HTTPS Base URL, заканчивающийся на `/v1`, и explicit model ID.
4. Запустите Connection Test. Он вызывает `GET /models`, определяет `available`/`unavailable`, но при недоступном discovery всё равно проверяет manual model через `POST /chat/completions`.
5. После успешного теста перенесите тот же Base URL в `Generic Provider Profile` gateway. Business workflow передаёт только contract input; Base URL и credential не являются input.

## Результаты и ошибки

Gateway возвращает только нормализованный success/error из [канонического контракта](contracts/llm-gateway.md). Raw body, headers, prompt и credential metadata не возвращаются. Connection Test различает success, auth, model, rate-limit, network/5xx и invalid response. Недоступный `/models` даёт warning `MODEL_DISCOVERY_UNAVAILABLE`, а не ложный success/failure manual model.

## Timeout, retry и стоимость

- discovery timeout — 30 секунд, completion timeout — 120 секунд;
- transport error и `5xx` нормализуются как retryable `PROVIDER_UNAVAILABLE`, `429` — как retryable `RATE_LIMITED`;
- автоматический application retry в MVP выключен, чтобы diagnostic или caller незаметно не удвоил billable request; повтор выполняется осознанно после backoff;
- `401/403`, invalid model и invalid response не retryable;
- Responses API, tools и provider-native structured output выключены до отдельных authenticated contract tests;
- JSON mode добавляет bounded schema instruction, выполняет local parse и проверяет ограниченную JSON Schema без `$ref`; mismatch возвращает `OUTPUT_VALIDATION_FAILED`;
- provider-native JSON Schema и automatic repair остаются выключенными и не заявляются как готовая provider capability.

## Evidence boundary

Clean import и fixture tests подтверждают schema, secret boundary и error mapping. Единая [проверочная матрица](llm-providers.md#единая-проверочная-матрица) прогоняет тот же контракт для Generic, Yandex и GigaChat. Эти проверки не подтверждают конкретного внешнего provider без его Base URL/credential. Заполненный Connection Test с реальными credentials должен быть приложен как отдельное redacted evidence; до этого capability остаётся `external_unverified`.

Официальные справочные материалы n8n: [Server CLI import](https://docs.n8n.io/hosting/cli-commands/#import-workflows-and-credentials), [HTTP Request node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/) и [sub-workflows](https://docs.n8n.io/flow-logic/subworkflows/).
