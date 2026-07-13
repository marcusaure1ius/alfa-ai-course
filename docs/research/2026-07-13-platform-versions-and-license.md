# Platform versions, deployment constraints and license research

- Дата проверки: 2026-07-13
- Задача Projects Control: `alfa-ai-course / T-0002`
- Метод: только официальные release pages, документация проектов и official image registries
- Горизонт применимости: выводы необходимо перепроверить перед каждым release и плановым обновлением

## Результат

Для первого проверяемого MVP baseline выбраны следующие версии:

| Компонент | Exact pin / baseline | Почему выбран |
|---|---|---|
| n8n | `docker.n8n.io/n8nio/n8n:2.29.10` | На дату проверки это версия, на которую указывает stable release; `2.30.4` помечена pre-release. Релиз `2.29.10` опубликован 2026-07-10. |
| PostgreSQL | `postgres:17.10-bookworm` | `17.10` — текущий minor поддерживаемой ветки 17; ветка поддерживается до 2029-11-08. Bookworm уменьшает новизну системной основы относительно trixie. |
| Caddy | `caddy:2.11.4-alpine` | `2.11.4` — latest stable Caddy от 2026-06-03 и содержит security-related fixes. |
| Docker Engine | `5:29.6.1-1~ubuntu.24.04~noble` | Проверенный пакет официального Docker apt repository для Ubuntu 24.04 amd64. Это host baseline, а не Compose image. |
| Docker Compose plugin | `5.3.1-1~ubuntu.24.04~noble` | Проверенный пакет того же официального apt repository; upstream release `v5.3.1` опубликован 2026-07-07. |

`latest`, `stable` и плавающие major/minor tags в runtime-конфигурации запрещены. Exact image tags выбраны вместо digest pins, чтобы официальные образы могли получать rebuild базового слоя без изменения версии приложения. Для release evidence необходимо записывать фактически разрешённые image digests после `docker compose pull`; это даёт audit trail, не блокируя security rebuilds.

## Обоснование выбора PostgreSQL 17

n8n поддерживает только активно сопровождаемые версии PostgreSQL. PostgreSQL 17.10 удовлетворяет этому условию и имеет поддержку до ноября 2029 года. PostgreSQL 18.4 также поддерживается и является более новой major-веткой, но MVP не использует функций PostgreSQL 18. Ветка 17 выбрана как более зрелая основа с достаточным сроком поддержки; переход на 18 требует отдельной задачи major migration с dump/restore rehearsal.

PostgreSQL рекомендует всегда использовать актуальный minor своей major-ветки. Minor update внутри 17 выполняется только после чтения release notes, backup и проверки restore. Переход между major-ветками не является обычным image update.

## Update и rollback baseline

Первая пара для реальной lifecycle-проверки:

- исходная версия: `docker.n8n.io/n8nio/n8n:2.29.9` от 2026-07-09;
- целевая версия: `docker.n8n.io/n8nio/n8n:2.29.10` от 2026-07-10;
- rollback target: `2.29.9` **только вместе с восстановлением backup, созданного непосредственно перед update**.

Официальная документация n8n рекомендует регулярно обновляться, читать release notes и сначала тестировать обновление на отдельной среде. Она описывает pull и перезапуск конкретной версии, но не обещает обратную совместимость базы после downgrade. Поэтому image-only downgrade запрещён как небезопасное предположение. Каноническая процедура rollback должна остановить stack, восстановить согласованный pre-update PostgreSQL dump, конфигурацию и persistent data, вернуть pin `2.29.9`, запустить stack и выполнить health/functional checks.

Пара `2.29.9 → 2.29.10` минимизирует поверхность изменения: это соседние patch releases одной stable minor-ветки, а `2.29.10` содержит один editor bug fix. Совместимость считается подтверждённой только после destructive lifecycle test из `T-0012`; до этого это выбранная тестовая пара, а не заявление о фактически пройденном откате.

## Обязательные deployment constraints

### n8n и PostgreSQL

- `DB_TYPE=postgresdb` и все `DB_POSTGRESDB_*` значения задаются явно; PostgreSQL не публикует host port.
- `/home/node/.n8n` остаётся persistent volume даже при PostgreSQL: официальная документация указывает, что там остаются encryption keys, logs и другие важные assets.
- `N8N_ENCRYPTION_KEY` генерируется до первого запуска, хранится постоянно и не выводится в logs.
- `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true` и `N8N_RUNNERS_ENABLED=true` задаются явно по официальному Docker example.
- `TZ` и `GENERIC_TIMEZONE` задаются одинаково.
- Pruning остаётся включённым: `EXECUTIONS_DATA_PRUNE=true`; конкретные `EXECUTIONS_DATA_MAX_AGE` и `EXECUTIONS_DATA_PRUNE_MAX_COUNT` должны быть видны пользователю в `.env.example` и operations guide.

