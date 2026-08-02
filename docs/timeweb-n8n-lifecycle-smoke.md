# Timeweb n8n/DNS/TLS lifecycle — production smoke

- Scope: T-0057, срез 1B
- Hostname: `n8n.neurokurs.ru`
- DNS zone: `neurokurs.ru`
- Ресурсы: один disposable VPS, один owned floating IPv4 и одна owned
  DNS `A`-запись

Этот smoke продолжает проверенный срез 1A из
[timeweb-lifecycle-smoke.md](timeweb-lifecycle-smoke.md). Он не создаёт Vercel
project/deployment, Timeweb project, SSH key или n8n owner.

## Закреплённый bootstrap profile

Production profile неизменяемо фиксирует:

- starter-kit release `v0.1.3`;
- installer
  `https://github.com/marcusaure1ius/n8n-entrepreneur-starter-kit/releases/download/v0.1.3/install.sh`;
- SHA-256 installer
  `2aa1a2192aa50214bf5af38c565561fa5674e4f1ddbbf39fb0309b5c985687ec`;
- n8n `2.29.10`;
- Ubuntu 24.04 LTS x86_64;
- timezone `Europe/Moscow`.

`cloud-init` содержит только публичный hostname и эти pins. Provider token,
пароли, application credentials и `N8N_ENCRYPTION_KEY` в него не передаются.
Installer создаёт secrets локально на VPS и сохраняет данные в persistent
volumes.

## Порядок create

1. Read-only preflight проверяет account, Ubuntu, project, SSH key, DNS zone и
   отсутствие `n8n.neurokurs.ru`. Цена, баланс и `monthly_fee` отображаются
   только как телеметрия: клиентский budget/balance gate отсутствует, а решение
   о допустимости списания принимает Timeweb. Повторный preflight после создания
   exact owned IP проверяет ID, адрес, expected zone и состояние `unbound`.
2. Platform транзакционно резервирует hostname.
3. Создаётся floating IPv4 с durable ambiguity marker.
4. До DNS POST сохраняются hash целевого `hostname:IPv4` и hash всех baseline
   record IDs. Read-only list использует документированный v1 GET, а mutation —
   актуальный v2 exact-FQDN contract:
   `POST /api/v2/domains/n8n.neurokurs.ru/dns-records` с
   `{type: "A", value, ttl}`; provider record ID атомарно связывается с
   reservation до продолжения. Delete использует тот же v2 exact FQDN и только
   сохранённый record ID.
5. VPS создаётся с exact `cloud-init`, документированной пропускной
   способностью preset и `network.floating_ip`, равным заранее сохранённому
   platform IPv4. Автоматический заказ второго public IPv4 запрещён. После
   provider `on` exact binding повторно сверяется; DNS указывает только на этот
   owned floating IP. Cloud-init перед первым внешним обращением ограниченно
   проверяет DNS и TCP/443.
6. Timeline проходит состояния `provider_installing`, `bootstrapping`,
   `waiting_dns`, `issuing_tls`, `health_check`.
7. Готовность требует одновременно:
   - public DNS указывает ровно на owned IPv4;
   - TCP 80/443 открыты;
   - TCP 5678/5432 закрыты;
   - certificate валиден для `n8n.neurokurs.ru`;
   - editor и `/healthz` отвечают `200`;
   - публичные n8n settings показывают форму первого owner setup.
8. Durable software status становится `ready_owner_setup_required`; создание
   owner остаётся ручным действием владельца.

Один успешный `cloud-init` или status VPS `on` не считается готовностью.
Transient проверки имеют bounded retries; исчерпание переводит среду в
`degraded`, а неоднозначная provider mutation — в `cleanup_required`.
Provider `server.status` сверяется с текущим enum официального Timeweb
Terraform provider. В частности, fresh VPS проходит transient
`software_install`/`configuring` до `on`; `blocked`, `no_paid`,
`permanent_blocked` и `removed` не могут быть приняты как готовность. Из-за
наблюдаемой eventual consistency сразу после create статусы `blocked` и
`no_paid` перепроверяются три раза с bounded delay, но никогда не активируют
среду; сохранившийся status становится terminal. `permanent_blocked` и
`removed` завершаются сразу.

## Superseded disposable E2E

Этот n8n/DNS/TLS flow superseded ADR-0009 и больше не является текущей кнопкой
создания сервера. Исполняемый `smoke:timeweb-disposable` удалён, чтобы plain-VPS
configurator нельзя было ошибочно проверить ожиданиями cloud-init, DNS и TLS.

