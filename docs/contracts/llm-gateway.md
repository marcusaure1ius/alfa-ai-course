# LLM Gateway contract

- Версия контракта: `1.0.0`
- Статус: Accepted for MVP
- Проверено: 2026-07-13
- Architecture decision: [ADR-0002](../../adr/0002-llm-integration-strategy.md)
- Capability evidence: [provider matrix](../research/provider-capabilities.md)
- Generic implementation: [workflow and setup reference](../generic-llm-provider.md)

## Назначение

Business workflows вызывают только reusable `LLM Gateway`. Они не знают Base URL, auth lifecycle и raw response конкретного provider. Контракт минимален: обычный chat и локально проверяемый JSON; Agents/tools не входят в обязательное ядро.

## Input

```json
{
  "requestId": "optional-caller-id",
  "provider": "generic",
  "model": "provider-specific-model-id",
  "messages": [
    { "role": "system", "content": "You are a concise assistant." },
    { "role": "user", "content": "Summarize this text." }
  ],
  "temperature": 0.2,
  "maxTokens": 1000,
  "output": {
    "mode": "text",
    "schema": null
  },
  "capabilities": {
    "tools": false,
    "providerStructuredOutput": false
  }
}
```

Required:

- `provider`: `generic`, `yandex` или `gigachat`;
- `model`: непустая provider-specific строка; для Yandex полный `gpt://<folder>/<model>/latest` URI;
- `messages`: от 1 до 100 элементов, роли только `system`, `user`, `assistant`, непустой string `content`;
- `output.mode`: `text` или `json`.

Defaults and limits:

- `temperature`: `0.2`, допустимо `0..1`;
- `maxTokens`: `1000`, допустимо `1..8192`, затем provider может применить более строгий limit;
- `requestId`: если отсутствует, gateway создаёт непрозрачный UUID;
- `output.schema`: обязателен для `json`, JSON Schema object без remote references; `$ref` не поддерживается в MVP;
- неизвестные поля input отклоняются как `INVALID_REQUEST`, а не молча передаются provider.

`credentialId`, API key, Base URL и OAuth token не являются input: adapter configuration связывает provider profile с credential внутри n8n.

## Success output

```json
{
  "ok": true,
  "requestId": "opaque-id",
  "provider": "generic",
  "model": "resolved-model-id",
  "content": "Result text",
  "json": null,
  "usage": {
    "inputTokens": null,
    "outputTokens": null,
    "totalTokens": null
  },
  "capabilitiesUsed": [],
  "warnings": []
}
```

Rules:

- для `text` поле `content` содержит строку, `json` равно `null`;
- для `json` поле `json` содержит validated object/array, `content` содержит исходный model text только внутри gateway execution и наружу равно `null`;
- неизвестные provider usage fields не угадываются: отсутствующие значения остаются `null`;
- raw provider response, headers, credential metadata и token никогда не возвращаются;
- `warnings` содержит только безопасные machine-readable codes, например `MODEL_DISCOVERY_UNAVAILABLE`.

## Error output

Gateway не выбрасывает provider-specific body в business workflow. Он возвращает:

```json
{
  "ok": false,
  "requestId": "opaque-id",
  "provider": "gigachat",
  "model": "requested-model-id",
  "error": {
    "code": "AUTH_FAILED",
    "message": "Provider authentication failed",
    "retryable": false,
    "httpStatus": 401,
    "attempts": 2
  },
  "warnings": []
}
```

Allowed `error.code` values:

