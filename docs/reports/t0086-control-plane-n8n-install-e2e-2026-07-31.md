# T-0086 — post-provisioning установка n8n, evidence 2026-07-31

- Дата проверки: 2026-07-31
- Scope: `timeweb-install-v1`, production Control Plane и один disposable VPS
- Итог: **PASS**
- Billable cleanup: **PASS, provider baseline восстановлен**

Отчёт намеренно не содержит IP-адрес, Timeweb resource IDs, operation IDs,
credentials, MFA и содержимое provider responses с такими значениями.

## Проверенный контракт

Установка запускалась отдельным действием для уже созданного owned plain VPS.
UI потребовал пароль, MFA, точное имя среды и отдельное подтверждение потери
данных. Browser request не содержал provider ID, OS ID, `cloud-init` или
произвольный mutation payload.

Server-side plan однозначно выбрал:

- существующий owned VPS и его единственный floating IPv4;
- Ubuntu 24.04 LTS x86_64;
- исходный SSH key из сохранённого create snapshot;
- профиль `starter-kit-v0.1.0`;
- release `v0.1.0` и закреплённый SHA-256 installer;
- n8n `2.29.10` и hostname `n8n.neurokurs.ru`.

За весь install flow provider catalog содержал ровно один VPS и два floating
IP: один исходный account baseline и один owned disposable IP. Второй VPS или
IP не создавался.

## Дефекты, найденные реальным E2E

Первый provider-side reinstall выявил две особенности актуального Timeweb
contract.

1. `PATCH /api/v1/servers/{id}` применял reimage, но transport возвращал
   неоднозначный `405`. Исправление записывает durable marker до вызова и после
   ambiguous response доказывает результат через live server status и exact OS,
   не повторяя переустановку вслепую.
2. Server subresource SSH keys поддерживает attach через `POST`, но не list
   через `GET`. Текущее наличие key определяется по глобальному
   `GET /api/v1/ssh-keys` и полю `used_by`; `POST .../ssh-keys` выполняется
   только при отсутствии exact key. Контракт подтверждён актуальными Timeweb
   OpenAPI, официальным CLI и regression tests. Во время диагностики key был
   также проверен через Timeweb UI; финальный recovery увидел его уже
   прикреплённым и не выполнял лишний attach.
3. Workflow повторно требовал свежий MFA на каждом durable retry. Через десять
   минут операция оставалась `running`, хотя worker уже завершился. Теперь
   account/session/password/MFA повторно проверяются на первом queued step, а
   авторизованная running operation продолжает reconciliation независимо от
   интерактивного окна. Для released transient step добавлено ограниченное
   возобновление той же operation; completed steps и ownership records
   переиспользуются.

Recovery был запущен из нового production deployment. Он продолжил ту же
operation с `provider_installing`, не повторил успешный destructive step и
дошёл до `ready_owner_setup_required`.

## Внешняя проверка готовности

После install подтверждены факты:

- DNS: ровно одна A-запись; SHA-256 нормализованного значения
  `2b320fc511781e5d100e9d36d85d44a6a956657b02f68c493f3a70c757a87da3`;
- TCP 80/443: open;
- TCP 5432/5678: closed;
- `GET /healthz`: `200`;
- `GET /`: `200`;
- `GET /rest/settings`: `200`;
- `showSetupOnFirstLoad=true`: owner автоматически не создавался;
- TLS subject: `CN=n8n.neurokurs.ru`;
- TLS issuer: Let's Encrypt;
- certificate expiry: 2026-10-29.

## Reboot

Из Timeweb UI выполнен Soft reboot. Наблюдалась реальная недоступность
(`000`), затем переходный `503`, после чего `/healthz` восстановился. Финальная
stability-проверка получила три последовательных `200`. VPS сохранил тот же
owned IP, TLS и owner-setup state.

## Delete и возврат baseline

Delete был запущен из Control Plane после fresh password/MFA и exact-name
confirmation. Итог:

- environment: `deleted`;
- active owned resources в UI: `0`, стоимость `0 ₽/месяц`;
- Timeweb после reconciliation: `0 VPS / 1 исходный floating IP`;
- A-записей `n8n.neurokurs.ru`: `0`;
- `/healthz` после удаления: недоступен (`000`);
- stale public URL и ready-state удалённой среды больше не показываются.

Следовательно, disposable VPS, его IP и DNS удалены, исходный account IP не
затронут, orphan/billable resources не осталось.

## Автоматические проверки

- provider install/lifecycle/mutation unit tests: PASS;
- platform unit suite: 29 files / 116 tests — PASS;
- integration suite: 6 files / 49 tests — PASS;
- Workflow suite: 1 file / 4 tests — PASS;
- ESLint и TypeScript: PASS;
- Next.js 16.2.12 production build: PASS;
- repository `make quality`: `QUALITY_FAILURES=0`, artifact
  `test-results/quality/20260731T120006Z-92781`, manifest SHA-256
  `31e27b6d268a7964a978bf1f8b367211d39382d278997e8b73b29bd2c6df70a2`;
- production deployment `dpl_AB9xhApiJQYvsJCHVusdTztWG46w`: READY;
- alias: `https://neurokurs.ru`.

Корневой `make quality`, commit SHA и независимое review прикладываются как
структурированное evidence в Projects Control.
