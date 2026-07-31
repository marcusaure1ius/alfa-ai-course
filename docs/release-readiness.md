# Release readiness MVP

Проверено: 2026-07-31. Оцениваемый технический артефакт — публичный stable
release [`v0.1.1`](https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/tag/v0.1.1).
Машиночитаемые pins, commits и checksums находятся в
[`release-manifest.json`](../release-manifest.json).

## Решение

**NO-GO для заявления «MVP полностью готов» и обещания независимой установки
новичком за 15–30 минут.** Единственный прямой product blocker — `MVP-13`:
независимый участник встретил два блокирующих дефекта, а после исправлений
прошёл только адресный recovery на том же VPS. Новый полный проход из чистого
provider/account context ещё не выполнен.

**GO с условиями для контролируемого пилота и использования технического
release `v0.1.1`.** Installer и его checksum доступны, внешний Timeweb VPS
дошёл до HTTPS editor, lifecycle и security-проверки пройдены. Для пилота нужны
наблюдатель, готовность помочь с доступом к VPS и отдельный smoke используемых
внешних credentials. Это решение не превращает частичные external-проверки в
PASS.

## Матрица 13 критериев MVP

Статусы: `PASS` — фактически подтверждено в указанной границе; `PARTIAL` —
реализовано и проверено контрактами, но часть внешнего поведения не
подтверждена; `BLOCKER` — нельзя делать итоговое product claim.

