# Participant handoff

Проверено: 2026-07-14. Handoff завершён только после фактической проверки каждого результата участником. Устное «всё работает» без observable evidence не считается передачей.

## Главное правило

Участник остаётся единственным владельцем VPS, домена, n8n owner account, SSH keys, 2FA recovery codes, `.env`, backups и credentials внешних providers. Преподавателю не нужны и не передаются passwords, API keys, bot tokens, OAuth secrets, backup archives или `N8N_ENCRYPTION_KEY`.

Если во время занятия secret случайно попал в screen share, chat, terminal history или screenshot, участник немедленно ротирует его по [security guide](security.md); простого удаления сообщения недостаточно.

## Чек-лист передачи

Для каждого пункта участник сам выполняет действие и записывает только безопасный результат: дату, статус, hostname без secret path и последние четыре символа публичного identifier, если это необходимо. Значения credentials не записываются.

| Готово | Область | Ответственный после handoff | Наблюдаемый результат |
|---|---|---|---|
| [ ] | VPS provider | Участник | Участник входит в provider console своим account; billing и recovery email принадлежат ему |
| [ ] | SSH | Участник | Новая SSH-сессия открывается participant key; instructor key/account удалён или подтверждённо отсутствует |
| [ ] | Domain/DNS | Участник | Registrar и authoritative DNS доступны участнику; A-record указывает на его VPS |
| [ ] | n8n owner | Участник | Участник входит как instance owner через HTTPS без помощи преподавателя |
| [ ] | 2FA | Участник | 2FA включена; recovery codes сохранены участником вне VPS и репозитория |
| [ ] | Runtime secrets | Участник | `.env` существует с mode `0600`; его содержимое никому не показывалось |
| [ ] | Local health | Участник | `./scripts/doctor.sh --local-only` не содержит `FAIL`; exit code и WARN записаны |
| [ ] | External health | Участник | Полный `./scripts/doctor.sh` отдельно показывает фактические DNS/HTTPS/certificate результаты |
| [ ] | Backup | Участник | `backup.sh` напечатал `BACKUP_ARCHIVE=...`; рядом есть `.sha256`, оба файла `0600` |
| [ ] | Off-host copy | Участник | Backup и checksum скопированы в выбранное защищённое хранилище вне VPS без передачи преподавателю |
| [ ] | Recovery knowledge | Участник | Участник может найти [restore procedure](backup-and-restore.md) и объяснить, почему archive содержит secrets |
| [ ] | Workflow ownership | Участник | Credentials созданы в его n8n; safe/test-mode smoke выполнен без instructor credentials |
| [ ] | Operations | Участник | Назначены даты doctor, backup, update review и проверки свободного места |
| [ ] | Documentation | Участник | Открываются Quick Start, troubleshooting, security, backup/restore и update/rollback guides |
| [ ] | Instructor access | Участник | Временные invitations, provider roles, SSH keys и shared sessions преподавателя отозваны |

## Минимальный операционный календарь

| Действие | Ответственный | Когда | Evidence без secrets |
|---|---|---|---|
| `doctor.sh` и disk check | Участник | после изменений и не реже выбранного рабочего интервала | дата, exit code, список ключей `WARN/FAIL` |
| Согласованный backup | Участник | перед update и по расписанию потери данных | archive filename, checksum verification, off-host location label |
| Restore rehearsal | Участник | до production reliance и после изменения recovery procedure | disposable target, дата, восстановленные test assertions |
| Version/security review | Участник | перед каждым update | source/target pins, official release notes, backup path label |
| Credential rotation | Участник | по policy provider или после exposure | credential name, дата smoke и дата revoke; без значения secret |

Starter kit не выполняет unattended update. Участник использует только approved exact pair из [update/rollback guide](update-and-rollback.md); новая версия требует отдельного research, backup и rehearsal.

## Финальная самостоятельная проверка

- [ ] Участник находит проблему через [Troubleshooting](troubleshooting.md), а не ждёт устного ответа преподавателя.
- [ ] Участник знает, где находится off-host backup и кто имеет к нему доступ.
- [ ] Участник объясняет, почему нельзя менять `N8N_ENCRYPTION_KEY` поверх существующих данных.
- [ ] Участник знает destructive confirmation для uninstall, но не запускает её во время handoff.
- [ ] Участник знает, какие проверки локальны, а какие требуют реального VPS/credentials.

## Запись о handoff

Безопасная запись содержит participant/project identifier, дату, версии, результаты checklist и открытые gaps. Она не содержит IP allowlist secrets, access URLs с tokens, screenshots credentials, `.env`, backup или raw logs с PII.

Если хотя бы один critical ownership пункт не подтверждён, handoff имеет статус `NOT READY` с конкретным владельцем и следующим проверяемым действием. Преподаватель не сохраняет постоянный доступ «на всякий случай».