| Code | Retryable | Meaning |
|---|---:|---|
| `INVALID_REQUEST` | no | Input contract validation failed |
| `CONFIGURATION_ERROR` | no | Provider profile/model/credential mapping is incomplete |
| `AUTH_FAILED` | no | Credential rejected or OAuth refresh failed |
| `MODEL_NOT_FOUND` | no | Explicit model ID is unavailable |
| `CAPABILITY_UNSUPPORTED` | no | Requested tools/schema mode is not verified for profile |
| `RATE_LIMITED` | yes | Provider returned rate limit; honor bounded retry/backoff policy |
| `PROVIDER_TIMEOUT` | yes | Request exceeded configured timeout |
| `PROVIDER_UNAVAILABLE` | yes | Network/5xx failure after bounded attempts |
| `INVALID_PROVIDER_RESPONSE` | no | Response shape cannot be normalized |
| `OUTPUT_VALIDATION_FAILED` | no | JSON cannot be parsed/repaired/validated |
| `INTERNAL_ERROR` | no | Unexpected gateway failure with safe diagnostic ID |

Provider response bodies are redacted from `message`. Detailed debugging evidence may contain status, timing and safe request ID, but not prompts, personal data or secrets by default.

## Retry and timeout policy

- Один provider request имеет default timeout `120` seconds; value is deployment configuration, not caller input.
- Retry допускается только для transport failure, `429` и `5xx`: максимум `2` retries with bounded exponential backoff and jitter.
- `400`, `403`, invalid model и schema errors не retry.
- Generic/Yandex `401` не retry автоматически.
- GigaChat `401`: invalidate execution token, perform one OAuth exchange and retry original request exactly once; затем `AUTH_FAILED`.
- Business workflow получает один final normalized result and never implements its own provider retry.

## JSON output policy

1. Validate input schema locally before provider call.
2. Use provider-native structured output only when corresponding profile flag passed a contract test.
3. Otherwise request JSON in prompt, parse locally and validate against schema.
4. On parse/validation failure perform at most one repair request containing validation errors but no secrets.
5. If repair fails, return `OUTPUT_VALIDATION_FAILED`; never pass partially valid JSON as success.

Tool calling is disabled in contract `1.0.0` by default. `capabilities.tools=true` succeeds only for an explicitly tested profile and future compatible tool schema; otherwise gateway returns `CAPABILITY_UNSUPPORTED` before provider call.

## Provider profiles

### `generic`

- HTTPS Base URL, Bearer credential and manual model ID are required.
- Native OpenAI Chat Model requires successful `/models` and completion Connection Test.
- Responses API is off.
- If `/models` or native credential validation is incompatible, use HTTP Request adapter.

### `yandex`

- Base URL: `https://ai.api.cloud.yandex.net/v1`.
- Model is a full `gpt://.../latest` URI.
- Native path remains disabled until authenticated n8n contract test succeeds; HTTP adapter is fallback.
- Tools and provider-native structured output are off until separately verified.

### `gigachat`

- HTTP Request adapter only in default profile.
- Authorization key and scope live in encrypted credential.
- OAuth access token is acquired once per execution and never persisted or returned.
- API base is selected by account contract; business-only structured output is not assumed.

## Secret rules

- Workflow JSON contains credential references only, never credential values.
- API keys, Basic authorization keys, OAuth client secrets, access/refresh tokens and full Bitrix24 webhook URLs are prohibited in Git, fixtures, pin data, logs and error output.
- `N8N_ENCRYPTION_KEY` is stable, generated before first start, stored only in `.env` mode `0600`/backup secret material and never regenerated during update.
- Export/import strips credential bindings where necessary and requires user-side rebinding.
- Host environment access from Code/expressions is not enabled to bypass credential storage.
- Secret scan is a release gate; suspected leakage invalidates the credential and blocks release until rotation.

## Connection Test acceptance

Each provider profile must record check date and evidence for:

1. credential/auth success without secret output;
2. model discovery status (`available`, `unavailable`, `unsupported`);
3. minimal completion with manual model ID;
4. intentionally invalid model producing `MODEL_NOT_FOUND`;
5. JSON contract if enabled;
6. tool call contract if enabled;
7. timeout/rate/auth error normalization;
8. no credential or prompt leakage in exported workflow and logs.

Unverified capability remains off; documentation never upgrades it based only on marketing compatibility language.
