# Timeweb plain VPS — production smoke

- Scope: `T-0083`
- Deployment profile: `timeweb-provisioning-v3`
- Ресурсы: один disposable VPS и один owned floating IPv4
- Не входит: n8n, cloud-init starter kit, DNS, TLS и автоматический owner setup

Этот smoke проверяет текущую кнопку создания сервера после
[ADR-0009](../adr/0009-timeweb-deploy-configurator.md). Старый
`smoke:timeweb-disposable` относился к superseded n8n/DNS/TLS flow и удалён,
чтобы его нельзя было ошибочно принять за проверку plain-VPS configurator.

## До запуска

1. Использовать отдельную пустую PostgreSQL database, имя которой начинается с
   `course_platform_timeweb_smoke`. Production/control-plane database
   использовать запрещено.
2. Локальный `.env` должен иметь права `0600` и содержать только необходимые
   production-shaped значения:

   ```text
   VERCEL_ENV=production
   PLATFORM_PROVIDER=timeweb
   TIMEWEB_API_TOKEN=<test token>
   DATABASE_URL=<isolated smoke database>
   AUTH_SECRET=<random secret>
   ```

3. Timeweb account должен быть `ready`, без VPS и без параллельных mutation.
   Project, SSH key, Ubuntu image, Premium NVMe preset и цена IPv4 читаются из
   live Public API.
4. Владелец осознанно разрешает создание и последующее удаление одного
   тарифицируемого VPS и одного floating IPv4. Balance и provider price
   показываются как telemetry согласно ADR-0008; окончательное решение о
   списании принимает Timeweb.

## Запуск

```bash
cd platform
npm run smoke:timeweb-plain-vps -- --confirm-disposable-smoke
```

Без явного флага, production-shaped runtime, отдельной database или test token
скрипт завершится до mutation.

## Что проверяет smoke

1. Read-only preflight подтверждает ready account, ноль VPS, live project/SSH
   key, Ubuntu 26.04, актуальный allowlisted Moscow Premium NVMe preset и цену
   IPv4.
2. Начальный preflight выполняется **до** резервирования IPv4 и не требует ещё
   не существующий owned resource.
3. После создания IP повторный preflight принимает только exact durable
   external ID/address в выбранной availability zone и состояние `unbound`.
4. VPS создаётся без root password и без cloud-init, с выбранными live
   preset/OS/project/SSH key/bandwidth и exact owned floating IPv4.
5. Create становится `succeeded`, а environment — `active` только после:
   - provider status `on`;
   - exact binding IPv4 к owned VPS;
   - успешного применения явной backup policy;
   - durable шагов `reserve_public_ip`, `create_server`,
     `provider_installing`, `configure_backups`, `complete`.
6. Повтор того же idempotency key возвращает исходную operation даже при новом
   `checkedAt`.
7. Delete удаляет exact owned VPS, затем exact owned floating IPv4. Финальный
   live catalog обязан совпасть с baseline, а database — показать
   `environment.status=deleted` и ноль active owned resources.

## Ошибка и cleanup

При ошибке скрипт:

- возобновляет bounded reconciliation, если environment ещё `creating`;
- переводит незавершённую mutation в `cleanup_required`;
- создаёт destructive delete только после fresh MFA re-auth;
- запускает ownership-guarded cleanup;
- повторно сравнивает live VPS/IP counts с baseline.

Если automatic cleanup не доказан, smoke database сохраняется для recovery,
token нельзя отзывать, а в stderr выводится
`AUTOMATIC CLEANUP FAILED`. Provider IDs, IP, credentials и raw response body
не печатаются.

## Ожидаемый PASS

Финальный JSON содержит только operation IDs и безопасные агрегаты:

```json
{
  "status": "PASS",
  "deploymentMode": "plain-vps",
  "environmentStatus": "deleted",
  "activeOwnedResources": 0,
  "serverReachedOn": true,
  "exactIpv4Binding": true,
  "backupPolicyApplied": true,
  "idempotencyReplay": true
}
```
