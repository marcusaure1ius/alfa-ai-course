# ADR-0001: Базовая платформа и границы runtime

- Статус: Accepted, implementation baseline verified 2026-07-13
- Дата: 2026-07-13

## Context

Целевой пользователь не имеет DevOps-опыта и должен получить production-minded систему за 15–30 минут. Поддержка множества платформ и компонентов увеличивает число failure modes и объём инструкции.

## Decision

MVP поддерживает один VPS с Ubuntu 24.04 LTS x86_64 и Docker Compose. Базовый stack состоит из официального n8n Community Edition, PostgreSQL и Caddy. Caddy завершает TLS; PostgreSQL не публикует host ports; данные сервисов разнесены по volumes; health checks и restart policies обязательны.

Redis, queue workers, Kubernetes, локальные LLM, vector databases и LiteLLM не входят в default profile. Firewall является opt-in действием с отдельным подтверждением и защитой текущего SSH-доступа.

Default security posture: наружу публикуются только Caddy `80/443`; n8n и PostgreSQL остаются во внутренних networks; Docker socket, privileged mode и отключение TLS verification запрещены; `.env` имеет `0600`; постоянный `N8N_ENCRYPTION_KEY` создаётся до первого запуска. Execution pruning включён с baseline `168` часов и `10000` executions. Diagnostics/personalization выключены, а доступ workflow nodes к host environment не включается для передачи provider secrets.

Canonical Bitrix24 profile использует OAuth 2.0 credential. Webhook URL с бессрочным secret в path не входит в экспортируемые workflow. Managed hosting, multi-tenant access и white label находятся за пределами MVP и требуют нового license decision.

## Consequences

- Меньше конфигурационной поверхности и проще диагностика для новичка.
- Нет high availability и горизонтального масштабирования в MVP.
- Другие ОС, архитектуры и reverse proxies требуют отдельных задач и ADR.
- Exact versions и rollback constraints определены в ADR-0003 и перепроверяются перед release/update.
- Более строгие secret boundaries немного усложняют onboarding, но сохраняют переносимость workflow без credential leakage.
- Dated evidence: [platform/version/license research](../docs/research/2026-07-13-platform-versions-and-license.md) и [provider capabilities](../docs/research/provider-capabilities.md).
