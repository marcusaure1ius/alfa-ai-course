# Security baseline

Документ фиксирует проверяемые security defaults задачи `T-0008` для одного VPS с Ubuntu 24.04 LTS x86_64. Это baseline для учебного self-hosted deployment, а не enterprise hardening, IDS, VPN или автоматическая ротация ключей.

## Что защищено по умолчанию

| Область | Решение | Автоматическая проверка |
|---|---|---|
| Публичные порты | Только Caddy публикует TCP `80/443` и UDP `443`; n8n `5678` лишь exposed внутри Compose, PostgreSQL host port отсутствует | `tests/security_test.sh` разбирает resolved Compose JSON |
| Сети | PostgreSQL находится в `internal` backend network; Caddy к backend не подключён | topology assertion |
| Container privileges | У всех сервисов `no-new-privileges`; `privileged`, `cap_add`, devices и Docker socket отсутствуют | privilege assertion |
| Secrets | `.env` игнорируется Git, создаётся с mode `0600`; workflow exports и fixtures не содержат credentials/tokens | tracked-artifact и workflow catalog checks |
| n8n privacy | env/file access из workflow ограничен, diagnostics и personalization выключены, secure cookie включён | environment assertion |
| n8n student gateway | editor/API закрыты Caddy `forward_auth`; ticket одноразовый, cookie host-only/HttpOnly/Secure; revoke/expiry/global off проверяются на каждом запросе | gateway integration tests + managed Compose contract |
| n8n identities | owner setup только admin; назначение требует отдельного Member с совпадающим email; API key/shared management secret только server-side | identity resolver tests + unique DB constraints |
| TLS | Production URL всегда `https`; TLS verification не отключается; Caddy — единственная публичная точка | resolved configuration assertion |
| Execution data | Pruning всегда включён; default age `168` часов и max count `10000` | resolved configuration assertion |

Образы PostgreSQL и Caddy используют собственные root entrypoints для инициализации volumes и привязки low ports. Поэтому baseline не добавляет непроверенный глобальный `cap_drop: ALL`, который может сломать официальный image lifecycle. Вместо этого запрещены дополнительные capabilities и `privileged`, а `no-new-privileges` обязателен для каждого сервиса. Более строгий capability allowlist требует отдельного runtime rehearsal и ADR.

## Execution retention

Execution payloads могут содержать персональные данные и provider responses. Default сохраняет успешные, ошибочные и manual executions для учебной диагностики, но удаляет их после `168` часов или при превышении `10000` записей.

Для более чувствительного или нагруженного deployment уменьшите обе границы в защищённом `.env`, например:

```dotenv
EXECUTIONS_DATA_MAX_AGE=24
EXECUTIONS_DATA_PRUNE_MAX_COUNT=1000
```

Затем пересоздайте только runtime containers штатным Compose flow и проверьте resolved values без вывода secrets. Значение `EXECUTIONS_DATA_PRUNE=true` зафиксировано в Compose и не отключается через `.env`. Меньший retention сокращает privacy exposure, но уменьшает доступный diagnostic trail.

## 2FA владельца и пользователей

