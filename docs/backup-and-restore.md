# Backup и restore

Backup содержит secrets, PostgreSQL data, n8n binary/config state и TLS state. Храните archive и `.sha256` как секретные материалы: mode `0600`, защищённая копия вне VPS и ограниченный доступ.

## Создание backup

```bash
./scripts/backup.sh
```

Успех завершается строкой `BACKUP_ARCHIVE=<абсолютный-путь>`. Убедитесь, что рядом есть файл с тем же именем и suffix `.sha256`; не выводите содержимое archive или `runtime.env`.

Во время snapshot n8n и Caddy кратковременно останавливаются, чтобы logical PostgreSQL dump и volume data относились к одному quiesced state. После архивации ранее работающие сервисы запускаются снова.

Состав `n8n-backup-v1-*.tar.gz`:

- `manifest.json` со schema version, временем, consistency mode и exact image versions;
- `checksums.sha256` для каждого payload и manifest;
- `payload/postgres.dump` в custom pg_dump format;
- `payload/runtime.env` с database password и `N8N_ENCRYPTION_KEY`;
- archives volumes `n8n_data`, `n8n_caddy_data`, `n8n_caddy_config`.

Рядом создаётся outer checksum `<archive>.sha256`, позволяющий обнаружить повреждение до extraction. Оба файла имеют mode `0600`.

Опциональная retention удаляет только более старые archives этого формата в указанном каталоге:

```bash
./scripts/backup.sh --output-dir /secure/backups --keep 7
```

Default `--keep 0` ничего не удаляет.

## Restore

> **Осторожно:** restore заменяет database, n8n/Caddy volumes и `.env`. Сначала сохраните archive и checksum вне VPS. Не используйте `--yes`, пока не проверили правильный файл и не готовы к overwrite.

```bash
./scripts/restore.sh /secure/backups/n8n-backup-v1-....tar.gz
```

До изменения runtime restore проверяет outer checksum, отсутствие path traversal, обязательные файлы, внутренние checksums, schema/project и exact image compatibility. Любое несовпадение останавливает операцию.

Если `.env` или named volumes уже существуют, overwrite требует подтверждение (`--yes` для automation) и успешный pre-restore safety backup. При ошибке после начала mutation скрипт автоматически пытается вернуть safety backup. Путь safety archive печатается без его содержимого.

Restore восстанавливает env с mode `0600`, полностью заменяет n8n/Caddy volume content, пересоздаёт целевую PostgreSQL database из logical dump, запускает stack и выполняет local doctor. Cross-major и смена PostgreSQL database/user не поддерживаются.

Успех печатает `RESTORED_ARCHIVE=<путь>`. При overwrite существующей установки также появляется `SAFETY_ARCHIVE=<путь>` — сохраните его до функциональной проверки. Любой `[FAIL]` или отсутствие этих строк означает, что recovery нельзя считать завершённым.

## Проверка recovery

Локальный disposable rehearsal с полным удалением PostgreSQL database, restore и exact workflow/credential hashes прошёл 2026-07-14. Среда, команды, checksums и непроверенные VPS gaps зафиксированы в [dated lifecycle report](reports/2026-07-14-destructive-lifecycle.md).

После restore:

```bash
./scripts/doctor.sh --local-only
./scripts/doctor.sh
```

Проверьте workflows, credential decryption и несколько binary-data executions вручную. Реальным доказательством recovery считается rehearsal с удалением тестового state и восстановлением из archive; простое создание tar-файла недостаточно.

## Границы

- Remote object storage и автоматическое шифрование archive не входят в MVP.
- Archive уже содержит secrets; шифруйте транспорт/внешнее хранилище средствами выбранной инфраструктуры.
- PostgreSQL major migration и cross-identity restore требуют отдельного migration procedure.
- Caddy certificate state включён, но certificate может быть безопасно перевыпущен при корректном DNS.
