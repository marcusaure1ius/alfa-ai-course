# Quick Start: n8n за 15 минут

Проверено: 2026-07-14. Этот путь использует только файлы и команды, которые есть в текущем репозитории. Публичный Git remote или release URL пока не зарегистрирован, поэтому инструкция не подставляет выдуманный адрес и не предлагает `curl | bash`.

Целевые 15 минут начинаются, когда VPS, публичный IPv4, DNS и SSH уже готовы. Создание аккаунта, оплата VPS и распространение DNS зависят от провайдера и в эти 15 минут не входят.

## 0. Что должно быть готово

| Обязательное | Рабочая рекомендация | Только минимальный тест |
|---|---|---|
| ОС | Ubuntu 24.04 LTS x86_64 | та же ОС и architecture |
| CPU / RAM | 2 vCPU / 2 GiB | 1 vCPU / 1 GiB |
| Диск | 20 GiB свободно | 10 GiB свободно |
| Сеть | закреплённый публичный IPv4, TCP 22/80/443 | публичный IPv4, TCP 22/80/443 |
| Доступ | SSH key и пользователь с `sudo` | root или пользователь с `sudo` |
| DNS | A-record `n8n.example.com` → IPv4 VPS | обязателен и для теста HTTPS |

1 GiB и 10 GiB — нижняя граница для короткого теста, а не рекомендация для постоянной работы.

Если VPS ещё нет, используйте один из проверенных guide:

- [Timeweb Cloud](timeweb-cloud.md);
- [фактическая чистая установка в Timeweb со скриншотами](timeweb-clean-install.md);
- [Yandex Cloud](yandex-cloud.md);
- затем [домен и DNS](domain-and-dns.md).

## 1. Передайте проверенный комплект на VPS

Команды выполняются на вашем компьютере в доверенном чистом checkout. Укажите реальные значения переменных:

```bash
export KIT_ROOT="/absolute/path/to/alfa-ai-course"
export VPS_USER="root"
export VPS_IP="203.0.113.10"
cd "$KIT_ROOT"

test -z "$(git status --short)" || {
  printf 'Остановитесь: локальный checkout содержит незакоммиченные изменения.\n' >&2
  exit 1
}

git archive --format=tar.gz --prefix=n8n-starter-kit/ \
  --output=/tmp/n8n-starter-kit.tar.gz HEAD
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum /tmp/n8n-starter-kit.tar.gz
else
  shasum -a 256 /tmp/n8n-starter-kit.tar.gz
fi | awk '{print $1 "  n8n-starter-kit.tar.gz"}' \
  > /tmp/n8n-starter-kit.tar.gz.sha256

scp /tmp/n8n-starter-kit.tar.gz \
  /tmp/n8n-starter-kit.tar.gz.sha256 \
  "$VPS_USER@$VPS_IP:~/"
```

Ожидаемый результат: `scp` завершился с кодом `0`; на VPS появились archive и checksum. Не добавляйте в archive `.env`, backup или credentials: `git archive HEAD` включает только закоммиченные файлы.

## 2. Проверьте VPS и распакуйте комплект

Подключитесь по IP, а не по ещё распространяющемуся DNS:

```bash
ssh "$VPS_USER@$VPS_IP"
```

На VPS:

```bash
export VPS_IP="203.0.113.10"
export N8N_HOST="n8n.example.com"
export ACME_EMAIL="admin@example.com"

sha256sum -c n8n-starter-kit.tar.gz.sha256
tar -xzf n8n-starter-kit.tar.gz
cd n8n-starter-kit

. /etc/os-release
printf 'OS=%s VERSION=%s ARCH=%s\n' "$ID" "$VERSION_ID" "$(uname -m)"
test "$ID" = ubuntu
test "$VERSION_ID" = 24.04
test "$(uname -m)" = x86_64
sudo -v
```

Ожидаемый результат:

```text
n8n-starter-kit.tar.gz: OK
OS=ubuntu VERSION=24.04 ARCH=x86_64
```

Любое другое значение ОС или architecture — стоп: этот MVP его не поддерживает.

## 3. Проверьте DNS и свободные порты

```bash
getent ahostsv4 "$N8N_HOST" | awk 'NR == 1 {print $1}'
printf '%s\n' "$VPS_IP"
sudo ss -ltnH '( sport = :80 or sport = :443 )'
```

Первые две команды должны вывести один и тот же IPv4. Последняя не должна вывести ничего. Если DNS отличается, вернитесь в [DNS guide](domain-and-dns.md). Если 80/443 заняты, не останавливайте неизвестный процесс вслепую — сначала найдите владельца через `sudo ss -ltnp`.

## 4. Посмотрите план и установите

```bash
./scripts/install.sh --help
N8N_HOST="$N8N_HOST" ACME_EMAIL="$ACME_EMAIL" \
  TIMEZONE="Europe/Moscow" \
  ./scripts/install.sh --non-interactive --dry-run
```

Ожидаемый результат dry-run: проверки заканчиваются сообщением `Dry-run завершён`; `.env`, packages и containers не изменены. `WARN` про DNS требует осознанной проверки, а любой `FAIL` нужно исправить до установки.

Запустите interactive installation:

```bash
./scripts/install.sh
```

Введите тот же FQDN, ACME email и IANA timezone. Ожидаемый результат: installer создаёт `.env` mode `0600`, запускает три healthy service и печатает `Установка завершена` с URL `https://$N8N_HOST/`. Секреты в output не выводятся.

## 5. Проверьте результат

```bash
docker compose ps
./scripts/doctor.sh
```

Ожидаемый результат: `postgres`, `n8n`, `caddy` имеют `running/healthy`; полный doctor завершается кодом `0` и строками `OK` для DNS, public HTTPS и certificate. `--local-only` здесь недостаточен: он намеренно оставляет внешний check как `WARN`.

Откройте `https://$N8N_HOST/` в браузере и создайте первого owner только в своём экземпляре. Не публикуйте `.env`, не меняйте `N8N_ENCRYPTION_KEY` и не используйте `docker compose down --volumes`.

Host firewall включается отдельно, только после успешного SSH и preview. Откройте вторую SSH-сессию, затем следуйте [security guide](security.md#firewall-только-явный-opt-in).

## Когда остановиться

- checksum не совпал — удалите archive и передайте его заново;
- ОС не `ubuntu 24.04` или architecture не `x86_64` — пересоздайте VPS;
- DNS не равен публичному IPv4 — исправьте запись и дождитесь propagation;
- TCP 80/443 заняты — определите процесс, не завершайте его наугад;
- installer вернул `FAIL` — используйте [таблицу exit codes](installation.md#exit-codes);
- doctor вернул `1/2` — используйте [карту симптомов](diagnostics.md#карта-симптомов).

Локальная проверка документа и scripts не доказывает реальный VPS, ACME или reboot persistence. Успех Quick Start подтверждается только фактическим `doctor.sh` на целевом VPS.
