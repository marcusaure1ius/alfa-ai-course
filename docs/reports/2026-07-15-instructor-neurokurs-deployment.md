# Фактическое развёртывание преподавательского стенда `neurokurs.ru`

Дата проверки: 2026-07-15. Задача Projects Control: `T-0037`.

## Результат

Создан отдельный учебный VPS `n8n-neurokurs` в Timeweb Cloud и добавлена A-запись для `n8n.neurokurs.ru`. Домен `aimolniya.ru` и существующий сервер `n8n-aimolniya` не изменялись.

Для доступа создан отдельный SSH-ключ `neurokurs-deploy`; существующий ключ `aimolniya-deploy` к новому VPS не подключался. Приватный ключ не передавался в Timeweb и не добавлялся в репозиторий.

Перед заказом в панели повторно подтверждены:

- Ubuntu 24.04;
- Москва;
- 2 vCPU, 2 ГБ RAM, 40 ГБ NVMe;
- публичный IPv4;
- платные backups и дополнительные защиты выключены;
- итоговая цена — 980 ₽/месяц.

Скриншот цены обезличен: в нём нет баланса, email, IP-адреса и credentials.

## Проверенная install-команда

Публичный release использован напрямую, без локальной передачи archive:

```bash
curl -fsSL "https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/latest/download/install.sh" | N8N_HOST=n8n.neurokurs.ru TIMEZONE=Europe/Moscow sh
```

Bootstrap подтвердил SHA-256 и exact commit `2516b90060228ba35a70687c6f1bb30203028ea3`. Секреты были сгенерированы на VPS, `.env` получил mode `0600`; значения не читались в evidence и не сохранялись в репозитории.

## Docker Hub `429`

Первый pull официального PostgreSQL image остановился на `429 Too Many Requests`. Повтор без изменений подтвердил, что это не единичный сетевой обрыв. Для Docker Hub применён [официальный proxy Timeweb](https://dockerhub.timeweb.cloud/):

```json
{ "registry-mirrors": ["https://dockerhub.timeweb.cloud"] }
```

Поскольку официальный адрес `docker.n8n.io` перенаправил pull в Docker Hub вне mirror-маршрута, на этом VPS добавлен provider-specific Compose override с тем же exact n8n tag `2.29.10` через `dockerhub.timeweb.cloud/n8nio/n8n:2.29.10`. Теги PostgreSQL `17.10-bookworm`, Caddy `2.11.4-alpine` и n8n `2.29.10` не ослаблялись до `latest`.

После этого та же публичная install-команда завершилась успешно. Override относится только к преподавательскому VPS и не меняет базовый domainless путь участника.

## Фактические проверки

| Проверка | Результат |
|---|---|
| Время fingerprint | `2026-07-15T06:24:39Z` |
| ОС | Ubuntu 24.04 |
| Architecture | x86_64 |
| Ресурсы | 2 CPU, около 2 ГБ RAM, root disk 38 ГБ |
| Installer checksum | PASS, exact commit `2516b90060228ba35a70687c6f1bb30203028ea3` |
| Local doctor после установки | `FAIL=0`, `WARN=2` |
| Повторный installer | exit `0`, `FAIL=0` |
| `.env` после rerun | содержимое не изменилось, mode `0600` |
| `N8N_ENCRYPTION_KEY` после rerun | значение не изменилось; само значение не выводилось |
| Named volumes после rerun | состав не изменился |
| Реальная перезагрузка VPS | SSH восстановился, все три контейнера healthy |
| Постоянные данные после reboot | `.env`, encryption key и четыре named volume присутствуют |
| TCP 5432 снаружи | закрыт |
| Public DNS | PASS, `n8n.neurokurs.ru` публично разрешается в IPv4 нового VPS |
| HTTPS | PASS, внешний запрос получил HTTP `200` |
| TLS certificate | PASS, сертификат действителен более 24 часов |
| Полный doctor после публикации DNS | `FAIL=0`, `WARN=1` (только RAM) |
| Owner screen из внешнего браузера | PASS, открылась пустая форма `Set up owner account` |

Предупреждение doctor о RAM связано с тем, что номинальные 2 ГБ тарифа дают ОС немного меньше 2 GiB. Для учебного стенда это допустимо; `FAIL` отсутствуют.

## Граница evidence

Публичная DNS-делегация завершилась. Внешний HTTPS и сертификат проверены, полный `./scripts/doctor.sh` завершился с `FAIL=0`, TCP 5432 снаружи закрыт. В браузере открыта пустая форма создания владельца; её обезличенный снимок сохранён в `docs/assets/instructor/03-n8n-owner-screen.jpg`.

Поля формы не заполнялись: email и пароль создаёт и хранит сам владелец стенда. Скриншоты не содержат IP-адресов, email, баланса, credentials или секретов.
