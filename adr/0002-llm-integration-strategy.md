# ADR-0002: Заменяемый LLM Gateway без обязательного proxy

- Статус: Accepted, provider paths verified 2026-07-13
- Дата: 2026-07-13

## Context

Workflow должны работать с несколькими внешними LLM providers, но их API, authentication и степень OpenAI-совместимости различаются. Дублирование provider logic в каждом workflow усложняет тестирование и смену поставщика.

## Decision

Business workflows используют reusable `LLM Gateway` sub-workflow с [нормализованным контрактом](../docs/contracts/llm-gateway.md).

- Generic OpenAI-compatible path использует native OpenAI Chat Model только после Connection Test. Responses API выключен; `/models`, tool calling и structured output проверяются раздельно.
- При недоступном `/models` используется manual model ID; если обязательный credential test n8n блокирует native path, gateway переключается на HTTP Request adapter.
- Yandex AI Studio — native candidate с official OpenAI-compatible Base URL и полным `gpt://.../latest` URI, но до authenticated contract test не считается verified runtime integration.
- GigaChat использует HTTP Request adapter. Authorization key обменивается на временный token один раз на execution; после `401` допускается один новый exchange и один retry.
- Bitrix24 не является частью LLM Gateway, но следует той же adapter boundary и использует canonical OAuth 2.0 credential path.

Credentials остаются в n8n credential store и не попадают в workflow JSON, fixtures, normalized output или business logs. Connection Test отдельно проверяет model discovery, test completion, invalid-model error и включаемые capability flags. Provider raw response и tokens наружу не возвращаются.

LiteLLM не входит в default profile. Он может стать optional profile только через новый ADR, если измеренные ограничения нативного n8n + gateway нельзя устранить проще.

## Consequences

- Business workflows не зависят от деталей provider authentication.
- Появляется один стабильный контракт и единая зона diagnostic/error handling.
- Нужны capability matrix и contract tests для каждого provider.
- Tool/JSON capabilities включаются независимо; обычный completion не доказывает их.
- Per-execution OAuth проще и безопаснее shared cache, но ограничивает high-throughput GigaChat profile.
- Evidence and remaining runtime gates: [provider capability matrix](../docs/research/provider-capabilities.md).