| ID | Критерий | Статус | Evidence или явный blocker |
|---|---|---|---|
| MVP-01 | Поддерживаемый host — чистая Ubuntu 24.04 LTS x86_64 | PASS | [Ubuntu E2E](reports/2026-07-14-ubuntu-e2e.md): Ubuntu 24.04.4, `x86_64`, systemd; [T-0032](reports/t0032-novice-usability-trial-2026-07-31.md): реальный disposable Timeweb VPS той же матрицы. Windows/macOS — только клиент для SSH/web-console, не runtime host. |
| MVP-02 | Одна публичная команда устанавливает exact release без Git и собственного домена | PASS | Stable asset `v0.1.1`, checksum и embedded verify-only подтверждены в [публикации installer](release-publication.md) и [T-0032](reports/t0032-novice-usability-trial-2026-07-31.md). |
| MVP-03 | Stack устанавливается повторяемо и переживает reboot | PASS | [Ubuntu E2E](reports/2026-07-14-ubuntu-e2e.md): clean install 85 с, безопасный rerun 27 с, reboot recovery 25 с, 3/3 healthy. [T-0086](reports/t0086-control-plane-n8n-install-e2e-2026-07-31.md) отдельно подтверждает реальный provider reboot. |
| MVP-04 | n8n доступен по валидному HTTPS на автоматическом hostname | PASS | [T-0032](reports/t0032-novice-usability-trial-2026-07-31.md): внешний Timeweb VPS, domainless HTTPS `/setup`, owner setup и editor `/home/workflows`; [T-0086](reports/t0086-control-plane-n8n-install-e2e-2026-07-31.md): внешний DNS/TLS/health. Адрес disposable VPS намеренно удалён из evidence. |
| MVP-05 | PostgreSQL healthy и не опубликован в интернет | PASS | [Ubuntu E2E](reports/2026-07-14-ubuntu-e2e.md): `pg_isready`, отсутствует host mapping, внешние TCP 5432/5678 закрыты. Compose topology проверяется quality gates. |
| MVP-06 | `doctor` выдаёт понятный redacted OK/WARN/FAIL отчёт | PASS | Контракт и symptom mapping описаны в [диагностике](diagnostics.md); unit/static gate и installer post-check входят в проверенный release. Secrets в отчёт не выводятся. |
| MVP-07 | Backup → удаление данных → restore и tamper rejection фактически работают | PASS | [Destructive lifecycle](reports/2026-07-14-destructive-lifecycle.md): PASS 9/9 с exact hashes workflow, encrypted credential row и probe data; повреждённый archive отклонён до mutation. |
| MVP-08 | Update, restore-based rollback и data-preserving uninstall проверены | PASS | [Destructive lifecycle](reports/2026-07-14-destructive-lifecycle.md): `2.29.9 → 2.29.10`, rollback только с pre-update backup, uninstall/restart с сохранением четырёх volumes. Clean install сразу ставит `2.29.10`. |
| MVP-09 | Десять beginner no-code workflow импортируются без секретов | PASS | [Каталог и test report](workflow-catalog-and-test-report.md): ровно 10 standalone lessons, запрещённые code/execute nodes отсутствуют, credentials остаются placeholders, clean pinned import проверен. |
| MVP-10 | LLM-путь имеет безопасный contract и реальный provider smoke там, где заявлен | PARTIAL | Generic/Yandex/GigaChat contracts и fixtures пройдены; [реальный Polza smoke](workflow-catalog-and-test-report.md#реальный-polzaai-smoke-test) прошёл для уроков 6–10. Реальные Generic/Yandex/GigaChat credentials не проверены — их поведение остаётся external-unverified. |
| MVP-11 | Telegram, email и CRM интеграции безопасны по умолчанию | PARTIAL | Контракты, allowlist, draft/preview и human approval gates проверены статически; реальные Telegram/email/Bitrix24 credentials и provider mutation smoke не выполнялись. Пилот проверяет только фактически используемый provider. |
| MVP-12 | Русские инструкции, эксплуатация, handoff и license boundaries доступны | PASS | Quick Start, Timeweb/Yandex, backup/update/diagnostics, [participant handoff](participant-handoff.md), Apache-2.0 и `LICENSE-NOTES.md` входят в release; n8n и third-party лицензии не перелицензируются. |
| MVP-13 | Независимый новичок завершает чистый путь до editor за 15–30 минут без устных подсказок | BLOCKER | [T-0032](reports/t0032-novice-usability-trial-2026-07-31.md): первый проход остановлен SSH key, повтор — Docker Hub `429`; fixes и targeted recovery до editor прошли, но полный чистый тайминг не измерен. Нужен новый независимый trial с чистого состояния. |

Итого: `10 PASS`, `2 PARTIAL` и `1 BLOCKER` в продуктовой интерпретации выше.
Строки `MVP-10` и `MVP-11` не блокируют технический пилот,
если пилот не заявляет непроверенные providers; они блокируют универсальный
external-integration claim. `MVP-13` блокирует полный MVP release claim.

## Артефакт и граница данных

Повторная независимая проверка release assets дала:

- `install.sh`: SHA-256
  `34eae99bfcf17439bb079a9355cd3697aca8a7df306f7095ddda51f9ac52d941`;
- sidecar проверяет installer, embedded `--verify-only` завершается без системных
  изменений;
- embedded archive: SHA-256
  `6bd12fd976440eea398196bedc4d1d80d878212026bae02064a2cb562d773701`;
- 169 файлов; secret scan — 166 текстовых файлов, 0 findings;
- отсутствуют runtime `.env`, private keys, credentials, database dumps,
  backups, `test-results`, Docker volumes, `.git` и отдельный продукт
  `platform/`.

`.env.example` является безопасным шаблоном и не содержит рабочих secrets.
Runtime `.env` создаётся только на host с mode `0600`.

## Pins и граница reproducibility

| Компонент | Exact pin |
|---|---|
| n8n | `docker.n8n.io/n8nio/n8n:2.29.10` |
| PostgreSQL | `postgres:17.10-bookworm` |
| Caddy | `caddy:2.11.4-alpine` |
| Docker Engine apt | `5:29.6.1-1~ubuntu.24.04~noble` |
| Docker Compose plugin apt | `5.3.1-1~ubuntu.24.04~noble` |
| Проверенная update pair | `n8n 2.29.9 → 2.29.10` |

Resolved image digests из disposable linux/amd64 rehearsal записаны в manifest,
но не заменяют tags как канонические pins: официальный image может быть
пересобран с тем же application version. Timeweb proxy разрешён только как
provider-specific fallback с теми же exact tags.

## Как снять NO-GO

1. Создать новый disposable Ubuntu 24.04 x86_64 VPS и новый participant context.
2. Дать участнику только актуальные Quick Start/Timeweb instructions, без устных
   подсказок.
3. Начать таймер до SSH/web-console шага и остановить после открытия editor.
4. Зафиксировать каждую остановку и вмешательство; blocker означает новый FAIL,
   а не продолжение прежнего таймера после remediation.
5. Удалить VPS и выделенный IP после evidence.
6. При полном независимом PASS обновить эту матрицу, manifest readiness и
   changelog отдельным reviewed commit.

## Известные ограничения

- Runtime host только Ubuntu 24.04 LTS x86_64; Windows/macOS поддерживаются как
  пользовательские машины для SSH или web-console, но live novice Windows path
  ещё не проходил полный trial.
- Minimum 1 vCPU/1 GiB пригоден для теста, не является production sizing.
- Реальные Generic/Yandex/GigaChat, Telegram, email и CRM provider smokes должны
  выполняться с user-owned credentials и не могут быть доказаны fixtures.
- Local Ubuntu/QEMU evidence не подменяет внешний VPS; внешний Timeweb evidence
  приведён отдельно и не содержит удалённый IP или secrets.
- Disaster recovery на отдельном remote storage и production data volume не
  репетировались.
- IP-derived `sslip.io` зависит от внешнего DNS; собственный домен остаётся
  advanced-вариантом.