Актуальный production-shaped create/reconcile/delete описан в
[Timeweb plain VPS smoke](timeweb-plain-vps-smoke.md). Возврат автоматической
установки n8n требует отдельного решения о support matrix и нового E2E.

Исторический smoke проверял:

- создаёт ровно один VPS/IP/A record;
- подтверждает exact profile и `ready_owner_setup_required`;
- проверяет DNS, 80/443, закрытые 5678/5432, TLS, editor и `/healthz`;
- выполняет typed soft reboot VPS;
- повторяет внешние проверки и требует тот же TLS certificate fingerprint,
  подтверждая сохранение Caddy data;
- удаляет exact сохранённый DNS record ID, затем VPS и floating IP;
- подтверждает provider baseline и отсутствие active owned resources.

Скрипт не печатает token, provider resource IDs, IP, auth material или response
bodies. При ошибке он запускает guarded recovery; если автоматический cleanup
не доказан, база сохраняется, среда остаётся `cleanup_required`, а provider
credential нельзя удалять до ручной проверки.

## Delete и ownership

Delete сначала разрешает возможные неоднозначные IP/DNS outcomes. DNS удаляется
только если durable metadata одновременно подтверждает environment, zone,
hostname, type, value и сохранённый provider record ID. Затем удаляются VPS и
floating IP. Уже отсутствующий exact resource считается идемпотентным успехом;
чужой или неоднозначный ресурс не удаляется.

DNS reconciliation читает все страницы exact FQDN endpoint по 100 записей и
сверяет provider `meta.total` с безопасным пределом 1000. Существующие TXT/MX
zone records не конфликтуют с owned `A`; любой `A`/`CNAME` на approved hostname
закрывает preflight. После неизвестного ответа POST можно принять только одну
новую exact `A`, отсутствовавшую в hashed baseline. Нулевая, чужая, duplicate
или несовпадающая запись приводит к десяти bounded reads, затем
`UNKNOWN_DNS_OUTCOME`/`cleanup_required`; reservation после начатого POST не
освобождается по одному пустому чтению. Если durable marker отсутствует,
provider mutation доказанно не начиналась и reservation освобождается без
provider delete. VPS create имеет аналогичный delete resolver: он десять раз
ищет единственный `course-platform:<environmentId>` marker, принимает найденный
VPS как owned и удаляет его; поздний или недоказанный outcome остаётся
`cleanup_required`, поэтому delete не может скрыть billable orphan.

## Сверка с официальным API

Контракты сверены 2026-07-30 с OpenAPI bundle
`https://timeweb.cloud/api-docs-data/bundle.json` и официальным Timeweb CLI:

- server create: `POST /api/v1/servers`, существующий IPv4 передаётся как
  `network.floating_ip`; deprecated `is_local_network` не используется;
- provider hostname — безопасная label `n8n-neurokurs-ru`; публичный FQDN
  `n8n.neurokurs.ru` передаётся только installer как `N8N_HOST`;
- preset `bandwidth` передаётся явно;
- reboot: актуальный `POST /api/v1/servers/{id}/reboot`, deprecated
  `/action` не используется;
- floating IP: отдельные create/bind/delete endpoints и exact resource ID;
- DNS create/delete: v2 exact-FQDN endpoints; v1 остаётся только для list,
  потому что OpenAPI не объявляет v2 GET;
- `no_paid` трактуется как billing failure, а не как сетевой статус.
- delete HTTP 423 трактуется как permanent confirmation gate, а не transient
  provider outage.

Ранее клиентский preflight блокировал запуск по расчётному 30-дневному порогу.
По решению владельца этот gate удалён: balance и `monthly_fee` остаются
наблюдаемыми полями, но не останавливают mutation. Provider status `no_paid`
по-прежнему считается terminal и запускает обязательный guarded cleanup.

После удаления gate выполнены три разрешённые production-shaped попытки.
Каждая дошла до Timeweb mutation, сам provider сохранил terminal
`server.status=no_paid`, после чего guarded recovery завершил environment как
`deleted`. Финальный read-only baseline: account `ready`, 0 VPS, один исходный
unbound IP и отсутствие `n8n.neurokurs.ru`. Это provider rejection, а не
клиентский лимит; успешный fresh-VPS E2E требует изменения состояния account у
Timeweb.

В evidence сохраняются только operation IDs, commit SHA, redacted timeline,
результаты проверок и итоговые количества ресурсов. Secrets и raw provider
responses запрещены.
