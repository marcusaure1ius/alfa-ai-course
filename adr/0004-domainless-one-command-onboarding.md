# ADR-0004: Domainless one-command onboarding

- Статус: Accepted, distribution published in GitHub Releases
- Дата: 2026-07-14
- Supersedes: часть onboarding-решения ADR-0001, где домен считался предварительным условием

## Context

Типичный участник курса не владеет доменом и не должен изучать registrar, authoritative DNS и ACME до первого запуска n8n. Предыдущий путь требовал домен, ручную A-запись, локальный Git checkout, archive, checksum, `scp` и несколько команд. Это противоречит продуктовой цели для предпринимателя без DevOps-опыта.

Основной install path OpenAI Codex на Mac/Linux показывает одну команду `curl -fsSL https://chatgpt.com/codex/install.sh | sh`. Для starter kit нужна такая же пользовательская форма, но с дополнительными server-side гарантиями: exact release, checksum, persistent secrets и безопасный повторный запуск.

## Decision

После создания VPS и входа в shell основной путь состоит из одной команды `curl -fsSL <stable HTTPS URL>/install.sh | sh`.

Публикуемый `install.sh` является автономным артефактом: он содержит `git archive` exact commit и его SHA-256, отклоняет повреждённый payload, устанавливает release в `/opt/n8n-entrepreneur-starter-kit` и запускает внутренний installer. Артефакт не использует `latest`.

Если пользователь не передал `N8N_HOST`, внутренний installer определяет публичный IPv4 через HTTPS, формирует `n8n-<IPv4-с-дефисами>.sslip.io` и проверяет, что DNS возвращает тот же IPv4. Несовпадение останавливает установку. Caddy выпускает обычный сертификат для этого hostname. Собственный домен и ACME contact email не являются обязательными; custom FQDN остаётся поддержанным override и advanced path.

## Consequences

- Покупка домена, ручной DNS и передача archive исчезают из базового onboarding.
- Создание и оплата VPS остаются отдельным provider step: bootstrap не получает billing credentials пользователя.
- `sslip.io` становится внешней доступностной зависимостью стартового адреса. При сбое installer останавливается и предлагает custom `N8N_HOST`; он не переходит на небезопасный HTTP или self-signed TLS.
- Изменение публичного IPv4 меняет стартовый hostname; для долгоживущих интеграций рекомендуется закреплённый IP или собственный домен.
- `curl | sh` допустим только для опубликованного reviewable артефакта по HTTPS, собранного из exact commit и содержащего checksum. Этот gate закрыт release `v0.1.0`: проект использует Apache-2.0, GitHub Releases stable channel и versioned checksum asset.

## Evidence

- [OpenAI Codex README](https://github.com/openai/codex#installing-and-running-codex-cli) — эталон формы команды, проверено 2026-07-14.
- [sslip.io](https://sslip.io/) — IP-derived DNS и HTTP-01 TLS, проверено 2026-07-14.
- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https) — автоматическое управление сертификатами для публичных hostnames, проверено 2026-07-14.