Проверено по [официальной инструкции n8n 2FA](https://docs.n8n.io/user-management/two-factor-auth/) 2026-07-14. После первого входа каждый пользователь, особенно instance owner, должен открыть `Settings → Personal`, выбрать `Enable 2FA`, отсканировать QR-код приложением-аутентификатором и подтвердить одноразовый код. Recovery codes сохраните вне VPS и вне репозитория в защищённом хранилище; без приложения они нужны для восстановления доступа.

Не добавляйте recovery codes в `.env`, screenshots, тикеты или логи. Переменная `N8N_MFA_ENABLED` по умолчанию разрешает 2FA; установка `false` не отключает 2FA у уже настроенных пользователей и не является recovery procedure. Потеря и authenticator, и recovery codes требует отдельной проверенной процедуры владельца — не изменяйте database вручную по случайной инструкции из интернета.

## Ротация ключей и credentials

`N8N_ENCRYPTION_KEY` — постоянный master key этой установки. Не заменяйте его в `.env` на работающем instance: существующие credentials могут перестать расшифровываться. Он входит в защищённый recovery archive; потерянный `.env` восстанавливается вместе с согласованным backup, а не генерацией нового ключа поверх старых volumes.

Официальная [encryption key rotation](https://docs.n8n.io/hosting/securing/encryption-key-rotation/) ротирует отдельный data encryption key, но **не** master `N8N_ENCRYPTION_KEY`. В baseline starter kit эта feature не включена и не прошла rehearsal. Её включение — односторонняя миграция формата: сначала нужен полный database backup и staging test; после первой записи нельзя отключать flag или делать downgrade, а recovery возможен только восстановлением backup, созданного до включения. Поэтому включайте её только отдельной change-задачей с обновлением Compose, ADR и destructive evidence.

API keys, bot tokens, OAuth secrets и passwords внешних providers ротируются иначе:

1. создайте новый secret у provider, не отзывая старый;
2. замените credential через n8n UI и выполните документированный connection/smoke test в safe mode;
3. проверьте нужные workflow без публикации secret в execution/log output;
4. отзовите старый secret у provider;
5. зафиксируйте только дату, credential name и результат — не значение secret.

## PII и логи

Doctor и lifecycle scripts намеренно не читают raw execution logs и не печатают secrets. При ручной диагностике `docker compose logs` может содержать пользовательские данные, URLs или provider errors: ограничивайте вывод `--tail`, не публикуйте его целиком и перед передачей удаляйте email, телефоны, chat IDs, payloads, tokens и query parameters. Execution data в UI считается таким же чувствительным материалом и подчиняется retention выше.

## Firewall: только явный opt-in

Installer не меняет host firewall без `--configure-firewall`. Рекомендуемый порядок:

```bash
./scripts/firewall.sh --preview
./scripts/firewall.sh --apply
./scripts/firewall.sh --check
```

`--preview` не вызывает sudo, не устанавливает packages и не меняет rules. `--apply`:

1. получает server port текущей SSH-сессии из четвёртого поля `SSH_CONNECTION`;
2. отклоняет конфликтующий `--ssh-port` и отсутствие проверенного port;
3. показывает полный план;
4. требует отдельное interactive подтверждение или `--yes`;
5. первой командой разрешает текущий SSH port;
6. разрешает TCP `80/443` и UDP `443`, затем задаёт `deny incoming` / `allow outgoing`;
7. включает UFW последней командой и показывает verbose status.

Существующие rules скрипт не удаляет. Для запуска из VPS console, где нет `SSH_CONNECTION`, сначала проверьте sshd configuration и передайте порт явно:

```bash
./scripts/firewall.sh --preview --ssh-port 2222
./scripts/firewall.sh --apply --ssh-port 2222
```

Non-interactive применение возможно только после preview и с `--yes`:

```bash
./scripts/firewall.sh --preview --ssh-port 22
./scripts/firewall.sh --apply --ssh-port 22 --yes
```

Cloud security group остаётся отдельным слоем: разрешите текущий SSH port и TCP `80/443`; UDP `443` нужен только для HTTP/3. Не закрывайте SSH в provider firewall до проверки новой сессии в отдельном terminal.

## Проверки

```bash
./tests/security_test.sh
docker compose --env-file tests/fixtures/compose.env config --quiet
./scripts/firewall.sh --preview --ssh-port 22
```

Тесты доказывают статическую Compose policy, безопасную последовательность firewall plan, guards аргументов и отсутствие запрещённых tracked artifacts. Они не доказывают состояние реального VPS, cloud firewall, фактический UFW status, HTTPS certificate или доступность SSH после изменения. Такое утверждение допустимо только с evidence реального host rehearsal.

## Decision notes

- UFW выбран как штатный Ubuntu interface; firewall остаётся отдельным opt-in действием, потому что автоматическое включение может оборвать SSH.
- Текущий SSH path защищается до `ufw enable`; `--yes` убирает prompt, но не safety checks.
- Rules добавляются идемпотентными `ufw allow`; существующие rules не удаляются автоматически.
- Execution pruning нельзя отключить configuration override: пользователь меняет только документированные age/count bounds.
- Реальное применение UFW и cloud-provider checks намеренно не заявляются по локальным mock/static tests.