### Reverse proxy и URL

- Используется отдельный subdomain, а не path-prefix deployment.
- Внутри Compose n8n слушает HTTP на `5678`; TLS завершается в Caddy.
- Публичные значения задаются явно: `N8N_HOST=<fqdn>`, `N8N_PROTOCOL=https`, `N8N_EDITOR_BASE_URL=https://<fqdn>/`, `WEBHOOK_URL=https://<fqdn>/`.
- Для одного Caddy proxy задаётся `N8N_PROXY_HOPS=1`.
- Caddy публикует только `80/443`; n8n и PostgreSQL доступны только во внутренних networks.

### Health и migration gates

- PostgreSQL health проверяется `pg_isready` до старта n8n.
- n8n liveness endpoint — `/healthz` (default `N8N_ENDPOINT_HEALTH=healthz`).
- External validation отдельно проверяет HTTPS, certificate, editor URL и production webhook path; HTTP 200 от proxy сам по себе не доказывает исправность workflow.
- Перед любым n8n update: release notes → preflight → backup → проверка restore metadata → pull exact tag → restart → health → smoke test.
- Перед PostgreSQL minor update: release notes и backup. Перед major update: отдельный план миграции и фактическая restore rehearsal.
- Все n8n components одного deployment должны обновляться одновременно до одной версии. В базовом профиле это один n8n service.

## License assessment

n8n распространяет основную codebase под Sustainable Use License (fair-code, не OSI open source). Лицензия разрешает использование и модификацию для собственных внутренних бизнес-задач, а официальные примеры отдельно разрешают consulting, создание workflow и поддержку n8n на внутреннем сервере компании. Она не разрешает white-label offering и hosting с платным доступом пользователей без отдельного соглашения.

Текущий MVP укладывается в заявленный разрешённый сценарий при соблюдении всех условий:

- каждый участник устанавливает и контролирует собственный экземпляр для внутренних задач;
- комплект продаёт/передаёт обучение, конфигурацию, workflow и поддержку, но не доступ к размещённому n8n;
- проект не скрывает notices, не использует white label и не представляет n8n как собственный SaaS;
- credentials и данные принадлежат организации участника и не собираются в общий hosted backend курса.

Если модель изменится на managed hosting, multi-tenant access, embedded product с пользовательскими credentials или перепродажу доступа, это заключение неприменимо: release блокируется до письменного уточнения у n8n или отдельного коммерческого соглашения.

Это продуктовая интерпретация официальных материалов, а не юридическая консультация. При сомнениях следует обратиться по адресу `license@n8n.io` и, при необходимости, к квалифицированному юристу.

## Официальные источники

Проверены 2026-07-13:

- [n8n 2.29.10 release](https://github.com/n8n-io/n8n/releases/tag/n8n%402.29.10)
- [n8n 2.29.9 release](https://github.com/n8n-io/n8n/releases/tag/n8n%402.29.9)
- [n8n self-hosted update guidance](https://docs.n8n.io/hosting/installation/updating/)
- [n8n Docker installation and update guidance](https://docs.n8n.io/hosting/installation/docker/)
- [n8n database settings](https://docs.n8n.io/hosting/configuration/supported-databases-settings/)
- [n8n deployment environment variables](https://docs.n8n.io/hosting/configuration/environment-variables/deployment/)
- [n8n endpoint environment variables](https://docs.n8n.io/hosting/configuration/environment-variables/endpoints/)
- [n8n execution retention variables](https://docs.n8n.io/hosting/configuration/environment-variables/executions/)
- [n8n Sustainable Use License explanation](https://docs.n8n.io/sustainable-use-license/)
- [n8n Sustainable Use License text](https://github.com/n8n-io/n8n/blob/master/LICENSE.md)
- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- [Official Postgres image tags source](https://github.com/docker-library/official-images/blob/master/library/postgres)
- [Caddy 2.11.4 release](https://github.com/caddyserver/caddy/releases/tag/v2.11.4)
- [Official Caddy image](https://hub.docker.com/_/caddy)
- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose plugin installation](https://docs.docker.com/compose/install/linux/)
- [Docker Compose v5.3.1 release](https://github.com/docker/compose/releases/tag/v5.3.1)

## Требует дальнейшего evidence

- Фактический pull и multi-architecture availability выбранных images проверяет `T-0005`.
- Реальный update/rollback с восстановлением backup проверяет `T-0012`.
- Security advisories перепроверяются непосредственно перед release в `T-0033`.
- Лицензионная оценка пересматривается при любом изменении бизнес-модели или способа hosting.
