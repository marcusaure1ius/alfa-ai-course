# Update и rollback

MVP разрешает только проверенную в dated research пару n8n `2.29.9 → 2.29.10`. Любая другая версия, floating tag, произвольный downgrade или PostgreSQL major migration отклоняются. Перед плановым release заново проверьте official release notes, security notices и [ADR-0003](../adr/0003-version-pinning-policy.md), затем обновите allowlist отдельной задачей.

## Update

> **Осторожно:** update изменяет runtime и database state. Не запускайте его без места для backup и окна восстановления. `--yes` убирает только prompt, но не делает неподдерживаемую пару безопасной.

Исходный `.env` должен явно содержать `N8N_VERSION=2.29.9`, а PostgreSQL и n8n должны работать:

```bash
./scripts/update.sh --to 2.29.10
```

Скрипт требует подтверждение, создаёт согласованный pre-update backup, сохраняет metadata атомарно в `.lifecycle/update-state.env`, загружает exact target image, меняет только `N8N_VERSION`, запускает stack и требует успешный local doctor. Secrets и env content не печатаются. Для automation доступен `--yes`, но target всё равно обязан входить в allowlist.

Если backup или image pull не завершились, runtime не изменяется. Ошибка после mutation возвращает non-zero и печатает точную команду `rollback.sh` и путь pre-update archive. Metadata остаётся в `update_pending`, чтобы recovery был доступен.

Успешный update печатает `UPDATED_VERSION=2.29.10`, `PREVIOUS_VERSION=2.29.9`, `BACKUP_ARCHIVE=<путь>` и `STATE_FILE=<путь>`. Не удаляйте эти файлы до завершения проверки.

## Restore-based rollback

> **Осторожно:** rollback — это полный restore pre-update state, а не смена image tag. Изменения, записанные после update, будут заменены; `restore.sh` сначала создаёт forward safety backup.

```bash
./scripts/rollback.sh
```

Rollback разрешён только для metadata `2.29.10 → 2.29.9`, требует локальное наличие exact old image и восстанавливает **полный pre-update backup** через `restore.sh`: env pin, PostgreSQL и n8n/Caddy volumes. Image-only downgrade запрещён, потому что database migration может быть необратима. Перед overwrite `restore.sh` создаёт дополнительный safety backup текущего state; его путь сохраняется как `FORWARD_BACKUP_ARCHIVE`.

Успех печатает `ROLLED_BACK_VERSION=2.29.9`, `RESTORED_ARCHIVE=<путь>` и, при наличии текущего state, `FORWARD_BACKUP_ARCHIVE=<путь>`.

## Metadata и changelog procedure

State-файл имеет mode `0600` и атомарно хранит status, current/previous version, pre-update archive и UTC timestamp. После rollback он также содержит forward safety archive. Не редактируйте metadata вручную.

Для каждой новой пары отдельная research/change задача должна:

1. записать дату, official sources, source/target versions и migration caveats в research и ADR-0003;
2. добавить только эту exact pair в scripts и tests;
3. выполнить disposable destructive rehearsal: old version с данными → backup → update → health/data verification → restore-based rollback → повторная verification;
4. приложить resolved image digests и результаты проверок в Projects Control;
5. пометить VPS/DNS/credential проверки как external, если они фактически не выполнялись.

## Evidence status и границы

Пара `2.29.9 → 2.29.10 → 2.29.9` прошла [dated destructive rehearsal](reports/2026-07-14-destructive-lifecycle.md) с реальными pinned containers, pre-update backup, restore-based rollback и exact workflow/encrypted-credential assertions. Это локальное Docker evidence, а не Ubuntu VPS/DNS/HTTPS/reboot evidence.

Одни syntax/unit/Compose проверки не доказывают migration safety. Unattended auto-update, arbitrary downgrade, PostgreSQL major upgrade и удалённое backup storage не входят в этот flow.
