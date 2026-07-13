# ADR-0001: Базовая платформа и границы runtime

- Статус: Accepted
- Дата: 2026-07-13

## Context

Целевой пользователь не имеет DevOps-опыта и должен получить production-minded систему за 15–30 минут. Поддержка множества платформ и компонентов увеличивает число failure modes и объём инструкции.

## Decision

MVP поддерживает один VPS с Ubuntu 24.04 LTS x86_64 и Docker Compose. Базовый stack состоит из официального n8n Community Edition, PostgreSQL и Caddy. Caddy завершает TLS; PostgreSQL не публикует host ports; данные сервисов разнесены по volumes; health checks и restart policies обязательны.

Redis, queue workers, Kubernetes, локальные LLM, vector databases и LiteLLM не входят в default profile. Firewall является opt-in действием с отдельным подтверждением и защитой текущего SSH-доступа.

## Consequences

- Меньше конфигурационной поверхности и проще диагностика для новичка.
- Нет high availability и горизонтального масштабирования в MVP.
- Другие ОС, архитектуры и reverse proxies требуют отдельных задач и ADR.
- Конкретные версии выбираются после официального research согласно ADR-0003.
