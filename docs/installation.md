# Установка

`scripts/install.sh` устанавливает базовый профиль n8n Entrepreneur Starter Kit на чистую Ubuntu 24.04 LTS x86_64. Скрипт нужно скачать вместе со всем репозиторием и проверить локально; запуск через `curl | bash` не поддерживается.

## До запуска

Подготовьте:

- VPS с Ubuntu 24.04 LTS x86_64, минимум 1 vCPU, 1 GiB RAM и 10 GiB свободного места;
- домен с A-записью на публичный IPv4 VPS;
- SSH-пользователя с `sudo`;
- свободные TCP-порты 80 и 443;
- исходящий HTTPS-доступ к Docker repository, container registries и ACME.

1 vCPU/1 GiB подходит только для теста. Для рабочего использования рекомендуется минимум 2 vCPU, 2 GiB RAM и 20 GiB свободного места.

## Быстрый запуск

```bash
git clone <repository-url> n8n-starter-kit
cd n8n-starter-kit
./scripts/install.sh
```

Installer запросит домен, ACME email и IANA timezone, проверит host, установит отсутствующий Docker из официального apt repository, сгенерирует два независимых секрета, создаст `.env` с правами `0600`, проверит Compose и дождётся healthy-состояния сервисов.

Сначала безопасно посмотреть план:

```bash
N8N_HOST=n8n.example.com \
ACME_EMAIL=admin@example.com \
./scripts/install.sh --non-interactive --dry-run
```

`--dry-run` не записывает файлы, не запускает `sudo`, не устанавливает packages и не меняет Docker runtime. `--check-only` выполняет только preflight. Оба режима могут сделать read-only DNS/HTTPS-запросы.

## Non-interactive mode

Передавайте несекретные значения через environment, а секреты — через локальный файл mode `0600`:

```bash
install -m 0600 .env.example /root/n8n-install.env
sudo editor /root/n8n-install.env
./scripts/install.sh --non-interactive --config /root/n8n-install.env
```

Installer разбирает только разрешённые строки `KEY=VALUE` и не выполняет config как shell-код. Значения process environment имеют приоритет над `--config`, а `--config` — над существующим `.env`.

| Переменная | Обязательность | Назначение |
|---|---:|---|
| `N8N_HOST` | да | FQDN без схемы, порта и пути |
| `ACME_EMAIL` | да | адрес для ACME notices |
| `TIMEZONE` | нет | IANA timezone, default `Etc/UTC` |
| `POSTGRES_DB` | нет | database, default `n8n` |
| `POSTGRES_USER` | нет | database user, default `n8n` |
| `POSTGRES_PASSWORD` | нет | генерируется, если данных ещё нет; custom value — минимум 24 безопасных dotenv-символа |
| `N8N_ENCRYPTION_KEY` | нет | генерируется один раз и должен сохраняться всегда; custom value — минимум 24 безопасных dotenv-символа |
| `EXECUTIONS_DATA_MAX_AGE` | нет | retention в часах, default `168` |
| `EXECUTIONS_DATA_PRUNE_MAX_COUNT` | нет | верхняя граница executions, default `10000` |

Секреты не печатаются. Не передавайте их в shared shell history и CI logs.

## Повторный запуск и данные

- Существующий `.env` читается первым; его database password и `N8N_ENCRYPTION_KEY` сохраняются, если вы явно не передали другие значения.
- Если итоговая конфигурация меняется, interactive mode требует подтверждение. Non-interactive mode останавливается; после ручной проверки нужен `--yes`.
- `--yes` разрешает только замену env-файла. Installer никогда не выполняет `down --volumes`, не удаляет named volumes и не перезаписывает PostgreSQL data.
- Если volumes `n8n_data` или `n8n_postgres_data` существуют, а `.env` потерян, installer завершится с кодом `30`. Восстановите исходный `.env` из защищённой копии. Генерация нового encryption key поверх существующих данных небезопасна.
- Существующая рабочая установка Docker не заменяется автоматически. Отличие от проверенного baseline показывается как `WARN`.

## Preflight: PASS, WARN и FAIL

| Проверка | PASS | WARN | FAIL |
|---|---|---|---|
| ОС/architecture | Ubuntu 24.04 x86_64 | — | другая платформа |
| Ресурсы | минимум 1 CPU/1 GiB/10 GiB | меньше recommended 2 CPU/2 GiB/20 GiB | ниже minimum |
| Privileges | root или подтверждённый sudo | — | sudo недоступен |
| Порты | 80/443 свободны | заняты Caddy этого проекта при rerun | заняты другим процессом |
| DNS | A-запись разрешается | запись отсутствует или отличается от host public IPv4 | неверный формат домена |
| Network | Docker repository и n8n registry доступны | проверка отложена, если в read-only режиме нет curl | endpoint недоступен при установке |
| Docker | daemon и Compose доступны | existing versions отличаются от baseline | daemon/Compose недоступны или pinned packages отсутствуют |

DNS mismatch — предупреждение из-за возможного NAT, reverse proxy или propagation. Public HTTPS и certificate проверит `doctor.sh`; container health сам по себе их не доказывает.

## Exit codes

| Код | Значение |
|---:|---|
| `0` | success, check-only или dry-run завершены |
| `2` | ошибка аргументов или конфигурации |
| `10` | неподдерживаемая ОС |
| `11` | неподдерживаемая architecture |
| `12` | недостаточно ресурсов |
| `13` | нет root/sudo |
| `14` | конфликт ports |
| `16` | нет обязательной исходящей сети |
| `20` | Docker install/daemon failure |
| `21` | Docker Compose отсутствует или config невалиден |
| `22` | secret generation или безопасная запись env не удались |
| `23` | image pull/start failure |
| `24` | сервисы не достигли healthy |
| `30` | защита существующей конфигурации/data остановила запуск |

## После установки

```bash
docker compose ps
docker compose logs --tail=100 caddy n8n postgres
```

Откройте `https://<N8N_HOST>/`. Не публикуйте `.env`, не меняйте `N8N_ENCRYPTION_KEY` и не используйте `docker compose down --volumes`. Реальные DNS, certificate, webhook и reboot проверки требуют VPS evidence и не считаются пройденными локальным dry-run.
