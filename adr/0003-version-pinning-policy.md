# ADR-0003: Проверяемые и явно закреплённые версии

- Статус: Accepted, baseline verified 2026-07-13
- Дата: 2026-07-13

## Context

Теги `latest`, недатированные инструкции и предположения об API делают установку невоспроизводимой. Одновременно конкретные версии быстро устаревают и не должны выбираться по памяти на foundation-этапе.

## Decision

Все container images и совместимые update/rollback пары закрепляются явно. Перед первым pin и каждым плановым обновлением отдельная research-задача проверяет официальные release notes, документацию, security notices, compatibility и лицензионные условия. Результат содержит дату проверки, ссылки, выбранную версию, причины и rollback target.

Проверенный 2026-07-13 baseline:

| Компонент | Pin |
|---|---|
| n8n | `docker.n8n.io/n8nio/n8n:2.29.10` |
| PostgreSQL | `postgres:17.10-bookworm` |
| Caddy | `caddy:2.11.4-alpine` |
| Docker Engine, Ubuntu 24.04 amd64 | `5:29.6.1-1~ubuntu.24.04~noble` |
| Docker Compose plugin, Ubuntu 24.04 amd64 | `5.3.1-1~ubuntu.24.04~noble` |

Первая lifecycle test pair для n8n — `2.29.9 → 2.29.10`. Rollback означает возврат image pin на `2.29.9` **и восстановление согласованного pre-update backup**. Image-only downgrade не считается допустимой стратегией, поскольку официальная документация не обещает обратную совместимость выполненных database migrations.

Exact application tags обязательны. Image digests записываются в release evidence после pull, но не закрепляются в Compose baseline: это позволяет official images получать rebuild базового слоя без ложного изменения версии приложения.

Автоматическое бесконтрольное обновление major/minor версий не используется. `update.sh` принимает явно разрешённую версию, создаёт backup и проверяет health; rollback опирается на документированную совместимую пару.

Полное dated обоснование, deployment constraints, license assessment и официальные источники: [`docs/research/2026-07-13-platform-versions-and-license.md`](../docs/research/2026-07-13-platform-versions-and-license.md).

## Consequences

- Сборка воспроизводима, а claims можно проверить.
- Release maintenance требует регулярного research и обновления ADR/changelog.
- Baseline устаревает и должен перепроверяться перед каждым release и плановым update.
- PostgreSQL major upgrade требует отдельного migration decision и restore rehearsal.
