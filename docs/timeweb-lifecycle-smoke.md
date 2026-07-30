# Timeweb VPS lifecycle — production smoke

- Scope: T-0056, срез 1A
- Ресурсы: максимум один disposable VPS и один публичный IPv4
- Не входит: DNS, cloud-init starter kit, n8n, TLS и student release

Продолжение для среза 1B: [timeweb-n8n-lifecycle-smoke.md](timeweb-n8n-lifecycle-smoke.md).

## Real Mutation Gate

До включения mutation все пункты должны иметь фактическое evidence:

1. Timeweb API `/api/v1/account/services/cost` вернул актуальную однозначную
   стоимость `floating_ip`; если активного ценового источника нет, smoke
   fail-closed и платная mutation запрещена. Баланс и `monthly_fee` сохраняются
   только как телеметрия; решение о допустимости списания принимает Timeweb.
2. В Timeweb существуют project и SSH key. Adapter получает их из Public API и
   сохраняет выбранные ID только в provider plan; root password отключён.
3. Read-only connection показывает готовый account, актуальный баланс, Ubuntu
   24.04, preset, регион и availability zone.
4. В Timeweb account нет другого VPS; platform database не содержит live среды.
5. Production admin имеет verified TOTP factor и выполняет свежую re-auth.
6. Token ограничен минимально доступными service permissions и разрешает
   automatic delete без Telegram-кода.
7. Token и `AUTH_FACTOR_ENCRYPTION_KEY` находятся только в Vercel Production;
   Preview и Development не содержат их.
8. Во время smoke нет параллельных внешних VPS/IP/DNS mutation.

Для уже созданного administrator TOTP добавляется одноразовой CLI-командой.
Secret и первый текущий code вводятся скрытыми prompts, не попадают в shell
history, передаются только дочернему process и сразу удаляются из environment:

```bash
cd platform
printf 'TOTP secret: '
IFS= read -rs ADMIN_TOTP_SECRET && printf '\n'
printf 'Текущий TOTP code: '
IFS= read -rs ADMIN_TOTP_CODE && printf '\n'
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
AUTH_FACTOR_ENCRYPTION_KEY=<32 random bytes, base64url>
```

Отсутствие параллельных внешних mutation остаётся операционным предусловием
disposable smoke: recovery определяет новый IP/record как единственную разницу
относительно hashed baseline и не может безопасно работать при конкурирующих
изменениях.

## Create / reconcile / delete

1. Открыть `/admin/infrastructure` и проверить provider preview.
2. Создать среду с уникальным именем. API возвращает `202` и `operationId`.
3. Дождаться `active`; timeline обязан содержать
   `reserve_public_ip` (отдельный floating IP с hashed baseline recovery),
   `create_server`, `reconcile_server` (VPS `on` и IP bound), `complete`.
   Reserve имеет десять durable attempts. Неоднозначный исход сохраняет
   `cleanup_required`; delete сначала обязан доказать совпадение live catalog с
   hashed baseline либо восстановить ровно один новый unbound IP и удалить его.
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
показывает IP и месячную оценку; provider credential сохраняется до cleanup.

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

## Read-only preflight и disposable smoke 2026-07-30

Первый read-only preflight подтвердил контракт catalog, но остановил mutation:

- test token принят Timeweb, account имеет состояние `ready`;
- balance положительный, provider catalog не degraded;
- `/api/v1/account/services/cost` вернул одну актуальную цену public IPv4:
  `180 ₽/месяц`;
- минимальный доступный preset на момент проверки: 1 vCPU, 1 GiB RAM,
  15 GiB SSD, `149 ₽/месяц`; суммарная оценка с IPv4 — `329 ₽/месяц`;
- Ubuntu 24.04 присутствует в provider catalog как
  `family=linux`, `name=ubuntu`, `version=24.04`;
- доступны один project и два SSH keys; их identifiers и names не сохраняются
  в публичном evidence;
- в тот момент account содержал один VPS и два public IPv4, поэтому hard limit
  закрыл create без mutation.

После очистки владельцем baseline составил 0 VPS и 1 существующий unbound IP.
Финальный независимо одобренный smoke использовал live region `ru-2`, Ubuntu
24.04 x86_64 и provider estimate `387 ₽/месяц` при owner cap `500 ₽`.

Фактический результат:

- отдельный floating IPv4 создан и durable ownership записан до server create;
- создан ровно один VPS, provider status прошёл `installing` → `on`;
- exact owned IP привязан к VPS и повторно сверен;
- replay исходного idempotency key вернул ту же create operation;
- fresh password + TOTP re-auth разрешила delete;
- VPS удалён первым, затем удалён exact owned floating IP;
- обе операции завершились `succeeded`, среда — `deleted`, активных owned
  ресурсов — 0;
- независимый финальный live catalog снова показал `ready`, 0 VPS и ровно тот
  же baseline из 1 unbound IP.

Token использовался только из ignored локального `platform/.env` с правами
`0600`. В Git, logs, evidence и Vercel environment он не переносился; реальный
Vercel project/deployment не создавался.
