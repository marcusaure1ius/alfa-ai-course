# Timeweb VPS lifecycle — production smoke

- Scope: T-0056, срез 1A
- Ресурсы: максимум один disposable VPS и один публичный IPv4
- Не входит: DNS, cloud-init starter kit, n8n, TLS и student release

## Real Mutation Gate

До включения mutation все пункты должны иметь фактическое evidence:

1. Владелец подтвердил числовой `TIMEWEB_SMOKE_BUDGET_RUB`.
2. Read-only connection показывает готовый account, актуальный баланс, Ubuntu
   24.04, preset, регион и availability zone.
3. В Timeweb account нет другого VPS; platform database не содержит live среды.
4. Production admin имеет verified TOTP factor и выполняет свежую re-auth.
5. Token ограничен минимально доступными service permissions и разрешает
   automatic delete без Telegram-кода.
6. Token и `AUTH_FACTOR_ENCRYPTION_KEY` находятся только в Vercel Production;
   Preview и Development не содержат их.
7. Kill-switches включаются только на время подтверждённого smoke.

Для уже созданного administrator TOTP добавляется одноразовой CLI-командой.
Значения передаются только через process environment и не выводятся:

```bash
cd platform
ADMIN_TOTP_SECRET='<скрыто>' \
AUTH_FACTOR_ENCRYPTION_KEY='<скрыто>' \
npm run auth:enroll-admin-totp -- --email admin@example.test
```

Production environment:

```text
PLATFORM_PROVIDER=timeweb
TIMEWEB_API_TOKEN=<encrypted Vercel Production secret>
TIMEWEB_MUTATIONS_ENABLED=true
TIMEWEB_CAPABILITIES_VERIFIED=true
TIMEWEB_SMOKE_BUDGET_RUB=<целое число рублей>
AUTH_FACTOR_ENCRYPTION_KEY=<32 random bytes, base64url>
```

## Create / reconcile / delete

1. Открыть `/admin/infrastructure` и проверить provider preview.
2. Создать среду с уникальным именем. API возвращает `202` и `operationId`.
3. Дождаться `active`; timeline обязан содержать
   `reserve_public_ip`, `create_server`, `reconcile_server`, `complete`.
4. Повтор исходного idempotency key обязан вернуть тот же `operationId`.
5. Открыть destructive AlertDialog, ввести точное имя, подтвердить потерю
   данных, пароль и TOTP.
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
