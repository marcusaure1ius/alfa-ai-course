# Quick Start: n8n одной командой

Проверено: 2026-07-14. Собственный домен, ручная DNS-запись, локальный Git checkout и передача archive участнику для базового пути не нужны.

## Что должно быть готово

| Обязательное | Рабочая рекомендация | Только минимальный тест |
|---|---|---|
| ОС | Ubuntu 24.04 LTS x86_64 | та же ОС и architecture |
| CPU / RAM | 2 vCPU / 2 GiB | 1 vCPU / 1 GiB |
| Диск | 20 GiB свободно | 10 GiB свободно |
| Сеть | закреплённый публичный IPv4, TCP 22/80/443 | публичный IPv4, TCP 22/80/443 |
| Доступ | SSH key и пользователь с `sudo` | root или пользователь с `sudo` |

1 GiB и 10 GiB — нижняя граница для короткого теста, а не рекомендация для постоянной работы. Если VPS ещё нет, используйте [Timeweb Cloud](timeweb-cloud.md), [пошаговый Timeweb guide](timeweb-clean-install.md) или [Yandex Cloud](yandex-cloud.md).

## 1. Войдите на VPS

```bash
ssh root@203.0.113.10
```

Замените пример на IPv4 из панели провайдера. При первом подключении сравните SSH fingerprint с данными панели, если провайдер их показывает.

## 2. Выполните одну команду

Финальный пользовательский интерфейс установки:

```bash
curl -fsSL "https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/latest/download/install.sh" | sh
```

Это стабильный URL GitHub Releases. Он ведёт на проверенный asset текущего release; versioned copy, checksum и exact commit остаются доступны для аудита. Никакие домен, email, `git clone`, `scp`, environment variables или ответы installer участнику не нужны.

Автономный installer:

1. проверяет SHA-256 встроенного release из exact Git commit;
2. устанавливает комплект в `/opt/n8n-entrepreneur-starter-kit`;
3. проверяет Ubuntu 24.04 и x86_64;
4. определяет публичный IPv4 двумя HTTPS-проверками;
5. создаёт бесплатный адрес вида `n8n-203-0-113-10.sslip.io` и проверяет его DNS;
6. устанавливает pinned Docker, PostgreSQL, n8n и Caddy;
7. создаёт постоянные secrets в `.env` mode `0600`, не печатая их;
8. ждёт healthy services и показывает готовый HTTPS URL.

Повторный запуск той же команды использует существующий `.env` и Docker volumes. Он не меняет encryption key, пароль PostgreSQL и данные.

## 3. Откройте напечатанный URL

Успешный финал выглядит так:

```text
Установка завершена.
  URL: https://n8n-203-0-113-10.sslip.io/
```

Откройте именно адрес из вывода и создайте owner самостоятельно. Пароль должен быть уникальным и храниться в менеджере паролей; преподавателю или агенту он не нужен.

## Как это работает без вашего домена

[sslip.io](https://sslip.io/) возвращает IP, записанный в hostname. Например, `n8n-203-0-113-10.sslip.io` разрешается в `203.0.113.10`. Caddy получает обычный публичный TLS-сертификат через HTTP-01. Installer продолжает только когда DNS-ответ совпадает с обнаруженным публичным IPv4.

Это внешняя бесплатная зависимость. Если sslip.io недоступен или IP определяется неоднозначно, установка останавливается с `FAIL`; она не включает plain HTTP и не отключает проверку TLS. В таком случае можно позже использовать [собственный домен](domain-and-dns.md) как advanced fallback.

## Проверка и обслуживание

После установки команды доступны в постоянном каталоге:

```bash
cd /opt/n8n-entrepreneur-starter-kit
sudo ./scripts/doctor.sh
sudo docker compose ps
```

Ожидается `FAIL=0`, а `postgres`, `n8n` и `caddy` имеют состояние `running/healthy`. Не публикуйте `.env`, не меняйте `N8N_ENCRYPTION_KEY` и не запускайте `docker compose down --volumes`.

## Когда остановиться

- checksum встроенного release не совпал;
- ОС не `ubuntu 24.04` или architecture не `x86_64`;
- два сервиса определения public IPv4 вернули разные значения;
- бесплатный hostname не разрешается в public IPv4 VPS;
- TCP 80/443 заняты неизвестным процессом;
- installer или [doctor](diagnostics.md) показывает `FAIL`.

Публичное скачивание, checksum и безопасный verify-only проверяются при публикации release. Полный fresh-VPS и новый novice trial остаются отдельными external gates: не считайте их пройденными только по успешному скачиванию installer.
