# Participant public install technical E2E — 2026-07-31

## Итог

**PASS для standalone starter kit v0.1.0 на чистом публичном Timeweb VPS.** Стабильная команда из Quick Start без домена, DNS, email, Git, `scp` и environment variables установила PostgreSQL, n8n и Caddy, напечатала автоматический `sslip.io` URL и открыла форму `Set up owner account` по валидному HTTPS.

Это технический прогон опытным оператором. Он не является novice usability trial `T-0032` и не проверяет UI, plain-VPS configurator или будущий DNS/n8n/TLS install flow Course Control Plane.

## Проверенная среда

| Параметр | Фактическое значение |
|---|---|
| Provider | Timeweb Cloud, отдельный disposable VPS |
| ОС / architecture | Ubuntu 24.04 LTS, `x86_64` |
| Тариф | Premium NVMe, 2 vCPU / 2 GB / 40 GB |
| Сеть | существующий свободный публичный IPv4; в evidence заменён на `[redacted-ip]` |
| Авторизация | отдельный SSH public key |
| Публичный installer | GitHub Releases stable URL |
| Exact embedded release | commit `2516b90060228ba35a70687c6f1bb30203028ea3` |
| Runtime | n8n `2.29.10`, PostgreSQL `17.10-bookworm`, Caddy `2.11.4-alpine` |
| Disposable cleanup | VPS удалён после evidence; существующий до задачи IPv4 сохранён |

Панель Timeweb на дату прогона показывала 800 ₽/месяц или 1,09 ₽/час за тестовый сервер и 180 ₽/месяц за новый публичный IPv4. В прогоне использован уже существовавший свободный IPv4, поэтому новый IP не покупался. Платные backups были отключены.

## Точный пользовательский путь

1. В панели создан чистый Ubuntu 24.04 VPS с публичным IPv4 и SSH key.
2. После статуса «В сети» выполнен SSH-вход.
3. Без подстановок выполнена публичная команда:

```bash
curl -fsSL "https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/latest/download/install.sh" | sh
```

4. Открыт единственный URL из строки `Установка завершена`; показана форма первого owner.

Собственный домен, ручная DNS-запись, ACME email, `git clone`, checksum-команда и передача файлов участнику не потребовались.

## Timing

| Этап | Наблюдаемый результат |
|---|---|
| Создание VPS до доступного SSH | не более 15 секунд после заказа |
| Первая public install command | около 122 секунд |
| Повторная public install command | 17 секунд |
| Reboot до повторного SSH | не более 11 секунд |
| Reboot до подтверждённого полного health | не более 35 секунд |
| Активные действия оператора до owner screen | около 4 минут, округлено по browser/terminal timeline |
| Полный технический путь до owner screen | менее 7 минут |

Технический результат укладывается в целевые 15–30 минут с запасом. Это не доказывает время нового пользователя: его отдельно измеряет только наблюдаемый `T-0032`.

## Acceptance matrix

| Проверка | Результат | Redacted evidence |
|---|---|---|
| Clean Ubuntu 24.04 x86_64 | PASS | `OS=Ubuntu 24.04`, `ARCH=x86_64` до установки |
| Exact stable command | PASS | команда совпала с Quick Start byte-for-byte |
| Embedded release integrity | PASS | installer подтвердил exact commit и SHA-256 |
| Auto hostname | PASS | `[redacted-host]` автоматически получен из public IPv4 |
| DNS | PASS | `DNS_MATCH=PASS` |
| HTTPS / TLS | PASS | HTTP `200`; публичный сертификат валиден более 24 часов |
| Owner screen | PASS | `Set up owner account`; email/name/password fields и `Next` доступны |
| Full doctor | PASS | `FAIL=0 WARN=1` после внешних DNS/HTTPS/certificate checks |
| Services | PASS | `postgres`, `n8n`, `caddy` — `running/healthy` |
| Network exposure | PASS | TCP `22/80/443` открыты; `5432/5678` закрыты извне |
| Safe rerun | PASS | `.env` byte-for-byte не изменился; persistent marker сохранился |
| Reboot persistence | PASS | checksum `.env` совпал; marker сохранился; 3/3 services healthy |
| Cleanup | PASS | disposable VPS отсутствует в active server list после удаления |

## Redacted excerpts

```text
[PASS] Release <exact-commit> проверен по SHA-256.
[PASS] Бесплатный HTTPS hostname выбран автоматически: [redacted-host]
[PASS] DNS A-запись разрешается в [redacted-ip].
[PASS] Compose stack запущен и достиг healthy.
Итог: FAIL=0 WARN=1
```

```text
DNS_MATCH=PASS
HTTPS_STATUS=200
TLS_CERTIFICATE=PASS
TCP_22=OPEN
TCP_80=OPEN
TCP_443=OPEN
TCP_5432=CLOSED
TCP_5678=CLOSED
```

```text
RERUN_ENV_UNCHANGED=PASS
RERUN_DATA_MARKER=PASS
POST_REBOOT_ENV_UNCHANGED=PASS
POST_REBOOT_DATA_MARKER=PASS
```

Raw `.env`, provider responses, account data, server ID, IP, generated password и точный hostname в Git не сохранялись.

## Обнаруженный нюанс

Тариф Timeweb, подписанный как «2 GB RAM», после системного пересчёта попадает в диапазон 1–2 GiB. Installer и doctor корректно завершаются с `FAIL=0`, но показывают предупреждение `RAM 1–2 GiB подходит только для теста`. Поэтому 2 GB оставлен как короткий тестовый профиль, а для постоянной работы в Timeweb рекомендуется 4 GB.

## Оставшиеся границы

- `T-0032` должен быть выполнен реальным новым участником без устных подсказок.
- Этот PASS относится к опубликованному standalone release v0.1.0. Следующий release требует повторного fresh-VPS smoke.
- Control Plane сейчас создаёт clean plain VPS по отдельному контракту. Его совместимый exact-release install flow должен быть перепланирован вместо superseded `T-0057` и проверен отдельно.
