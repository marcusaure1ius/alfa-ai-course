# Uninstall и перенос workflow

Проверено: 2026-07-14. Runtime: n8n `2.29.10` в Compose-проекте этого репозитория.

Default uninstall → сохранение четырёх volumes → повторный start с exact workflow/encrypted-credential assertions фактически пройден в [dated lifecycle report](reports/2026-07-14-destructive-lifecycle.md). Проверка локальная и не заменяет reboot/VPS evidence.

## Что сохраняется

Обычный uninstall удаляет containers и Compose networks, но сохраняет:

- volumes `n8n_postgres_data`, `n8n_data`, `n8n_caddy_data`, `n8n_caddy_config`;
- `.env`, `config/Caddyfile` и остальные файлы проекта;
- credentials, workflows и executions внутри сохранённых данных n8n/PostgreSQL.

Script проверяет Compose working-directory каждого найденного container. При несовпадении он останавливается, чтобы не затронуть stack из другого проекта.

```bash
./scripts/uninstall.sh
```

Ожидаемый итог: строка `[OK]`, которая прямо сообщает, что persistent volumes и конфигурация сохранены. Повторный запуск безопасен: если containers уже отсутствуют, данные всё равно не удаляются.

## Безвозвратное удаление runtime data

Сначала создайте и проверьте backup. Удаление volumes необратимо и требует одновременно destructive flag и точную отдельную фразу:

```bash
./scripts/uninstall.sh \
  --delete-data \
  --confirm-delete DELETE-N8N-DATA
```

Команда удаляет Compose containers, networks и четыре persistent volume. Она не удаляет `.env`, репозиторий или backup archives. Один `--delete-data` без точной фразы завершается до обращения к Docker.

## Безопасный export

n8n должен быть запущен. Экспорт всех сохранённых draft workflow:

```bash
./scripts/export-workflows.sh
```

Ожидаемый результат:

```text
EXPORTED_WORKFLOWS=<количество>
EXPORT_DIR=<корень-проекта>/exports/workflows
```

Script вызывает официальный `n8n export:workflow --backup`, затем для каждого JSON:

- проверяет object schema, обязательный стабильный `id`, имя, nodes и connections;
- удаляет node credential references и верхнеуровневое поле credentials;
- очищает `pinData`, чтобы не переносить pinned test/customer data;
- принудительно ставит `active: false`;
- отклоняет известные embedded-secret indicators;
- записывает deterministic path `<workflow-id>.json` с mode `0600`.

`exports/` исключён из Git. Если нужен контролируемый source export, перенесите только проверенные JSON в подходящий каталог `workflows/`, снова выполните repository secret scan и review. Script никогда не вызывает `export:credentials`, особенно с `--decrypted`.

Повторный export атомарно заменяет только directory с marker `.n8n-workflow-export`. Непустой произвольный directory без marker не изменяется. Другой путь задаётся явно:

```bash
./scripts/export-workflows.sh --output-dir /secure/path/workflows
```

## Безопасный batch import

По умолчанию script рекурсивно импортирует `workflows/**/*.json`:

```bash
./scripts/import-workflows.sh
```

Один файл или отдельный каталог:

```bash
./scripts/import-workflows.sh --input workflows/core
./scripts/import-workflows.sh --input workflows/business/lead-handler.json
```

До первой записи в n8n весь batch проходит preflight. Невалидный JSON, неполная schema, embedded-secret indicator или повторяющийся `id` отменяет весь batch; для каждого файла печатается `[OK] preflight` или `[FAIL]`. Import использует только credential-free staging copies, принудительно оставляет workflows неактивными и после успешных импортов перезапускает n8n, чтобы inactive state применился также к уже работавшим schedule/cron triggers.

Во время runtime error возможен частичный результат: уже обработанные файлы остаются импортированными, а итоговая команда завершается с ошибкой и показывает per-file statuses. Исправьте причину и повторите тот же batch.

## Rerun и duplicate policy

- Каждый JSON обязан иметь стабильный `id` из букв, цифр, `_` или `-`, длиной до 128 символов.
- Два файла с одним `id` в одном batch отклоняются до изменения n8n.
- По правилам n8n import существующий workflow с тем же `id` перезаписывается. Поэтому повтор того же набора обновляет те же workflows, а не создаёт новые.
- Если нужен отдельный workflow, сначала назначьте ему новый уникальный `id` и пройдите review JSON.
- Credential references намеренно не переносятся. После import заново выберите credentials в UI, проведите documented connection/smoke test и только затем вручную publish workflow.

Фактические flags закреплённой версии проверяются тестом и соответствуют [официальным CLI commands n8n](https://docs.n8n.io/hosting/cli-commands/#import-workflows-and-credentials). Официальная документация также предупреждает, что совпадающие IDs перезаписываются; именно это поведение используется для repeatable update.

## Ошибки

| Сообщение | Действие |
|---|---|
| `Env-файл отсутствует` | Запустите installer или укажите `--env-file PATH`; не генерируйте новый encryption key поверх старых volumes. |
| `другому Compose working directory` | Не удаляйте containers вручную. Проверьте путь проекта и labels. |
| `embedded secret` | Отзовите реальный secret, удалите его из JSON и сохраните credential только в n8n credential store. |
| `duplicate id` | Оставьте один source-файл для ID либо осознанно назначьте новому workflow новый ID. |
| `n8n container не запущен` | Запустите stack и дождитесь health; uninstall при этом может работать и с остановленным stack. |
| `marker ... отсутствует` | Выберите пустой output directory или directory, ранее созданный этим export script. |

Все scripts поддерживают `--help`, не выводят `.env` или secret values и используют только Compose config текущего repository root.
