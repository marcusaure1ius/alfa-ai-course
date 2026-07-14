# Диагностика

`scripts/doctor.sh` создаёт read-only redacted report без чтения raw logs и без автоматического исправления проблем.

```bash
./scripts/doctor.sh
```

Для post-install проверки до распространения DNS:

```bash
./scripts/doctor.sh --local-only
```

Каждая строка содержит `OK`, `WARN` или `FAIL`, стабильный ключ проверки и remediation hint. Exit code: `0` — только OK, `1` — есть WARN, `2` — есть FAIL. Это позволяет использовать doctor в automation без разбора текста.

## Что проверяется

| Группа | Проверки |
|---|---|
| Host | Ubuntu 24.04, amd64, RAM и свободный disk |
| Config | наличие и mode `0600` env-файла, формат FQDN |
| Runtime | Docker/Compose, валидность config, running/healthy трёх containers |
| Internal | `pg_isready` внутри PostgreSQL, `/healthz` внутри n8n |
| URLs | editor/webhook base URL внутри n8n согласованы с `N8N_HOST` |
| External | DNS A-record, public editor HTTPS и TLS certificate отдельно |

Doctor читает из env только `N8N_HOST`, `POSTGRES_DB` и `POSTGRES_USER`. Password и encryption key не выводятся и не передаются в команды. External checks не доказывают доставку конкретного webhook или provider credentials.

## Карта симптомов

| Ключ | Что делать |
|---|---|
| `runtime.docker` | проверить `systemctl status docker`, Compose plugin и sudo |
| `runtime.<service>` | проверить `docker compose ps` и `docker compose logs <service>` |
| `service.postgres` | проверить postgres health, database/user и volume |
| `service.n8n` | проверить n8n health и соединение с PostgreSQL |
| `config.public_urls` | исправить `N8N_HOST`, editor/webhook URL и пересоздать n8n |
| `external.dns` | создать A-record и дождаться propagation |
| `external.https` | проверить DNS, TCP 80/443 и Caddy logs |
| `external.certificate` | проверить ACME email, DNS и Caddy certificate storage |

`--local-only` намеренно возвращает WARN: после появления DNS нужно обязательно выполнить полный запуск. Реальная проверка VPS/ACME требует доступного домена и не заменяется локальной симуляцией.

Пошаговые сценарии `симптом → проверка → решение` для runtime, backup/restore, update/rollback, firewall и доступа собраны в [Troubleshooting](troubleshooting.md).
