# Timeweb VPS lifecycle — production smoke

- Scope: T-0056, срез 1A
- Ресурсы: максимум один disposable VPS и один публичный IPv4
- Не входит: DNS, cloud-init starter kit, n8n, TLS и student release

## Real Mutation Gate

До включения mutation все пункты должны иметь фактическое evidence:

1. Владелец подтвердил числовой `TIMEWEB_SMOKE_BUDGET_RUB`.
2. Timeweb API `/api/v1/account/services/cost` вернул актуальную однозначную
   стоимость `floating_ip`; если активного ценового источника нет, smoke
   fail-closed и платная mutation запрещена.
3. Подготовлены существующие disposable `TIMEWEB_SMOKE_PROJECT_ID` и
   `TIMEWEB_SMOKE_SSH_KEY_ID`; создание дополнительных project/key в smoke не
   выполняется, root password отключён.
4. Read-only connection показывает готовый account, актуальный баланс, Ubuntu
   24.04, preset, регион и availability zone.
5. В Timeweb account нет другого VPS; platform database не содержит live среды.
6. Production admin имеет verified TOTP factor и выполняет свежую re-auth.
7. Token ограничен минимально доступными service permissions и разрешает
   automatic delete без Telegram-кода.
8. Token и `AUTH_FACTOR_ENCRYPTION_KEY` находятся только в Vercel Production;
   Preview и Development не содержат их.
9. Kill-switches включаются только на время подтверждённого smoke.

Для уже созданного administrator TOTP добавляется одноразовой CLI-командой.
Secret и первый текущий code вводятся скрытыми prompts, не попадают в shell
history, передаются только дочернему process и сразу удаляются из environment:

```bash
cd platform
read -rsp 'TOTP secret: ' ADMIN_TOTP_SECRET && echo
read -rsp 'Текущий TOTP code: ' ADMIN_TOTP_CODE && echo
export ADMIN_TOTP_SECRET ADMIN_TOTP_CODE
npm run auth:enroll-admin-totp -- --email admin@example.test
unset ADMIN_TOTP_SECRET ADMIN_TOTP_CODE
```

`AUTH_FACTOR_ENCRYPTION_KEY` заранее находится в защищённом `.env.local` с
правами `0600`. Enrollment помечает factor verified только после успешной
проверки первого code.

Production environment:

```text
PLATFORM_PROVIDER=timeweb
TIMEWEB_API_TOKEN=<encrypted Vercel Production secret>
TIMEWEB_MUTATIONS_ENABLED=true
TIMEWEB_CAPABILITIES_VERIFIED=true
TIMEWEB_SMOKE_BUDGET_RUB=<целое число рублей>
TIMEWEB_SMOKE_PROJECT_ID=<ID disposable проекта>
TIMEWEB_SMOKE_SSH_KEY_ID=<ID существующего SSH-ключа>
AUTH_FACTOR_ENCRYPTION_KEY=<32 random bytes, base64url>
```

## Create / reconcile / delete

1. Открыть `/admin/infrastructure` и проверить provider preview.
2. Создать среду с уникальным именем. API возвращает `202` и `operationId`.
3. Дождаться `active`; timeline обязан содержать
   `reserve_public_ip` (без отдельной mutation), `create_server` (атомарно с
   IPv4), `reconcile_server`, `complete`.
   Повторный preflight выполняется непосредственно перед create, а status
   должен стать ровно `on`; исчерпание bounded polling даёт
   `cleanup_required`.
4. Повтор исходного idempotency key обязан вернуть тот же `operationId`.
5. Открыть destructive AlertDialog и сверить перечисленные owned VPS/IP,
   provider IDs, стоимость и предупреждение об отсутствии backup. Затем ввести
   точное имя, подтвердить потерю данных, пароль и TOTP.
6. Дождаться `deleted`. Cleanup удаляет server, затем отдельно public IP.
7. Read-only catalog обязан показать ноль VPS и отсутствие созданного IP.

При остаточном ресурсе среда должна стать `cleanup_required`; интерфейс
показывает IP и месячную оценку, kill-switch не отключается до cleanup.

## Evidence без секретов

Сохраняются только:

- Vercel deployment/Workflow run ID и commit SHA;
- platform `operationId`, environment status и redacted timeline;
- Timeweb server/public IP IDs в закрытом evidence без token и credentials;
- provider price/balance snapshot без персональных account данных;
- финальный список ресурсов, подтверждающий отсутствие VPS и orphan IPv4;
- timestamps create/delete и оценка фактического периода тарификации.

Raw token, пароль, TOTP secret/code, root password, response bodies и browser
cookies в evidence запрещены.
