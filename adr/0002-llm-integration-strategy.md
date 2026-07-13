# ADR-0002: Заменяемый LLM Gateway без обязательного proxy

- Статус: Accepted for MVP direction
- Дата: 2026-07-13

## Context

Workflow должны работать с несколькими внешними LLM providers, но их API, authentication и степень OpenAI-совместимости различаются. Дублирование provider logic в каждом workflow усложняет тестирование и смену поставщика.

## Decision

Business workflows используют reusable `LLM Gateway` sub-workflow с нормализованным контрактом. Сначала реализуется generic OpenAI-compatible path с optional model discovery и manual model ID fallback. Yandex AI Studio и GigaChat добавляются через provider-specific adapters только после проверки официальных API и возможностей актуальной версии n8n.

Credentials остаются в n8n credential store и не попадают в workflow JSON или execution output. Connection Test отдельно проверяет model discovery, test completion и понятную диагностику.

LiteLLM не входит в default profile. Он может стать optional profile только через новый ADR, если измеренные ограничения нативного n8n + gateway нельзя устранить проще.

## Consequences

- Business workflows не зависят от деталей provider authentication.
- Появляется один стабильный контракт и единая зона diagnostic/error handling.
- Нужны capability matrix и contract tests для каждого provider.
- GigaChat OAuth lifecycle и Yandex identifiers нельзя считать OpenAI-identical без research evidence.
