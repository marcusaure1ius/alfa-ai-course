# Требования к платформе курса и управлению учебной инфраструктурой

**Статус:** требования первого этапа
**Задачи:** `T-0048`, упрощение deployment — `T-0059`
**Дата проверки внешних источников:** 2026-07-29
**Язык интерфейса первого этапа:** русский

## 1. Решение

Платформу курса следует создавать как изолированный control plane, который управляет пользователями, учебной средой и длительными инфраструктурными операциями. По решению владельца платформа разрабатывается в текущем репозитории в каталоге `platform/`. Репозиторий становится multi-product, но существующий `n8n Entrepreneur Starter Kit` остаётся независимо проверяемым и версионируемым установочным артефактом.

Первый пользовательский результат:

1. администратор входит в платформу;
2. открывает первый раздел боковой панели «Инфраструктура»;
3. создаёт основную учебную среду на Timeweb Cloud;
4. платформа создаёт VPS, DNS-запись, устанавливает проверенную версию starter kit, дожидается HTTPS и показывает итоговый URL;
5. администратор видит каждый шаг, ошибку и стоимость ресурсов;
6. администратор может безопасно удалить среду и связанные с ней платные ресурсы.

Интерфейс ученика на первом этапе ограничен авторизацией, личной стартовой страницей и просмотром основной готовой среды. LMS-функции добавляются последующими этапами.

## 2. Основания и границы документа

Требования согласованы с текущими [product brief](product-brief.md), [архитектурой starter kit](architecture.md), [инструкцией установки](installation.md), [Timeweb Cloud guide](timeweb-cloud.md) и [чистой установкой Timeweb](timeweb-clean-install.md).

Из соседних проектов изучены:

- `projects-control`: структура desktop/mobile shell, сгруппированная боковая навигация, журнал операций, ограничение стоимости, безопасное подтверждение удаления, bounded logs и redaction;
- `crm-flow`: базовый вариант Next.js, PostgreSQL и session-based авторизации;
- `alfa-deepeval-neuroffice`: durable jobs, leases, retries, отмена и восстановление после прерывания worker.

Из соседних проектов заимствуются паттерны, а не код и не их ограничения. В частности, локальная single-user модель `projects-control` не подходит платформе с ролями и облачными credentials.

Проверенные внешние факты:

- Timeweb позволяет создавать VPS через API и передавать `cloud-init` при создании; `cloud-init` выполняется без интерактивных запросов от `root` ([создание сервера](https://timeweb.cloud/docs/cloud-servers/manage-servers/create-server), [cloud-init](https://timeweb.cloud/docs/cloud-servers/manage-servers/cloud-init));
- Timeweb API token можно ограничить по сервисам и сроку действия; разрешение удалять сервисы без кода из Telegram задаётся отдельно ([API-токены](https://timeweb.cloud/docs/account-management/token));
- публичный IPv4 является отдельным тарифицируемым ресурсом, после удаления сервера может сохраниться и продолжить тарифицироваться ([публичные IP](https://timeweb.cloud/docs/public-ip));
- Timeweb поддерживает управление DNS-записями, включая `A`, `AAAA`, `CNAME` и `TXT`; стандартный TTL равен 600 секундам ([DNS-записи](https://timeweb.cloud/docs/domains/dns-records-management));
- для автоматического HTTPS Caddy домен должен разрешаться в сервер, порты 80/443 должны быть доступны, а данные Caddy — сохраняться между перезапусками ([Automatic HTTPS](https://caddyserver.com/docs/automatic-https));
- Vercel Workflow поддерживает durable functions и отдельно повторяемые steps, которые переживают рестарты/деплои ([Vercel Workflow concepts](https://vercel.com/docs/workflows/concepts));
- новый PostgreSQL для Vercel подключается через Marketplace, а не через снятый с продажи first-party Vercel Postgres; доступны Neon, Supabase и другие провайдеры ([Postgres on Vercel](https://vercel.com/docs/postgres), [Marketplace storage](https://vercel.com/docs/marketplace-storage));
- Vercel Cron вызывает Function endpoint только в production; endpoint должен проверять `CRON_SECRET` ([Vercel Cron Jobs](https://vercel.com/docs/cron-jobs));
- текущий starter kit поддерживает только Ubuntu 24.04 LTS x86_64, использует Caddy, PostgreSQL и закреплённый n8n; `.env` имеет права `0600`, а `N8N_ENCRYPTION_KEY` генерируется и хранится постоянно.

Цены, идентификаторы тарифов, образов и зон запрещено фиксировать в коде: они читаются из актуального API. Перед реализацией provider adapter исполнитель должен сверить DTO и доступные операции с текущей официальной спецификацией/SDK Timeweb. Этот документ не является свидетельством реального вызова Timeweb API, покупки VPS или выпуска сертификата.

Отдельный release gate — модель владения n8n. Официальное разъяснение n8n различает помощь клиенту с его собственным instance и hosting/management клиентских workflow и credentials ([n8n license use cases](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case), [Sustainable Use License](https://docs.n8n.io/sustainable-use-license/)). Если серверы остаются в аккаунте школы, а ученики используют размещённый и управляемый школой n8n, до production запуска требуется письменное подтверждение допустимой лицензии от n8n. Этот документ не является юридическим заключением.

Решения владельца от 2026-07-29:

- код платформы остаётся в текущем репозитории; один Vercel project использует deployable root `platform/`;
- Timeweb account, VPS, домен и расходы принадлежат владельцу курса;
- базовая DNS zone — `neurokurs.ru`, default hostname основной среды — `n8n.neurokurs.ru`;
- первый этап допускает не более одного активного n8n VPS;
- удаление полностью автоматическое после усиленного подтверждения в модальном окне;
- web/API, durable orchestration и база размещаются через Vercel и подключённый Marketplace Postgres;
- после курса владелец либо сохраняет ученикам доступ на определённый срок, либо выдаёт инструкцию самостоятельного запуска; автоматическая передача VPS между аккаунтами не обещается.

## 3. Цели первого этапа

### 3.1. Продуктовые цели

- Убрать ручной переход администратора между Timeweb, SSH, DNS и инструкциями установки.
- Сделать создание основной готовой учебной среды одной управляемой операцией.
- Сохранить для администратора прозрачность: какие ресурсы созданы, сколько они ориентировочно стоят и на каком шаге возникла ошибка.
- Не давать ученику доступ к облачному аккаунту, root SSH и административной инфраструктуре курса.
- Создать основу для будущих модулей курса без преждевременной реализации LMS.

### 3.2. Метрики результата

- Не менее 95% запусков в тестовом окружении либо завершаются состоянием `ready`, либо показывают конкретный неисправный шаг и безопасное действие восстановления.
- Между нажатием «Создать среду» и стартом фоновой операции проходит не более 2 секунд при нормальной работе control plane.
- Администратор видит обновление длительной операции не позднее чем через 5 секунд после изменения её состояния.
- Ни один API token, SSH private key, пароль или `N8N_ENCRYPTION_KEY` не попадает в браузер, application log, audit payload или Git.
- Удаление среды не оставляет принадлежащий ей тарифицируемый IPv4 незамеченным: ресурс удалён либо интерфейс показывает критический `cleanup_required`.

## 4. Scope

### 4.1. Первый этап, срез 1A — control plane и VPS

- responsive web-приложение на Next.js App Router и shadcn/ui;
- авторизация и серверный RBAC для ролей `admin` и `student`;
- desktop/mobile application shell;
- проверка настроенного Timeweb Cloud account без передачи raw token в браузер;
- чтение актуальных регионов, зон, образов, конфигураций и доступного баланса, если это предоставляет API;
- просмотр, создание и безопасное удаление единственного активного VPS;
- durable operations, audit log, cost guardrails и обработка частичного сбоя.

### 4.2. Первый этап, срез 1B — готовая среда n8n

- резервирование default hostname `n8n.neurokurs.ru` в управляемой зоне `neurokurs.ru`;
- создание DNS `A`-записи;
- bootstrap сервера через `cloud-init`;
- установка exact version/checksum starter kit с `N8N_HOST`;
- ожидание DNS, HTTPS и health checks;
- отображение URL и статуса n8n;
- установка n8n на совместимый уже созданный платформой сервер;
- удаление сервера, DNS, SSH-ключа и IP по зафиксированной ownership-модели.

Срезы входят в один продуктовый этап, но реализуются и проверяются последовательно. Нельзя объединять первую проверку Timeweb API с непрозрачным «создать всё» без промежуточных состояний.

### 4.3. Не входит в первый этап

- уроки, видео, домашние задания, прогресс, платежи и сертификаты об окончании курса;
- native iOS/Android приложения;
- массовое создание серверов;
- другие облачные провайдеры;
- управление n8n workflow и credentials учеников;
- автоматический backup/restore и обновление n8n;
- managed multi-tenant n8n, queue mode, HA и Kubernetes;
- передача VPS между аккаунтами Timeweb и автоматический перенос billing ownership;
- автоматическое создание owner account n8n без подтверждённого официального и безопасного интерфейса;
- автоматическая покупка домена;
- самостоятельная смена учеником тарифа, домена или сетевых правил.

## 5. Роли и доступ

### 5.1. Роли

| Возможность | Student | Admin |
|---|---:|---:|
| Войти/выйти, изменить собственный пароль | Да | Да |
| Открыть свою стартовую страницу | Да | Да |
| Видеть основную учебную среду и публичный URL | Да | Да |
| Видеть IP, provider ID, операции и стоимость | Нет | Да |
| Создавать/устанавливать/удалять сервер | Нет | Да |
| Проверять Timeweb connection и менять инфраструктурные профили | Нет | Да |
| Читать аудит инфраструктуры | Нет | Да |
| Управлять доступом учеников к ссылке на среду | Нет | Да |

Отсутствие пункта в UI не является контролем доступа. Каждая server action, server component query и API route выполняет проверку сессии, роли и принадлежности ресурса. Запрос ученика к `/admin/**` возвращает `403`, не раскрывая существование чужих ресурсов.

### 5.2. Авторизация

- Первый admin создаётся одноразовой bootstrap-командой или одноразовым setup flow, который после использования необратимо закрывается.
- Пароли хешируются Argon2id либо механизмом выбранного проверенного auth provider с эквивалентной защитой.
- Сессия хранится в `HttpOnly`, `Secure`, `SameSite=Lax` cookie; state-changing запросы защищены от CSRF.
- Login и recovery endpoints имеют rate limit и audit событий, но audit не хранит пароль или токен восстановления.
- Изменение provider token и удаление инфраструктуры требуют свежей повторной аутентификации; целевой максимум возраста подтверждения — 10 минут.
- Перед production release для admin включается MFA либо фиксируется отдельное решение с владельцем о принятом риске.
- Блокировка пользователя отзывает его активные сессии.

## 6. Информационная архитектура

### 6.1. Admin shell

Левая панель повторяет понятный паттерн `projects-control`, но отражает платформу курса:

1. **Инфраструктура** — первый и открытый по умолчанию раздел:
   - Серверы;
   - Операции;
   - Домены и DNS;
   - Подключение Timeweb.
2. **Ученики** — минимальный список, приглашение/создание и доступ к основной среде.
3. **Аудит**.
4. **Настройки**.

Desktop: сворачиваемая панель шириной около 256 px, хлебные крошки, global command/search по `Cmd/Ctrl+K`, основной scroll-контейнер. Mobile: панель открывается как shadcn `Sheet`, закрывается после перехода; ключевое действие доступно без горизонтального скролла.

### 6.2. Экран «Серверы»

Обязательные состояния: loading skeleton, empty state, частичная ошибка провайдера, список, отсутствие прав.

В списке отображаются:

- имя среды;
- владелец курса;
- статус платформы и сырой provider status во всплывающей детали;
- регион/зона и конфигурация;
- публичный IP;
- домен;
- n8n version и health;
- оценка текущих расходов из provider data;
- последняя операция и время обновления;
- меню допустимых действий.

На desktop используется shadcn `Table`, на узком экране — адаптивные `Card` без потери критических полей. Даже при лимите в один активный VPS экран обязан поддерживать состояния empty, creating, active, degraded и cleanup; преждевременная сложная фильтрация не требуется.

### 6.3. Карточка среды

Вкладки или секции:

- «Обзор»: URL, владелец курса, конфигурация и provider identifiers;
- «Операции»: timeline шагов, повторы и понятная причина ошибки;
- «ПО»: установленный профиль, version, health и действие установки;
- «Домен и TLS»: DNS record, состояние разрешения, issuer и срок сертификата;
- «Опасная зона»: удаление и cleanup.

Секреты, cloud-init body и private key никогда не отображаются. Технические логи ограничены по объёму, очищены от секретов и доступны только admin.

### 6.4. Мастер создания

1. Имя основной среды.
2. Регион/зона, актуальный preset и образ Ubuntu 24.04 x86_64.
3. Публичный/переносимый IP.
4. Default hostname `n8n.neurokurs.ru` с read-only отображением зоны и проверкой отсутствия конфликта.
5. Профиль установки n8n и его exact version.
6. Preview: создаваемые ресурсы, оценка цены, сетевые правила и план cleanup.
7. Подтверждение и переход к экрану операции.

Мастер не принимает произвольный shell script. Профили установки версионируются и выбираются из allowlist.

### 6.5. Визуальный язык

- Использовать официальный shadcn/ui как source-copied component foundation и Radix primitives.
- Базовый стиль — `new-york`, шрифт Geist, нейтральная палитра `zinc`/`slate`, один спокойный accent.
- Semantic colors применяются только по смыслу: success, warning, destructive, info.
- Использовать `Card`, `Badge`, `Table`, `DropdownMenu`, `Sheet`, `Tabs`, `Skeleton`, `Alert`, `AlertDialog`, `Tooltip`, `Command` и form components.
- Не собирать собственные кнопки, модальные окна, tabs или dropdown при наличии shadcn-компонента.
- Темизация строится на CSS variables/tokens; компоненты не содержат случайных hex-цветов.
- Все действия доступны с клавиатуры; focus видим; статус фоновой операции объявляется через `aria-live`.
- Минимальная поддерживаемая ширина — 360 px, touch target — не менее 44×44 px.

## 7. Сценарии и функциональные требования

### 7.1. Подключение Timeweb

`PROV-01` В первом этапе один raw API token настраивается только как encrypted production environment variable Vercel `TIMEWEB_API_TOKEN`. UI не принимает, не возвращает и не изменяет raw token.

`PROV-02` Admin запускает из UI read-only проверку настроенного token. Система получает account/capabilities и показывает только статус, дату проверки и доступные разрешения.

`PROV-03` Один `TIMEWEB_API_TOKEN` доступен только server-side Timeweb adapter в production deployment единственного Vercel project. Adapter предоставляет фиксированный typed allowlist необходимых read/create/update/delete/DNS операций и не принимает от browser произвольные provider URL, HTTP method, payload или resource ID. Реальная гранулярность token permissions и разрешение удаления без Telegram-кода проверяются по актуальным возможностям Timeweb перед production mutation.

Если владелец не разрешает автоматическое удаление без Telegram-кода, платформа создаёт cleanup operation в состоянии `manual_confirmation_required`, а не обходит защиту.

`PROV-04` Provider adapter находится только на сервере и имеет versioned internal interface. Browser никогда не обращается к Timeweb напрямую.

`PROV-05` Идентификаторы preset, OS, project, region/zone и стоимость загружаются из API. При недоступности provider UI показывает cached data как устаревшие и запрещает платные mutation, если безопасный preview невозможен.

`PROV-06` Preview и development deployments Vercel не получают production Timeweb tokens. Реальный provider smoke разрешён только из production deployment после отдельного budget gate.

### 7.2. Создание VPS

`INF-01` `POST` создания отвечает `202 Accepted` и `operationId`; HTTP request не ждёт установки VPS.

`INF-02` До mutation выполняется preflight:

- admin и свежая re-auth;
- provider credentials доступны;
- имя и subdomain уникальны;
- отсутствует другой активный или создаваемый VPS: hard limit первого этапа равен одному;
- хватает настроенного бюджета/доступного баланса;
- выбранные IP и сервер находятся в совместимой зоне;
- образ соответствует Ubuntu 24.04 x86_64;
- отсутствует другая активная mutation этой среды.

`INF-03` Платформа резервирует переносимый публичный IP, создаёт DNS `A` на него, затем создаёт VPS с этим IP и `cloud-init`. Это позволяет знать DNS target до запуска Caddy.

`INF-04` Если резервирование IP до VPS невозможно для выбранной конфигурации, adapter использует подтверждённый альтернативный порядок и фиксирует его отдельным provider capability flag.

`INF-05` На каждый созданный объект записываются provider ID, kind, ownership и operation ID. Комментарий/label ресурса, если поддерживается, содержит неприватный стабильный environment ID.

`INF-06` После timeout система не повторяет `create` вслепую. Она сначала reconciles provider resources по сохранённому ID/label и только после этого повторяет безопасный шаг.

### 7.3. Bootstrap и установка n8n

`N8N-01` Default путь первого создания использует versioned `cloud-init`, а не интерактивный SSH.

`N8N-02` `cloud-init`:

- не содержит provider tokens, application secrets, пароли пользователей или заранее сгенерированный `N8N_ENCRYPTION_KEY`;
- скачивает установочный артефакт exact release URL;
- проверяет закреплённый SHA-256;
- передаёт публичный `N8N_HOST`;
- запускает installer в non-interactive режиме;
- сохраняет локальные secrets только на VPS по контракту starter kit;
- записывает bounded результат bootstrap без вывода секретов.

Использование `releases/latest` в production profile запрещено.

`N8N-03` Exact profile ссылается на совместимый commit/release starter kit и pins из [architecture.md](architecture.md). Изменение версии выполняется новой версией profile и отдельной проверкой.

`N8N-04` Результат подтверждается наблюдаемыми проверками, а не только завершением `cloud-init`:

- provider server status рабочий;
- DNS `A` разрешается в ожидаемый IP;
- TCP 80/443 доступны;
- HTTPS certificate валиден для hostname;
- `/healthz` отвечает ожидаемо;
- страница editor открывается без redirect loop.

`N8N-05` Первый этап не использует исходящий SSH из Vercel: bootstrap выполняется только через `cloud-init`, а готовность подтверждается Timeweb status и внешними HTTPS/health checks. Добавление remote execution требует отдельного ADR с egress/network policy и уникальным ED25519 key; один общий root key запрещён.

`N8N-06` Платформа не заявляет, что owner account n8n создан автоматически, пока для выбранной версии не подтверждён официальный безопасный API/CLI. В готовой среде допускается финальное состояние `ready_owner_setup_required` с инструкцией открыть URL и создать owner.

`N8N-07` До выдачи production-среды ученику сохраняется evidence выбранной лицензионной модели: собственный instance ученика, коммерческое соглашение n8n либо иное письменное разрешение. Наличие технически работающего VPS не снимает этот gate.

### 7.4. DNS и TLS

`DNS-01` Первый этап поддерживает только заранее подключённую Timeweb DNS zone `neurokurs.ru`; default hostname основной среды — `n8n.neurokurs.ru`.

`DNS-02` Имя нормализуется, проверяется на уникальность и резервируется транзакционно до provider mutation.

`DNS-03` Платформа создаёт `A` record и сохраняет record ID. Удалять DNS разрешено только по сохранённому ID и подтверждённому ownership.

`DNS-04` UI различает `record_created`, `dns_propagating`, `dns_ready`, `tls_pending`, `tls_ready` и `tls_failed`.

`DNS-05` Caddy хранит persistent data. Публично открыты только 80/443; SSH 22 разрешён только с административного/worker CIDR. n8n 5678 и PostgreSQL наружу не публикуются.

### 7.5. Операции и состояния

```mermaid
stateDiagram-v2
  [*] --> validating
  validating --> reserving_ip
  reserving_ip --> creating_dns
  creating_dns --> creating_server
  creating_server --> provider_installing
  provider_installing --> bootstrapping
  bootstrapping --> installing_n8n
  installing_n8n --> waiting_dns
  waiting_dns --> issuing_tls
  issuing_tls --> health_check
  health_check --> ready
  health_check --> ready_owner_setup_required
  validating --> failed
  reserving_ip --> failed
  creating_dns --> failed
  creating_server --> failed
  provider_installing --> failed
  bootstrapping --> failed
  installing_n8n --> failed
  waiting_dns --> degraded
  issuing_tls --> degraded
  health_check --> degraded
  ready --> deleting
  ready_owner_setup_required --> deleting
  degraded --> deleting
  failed --> deleting
  deleting --> deleted
  deleting --> cleanup_required
```

`OPS-01` Operation и каждый step хранят durable status, attempt, started/finished timestamps, safe error code, correlation ID и provider request reference, если он доступен.

`OPS-02` Operation хранит Vercel Workflow run ID, а каждый provider step имеет уникальный logical step key. Повтор invocation или deployment не может одновременно зафиксировать два результата одного step; atomic database transition принимает только ожидаемое предыдущее состояние.

`OPS-03` Retry применяется только к классифицированным transient errors с exponential backoff и jitter. Validation, permission и insufficient funds errors не повторяются автоматически.

`OPS-04` Admin может повторить допустимый failed step, отменить ещё не начатую операцию или запустить reconciliation. Уже отправленная provider mutation не считается отменённой до подтверждения provider state.

`OPS-05` Для среды допускается не более одной активной mutation. Read-only reconciliation и health check могут выполняться параллельно.

### 7.6. Удаление

`DEL-01` До удаления платформа показывает preview:

- VPS, IP, DNS record и SSH key, которые будут удалены;
- данные n8n, которые будут безвозвратно потеряны;
- ресурсы, которые будут сохранены;
- текущую оценку расходов;
- наличие/отсутствие подтверждённого backup.

`DEL-02` Admin открывает destructive shadcn `AlertDialog`, вводит точное имя среды, отмечает подтверждение потери данных и проходит свежую re-auth. После этого cleanup выполняется полностью автоматически через server-only Timeweb adapter без дополнительного Telegram-кода; одной случайной кнопки недостаточно.

`DEL-03` Удаляются только ресурсы с сохранённым provider ID и ownership платформы. Поиск по похожему имени не является основанием удаления.

`DEL-04` Последовательность cleanup фиксируется state machine. После удаления VPS отдельно проверяется состояние публичного IP, потому что он может продолжить тарифицироваться.

`DEL-05` Если один ресурс не удалён, environment становится `cleanup_required`; UI показывает остаточный ресурс, расход и безопасное действие повтора. Audit/tombstone среды сохраняется.

`DEL-06` Опция «Сохранить IP» выключена по умолчанию и требует отдельного явного подтверждения стоимости.

## 8. Архитектура control plane

```mermaid
flowchart LR
  B["Browser\nAdmin / Student"] -->|HTTPS| W["Vercel project\nplatform/"]
  W --> DB["Marketplace PostgreSQL\nsource of truth"]
  W --> WF["Vercel Workflow\norchestration"]
  WF --> A["Server-only Timeweb adapter\nallowlisted operations"]
  A --> TW["Timeweb Cloud API"]
  A --> DNS["Timeweb DNS API"]
  CR["Vercel Cron\nreconciliation"] --> WF
  TW --> VPS["Основной учебный VPS"]
  VPS --> C["Caddy :80/:443"]
  C --> N["n8n"]
  N --> PG["Private PostgreSQL"]
  W --> S["production env\nTIMEWEB_API_TOKEN"]
  W --> AUD["Append-only audit"]
```

Начальный shape — изолированный deployable в текущем репозитории:

- `platform/` — единственный Vercel project root для Next.js, API, Workflow и Cron;
- Next.js App Router для web UI, server components и versioned API;
- Vercel Marketplace Postgres, например Neon, как единый source of truth; connection pooling и регион рядом с Functions обязательны;
- Vercel Workflow с `use workflow`/`use step` для crash-safe orchestration и retries;
- Vercel Cron с обязательным `CRON_SECRET` для периодического reconciliation;
- server-only Timeweb adapter с фиксированным allowlist вместо generic provider proxy;
- один `TIMEWEB_API_TOKEN` находится только в encrypted production environment; preview/development его не получают;
- основной n8n VPS не запускает control plane и не получает Vercel secrets.

Обычный Vercel Function не удерживает весь lifecycle в одном HTTP request: платные mutation стартуют durable Workflow и сразу возвращают `202`. Состояние не хранится в памяти Function. Workflow steps остаются идемпотентными на уровне PostgreSQL и ownership records, потому что provider mutation нельзя безопасно повторять только на основании автоматического retry.

Create и delete используют один adapter, но не общий произвольный proxy endpoint. Перед каждым delete server runtime повторно проверяет admin/RBAC, свежую re-auth, confirmed operation, ownership, допустимый state и idempotency key, а затем вызывает только конкретные allowlisted Timeweb methods. Provider resource ID берётся из PostgreSQL ownership record, а не из browser payload.

### 8.1. Внутренний API

Минимальный namespace:

```text
GET    /api/admin/infrastructure/environments
POST   /api/admin/infrastructure/environments/preview
POST   /api/admin/infrastructure/environments
GET    /api/admin/infrastructure/environments/:id
POST   /api/admin/infrastructure/environments/:id/install-n8n
DELETE /api/admin/infrastructure/environments/:id
GET    /api/admin/infrastructure/operations/:id
POST   /api/admin/infrastructure/operations/:id/retry
POST   /api/admin/infrastructure/provider-connections/test
GET    /api/admin/infrastructure/provider-connections/timeweb
GET    /api/student/environment
```

Mutation принимает клиентский `idempotencyKey`, возвращает `operationId` и не возвращает provider secret. Ошибка имеет `code`, безопасное русское `message`, `correlationId` и необязательные `fieldErrors`. DTO версионируются; сырой Timeweb response не становится публичным контрактом.

Browser-facing namespace не содержит generic Timeweb endpoint. Cleanup service принимает только внутренний exact versioned command с operation/environment IDs; replay, неподтверждённая operation и чужой provider resource отклоняются до вызова adapter.

### 8.2. Модель данных

| Сущность | Назначение |
|---|---|
| `users`, `auth_sessions`, `auth_factors` | identity, role, session revocation и MFA |
| `provider_connections` | provider kind, Vercel env aliases, capability snapshot и время проверки без raw secret |
| `infrastructure_profiles` | allowlisted OS, preset rules, installer version/checksum, network policy |
| `environments` | основная учебная среда, публичный URL и итоговый status |
| `provider_resources` | server/IP/DNS/SSH-key IDs, kind, zone и ownership |
| `domain_allocations` | FQDN, zone, DNS record ID и reservation state |
| `software_installations` | profile/version, health и timestamps |
| `operations`, `operation_steps` | Workflow run ID, durable state, logical step key, attempts, error codes и compensation |
| `audit_events` | append-only actor/action/target/result с redaction |

Критические уникальные ограничения:

- один активный FQDN;
- не более одного environment в active/creating/degraded lifecycle;
- один активный environment на provider server ID;
- один provider resource ID на account/kind;
- одна активная mutation на environment;
- один результат mutation на idempotency key и actor.

## 9. Безопасность и эксплуатационные ограничения

### 9.1. Секреты

- Provider token хранится только как encrypted production environment variable Vercel и не дублируется в PostgreSQL/Git.
- Token заменяется через Vercel project settings/CLI, после чего connection test обновляет только безопасную metadata.
- Logs, audit, telemetry, errors и support export проходят recursive redaction и имеют ограничение размера.
- Production database backup считается secret material и шифруется.
- Raw `cloud-init` output не отдаётся в браузер; сохраняется только очищенный bounded excerpt либо ссылка на защищённый диагностический артефакт с TTL.

### 9.2. Снижение blast radius

- Один Timeweb token доступен только server-side adapter в production deployment; browser, preview и development его не получают.
- Adapter имеет deny-by-default typed allowlist необходимых provider methods и не предоставляет generic proxy.
- Каждая mutation проверяет RBAC, свежую re-auth, hard limit одного VPS, ownership и idempotency; delete дополнительно требует exact-name confirmation и audit.
- Повышенный blast radius единого runtime осознанно принят владельцем для небольшой контролируемой аудитории. Это не равно изоляции отдельным deployable; условия возврата к ней заданы ADR-0006.
- SSH password login на создаваемом VPS выключен; исходящий SSH из Vercel не входит в первый этап.
- Firewall default-deny; 80/443 открыты публично, 22 — только trusted CIDR.
- Docker socket не монтируется в n8n; PostgreSQL и n8n port не публикуются.
- Platform admin не получает n8n encryption key через UI.

### 9.3. Аудит

Append-only audit фиксирует:

- входы, неуспешные входы, re-auth и изменения ролей;
- добавление, проверку, ротацию и удаление provider connection без raw secret;
- preview, запуск, повтор, отмену и результат инфраструктурной операции;
- actor, target, before/after безопасных полей, correlation ID и источник запроса;
- все destructive confirmations.

Изменение audit record через application API запрещено. Retention первого этапа — не менее 365 дней либо более строгий срок, утверждённый владельцем.

### 9.4. Стоимость и лимиты

- UI получает цену и баланс из Timeweb, когда API их предоставляет; иначе показывает «нет актуальных данных» и не выдумывает сумму.
- Конфигурация содержит warning/critical monthly budget, hard limit `1` активная среда и максимальную стоимость одного create preview.
- При превышении hard limit новые create блокируются; health, cleanup и delete остаются доступны.
- Платформа учитывает публичный IP как отдельный ресурс.
- Provider rate limits, суточный лимит выдачи IPv4 и отсутствие средств классифицируются отдельно и видны admin.

## 10. Нефункциональные требования

### 10.1. Надёжность

- Все платные/разрушительные операции выполняются Vercel Workflow и восстанавливаются после рестарта Function или нового deployment.
- Provider polling использует backoff и прекращается с понятным timeout state.
- Ежедневный reconciliation сравнивает базу и provider state, не меняя ресурсы автоматически без policy.
- Orphaned billable resource создаёт critical alert.
- Время в базе хранится в UTC, в UI показывается с timezone пользователя.

### 10.2. Производительность

- p95 обычного server-rendered read response — до 2 секунд при 1000 средах.
- Таблица использует server-side pagination.
- Списки и логи имеют bounded payload; необработанные provider responses не передаются клиенту.
- Статус операции обновляется через SSE/WebSocket либо polling до 5 секунд; выбор транспорта не меняет API состояния.

### 10.3. Доступность и responsive

- WCAG 2.2 AA для основных flows.
- Полная клавиатурная навигация, корректный focus trap в dialogs/sheets, labels и error association.
- Отсутствует горизонтальный scroll на 360 px в ключевых flows.
- Цвет не является единственным носителем статуса.
- Destructive dialog и operation timeline проверяются screen reader smoke test.

### 10.4. Наблюдаемость

- Structured logs с correlation/operation/environment IDs и без секретов.
- Метрики: queue depth, step duration, success/failure по шагам, retry count, orphan resources, API latency/error rate, active environments и cost guardrail events.
- Alert: Workflow не продвигается, deletion partial, provider auth invalid, provisioning failure, budget critical.
- UI показывает время последней синхронизации и не маскирует stale provider data как актуальные.

## 11. Проверки

### 11.1. Автоматические

- Unit: RBAC policy, state transitions, retry classifier, redaction, cost limits, ownership guard.
- Contract: Timeweb adapter против актуальной schema/SDK; ошибки/неизвестные enum status сохраняются безопасно.
- Integration: PostgreSQL constraints, duplicate logical step/idempotency key и resume Workflow на каждом критическом шаге.
- E2E: admin create preview/create/delete; student получает `403`; mobile create flow; typed destructive confirmation.
- Security: secret scan, dependency scan, CSRF/session tests, privilege escalation, raw provider response leakage.
- Accessibility: axe плюс keyboard smoke.
- Repository regression: platform checks запускаются из `platform/`, root starter-kit checks продолжают проходить; Vercel build не включает root `.env`, Compose volumes, backup archives или runtime secrets.

Timeweb тесты по умолчанию используют mock/fake adapter. Реальный smoke запускается только на disposable project с отдельным budget cap, exact cleanup plan и evidence. Ни mock, ни локальный test не считаются подтверждением реального VPS, DNS или TLS.

### 11.2. Приёмочные сценарии

`AC-01` Admin входит, mobile и desktop shell показывают «Инфраструктура» первым разделом; student не видит admin navigation.

`AC-02` Admin проверяет настроенный в Vercel production environment ограниченный Timeweb token и видит masked metadata; token отсутствует в browser traffic и PostgreSQL.

`AC-03` Двойное нажатие create с одним idempotency key создаёт одну operation и не более одного VPS.

`AC-04` Успешная операция создаёт VPS, DNS и n8n; external check подтверждает валидный HTTPS и health; UI показывает URL и фактические provider IDs.

`AC-05` Повтор step, рестарт Function или новый Vercel deployment между `creating_server` и `bootstrapping` не создаёт второй сервер, а продолжает/reconciles исходную operation.

`AC-06` Ошибка DNS или TLS переводит среду в `degraded`, сохраняет работающий VPS и показывает конкретное действие, не повторяя создание VPS.

`AC-07` Student видит только основную учебную среду и URL; прямые admin API возвращают `403`.

`AC-08` Delete без точного имени/re-auth запрещён. Подтверждённый delete удаляет принадлежащие среде VPS, DNS и IP либо показывает `cleanup_required` с остаточной стоимостью.

`AC-09` Application logs, audit export и browser traffic не содержат тестовых token/private key/password.

`AC-10` На ширине 360 px мастер создания и карточка операции работают без горизонтального scroll и доступны с клавиатуры.

`AC-11` Добавление `platform/` не изменяет root installer/runtime contract: существующие static/configuration checks starter kit проходят, а platform имеет отдельный package/build/test/deploy root.

`AC-12` При active/creating/degraded основной среде второй create блокируется до provider call; ни конкурентный запрос, ни retry не создаёт второй VPS.

`AC-13` Browser, preview и development не имеют `TIMEWEB_API_TOKEN`. После подтверждения modal production Workflow повторно проверяет RBAC/re-auth/operation/ownership и через server-only allowlisted adapter автоматически удаляет только owned ресурсы без Telegram-кода.

## 12. Рекомендуемая декомпозиция реализации

1. ADR: multi-product границы текущего репозитория, один Vercel deployment и secret storage.
2. Bootstrap `platform/`: Next.js/shadcn web, server-only provider boundary, Marketplace PostgreSQL, lint/test/CI без provider credentials.
3. Auth, bootstrap admin, `student`/`admin` RBAC и deny-by-default route policy.
4. Application shell, responsive navigation и пустые состояния.
5. Domain model, migrations, audit/redaction и idempotent Vercel Workflow runner.
6. Timeweb read-only adapter: connection test, capabilities, images, presets, zones, balance.
7. Срез 1A: preview/create/reconcile/delete VPS и IP с fake adapter, затем disposable provider smoke.
8. DNS ownership и managed subdomain.
9. Versioned bootstrap profile, cloud-init и callback/health observation.
10. Срез 1B: end-to-end n8n/DNS/TLS state machine.
11. Cost guardrails, Vercel Cron reconciliation, observability и production hardening.
12. Student environment card и управление доступом к основной среде.

Каждый пункт декомпозируется в Projects Control с зависимостями, acceptance criteria и отдельным review. `platform/` имеет отдельные от root starter kit package manifest, tests, Vercel deployment и secrets. Изменение platform не меняет root Compose/scripts/workflow distribution; изменение starter kit release не разворачивает platform автоматически. Общие изменения документации или release-контракта проходят обе группы проверок.

## 13. Зафиксированные решения и оставшиеся gates

| Вопрос | Решение владельца | Последствие |
|---|---|---|
| Где размещён control plane? | Один Vercel project с Root Directory `platform/`, Workflow, Cron и Marketplace Postgres | Длительные операции нельзя держать в одном HTTP request; Timeweb token доступен только server-side production adapter |
| Где находится код? | Текущий репозиторий, изолированный root `platform/` | Нужны отдельные CI, release, secrets и regression gates starter kit |
| Кто владеет VPS и оплачивает его? | Владелец курса/школа | До выдачи ученикам нужен license gate n8n и политика срока доступа |
| Какая базовая DNS zone? | `neurokurs.ru`, default `n8n.neurokurs.ru` | Zone должна обслуживаться через доступный Timeweb DNS API |
| Сколько VPS? | Один активный основной n8n VPS | Database constraint и preflight блокируют второй |
| Как удалять? | Полностью автоматически после destructive modal/re-auth | Единый server-side adapter проверяет ownership и вызывает только allowlisted delete methods; token должен разрешать удаление без Telegram-кода |
| Что получает ученик после курса? | Сохранённый доступ на срок, определяемый владельцем, либо инструкция самостоятельного запуска | Передача VPS/billing не входит в первый этап |
| Нужен ли обязательный backup перед delete? | В 1-м этапе явно предупреждать, но не обещать backup; добавить отдельным этапом | Текущий scope не содержит managed backup |
| Можно ли автоматически создать owner n8n? | Нет, пока не подтверждён официальный безопасный интерфейс для pinned версии | Нельзя использовать undocumented database mutation |
| Сколько admin и нужен ли MFA сразу? | Несколько admin разрешить позже; первый production admin с MFA | Provider token и delete имеют высокий риск |
| Нужен ли постоянный SSH после bootstrap? | Нет в первом этапе | Vercel не выполняет remote SSH; используется cloud-init и внешние health checks |

## 14. Gates реализации

### 14.1. Foundation Ready

Можно реализовывать `platform/`, auth/RBAC, shadcn shell, schema, fake adapter и Vercel Workflow, потому что владелец зафиксировал repository, deployment, DNS, ownership, delete mode и server-count limit. Foundation использует fake provider и не требует Timeweb credentials.

### 14.2. Real Mutation Gate

До первого реального create/delete должны быть выполнены все условия:

1. DNS zone `neurokurs.ru` подтверждена в Timeweb account и read-only test проходит;
2. один Timeweb token создан с минимально доступными service permissions, его фактические capabilities проверены, а secret добавлен только в Vercel production environment;
3. владелец установил денежный hard limit для smoke, а platform hard limit `1 VPS` включён;
4. disposable cleanup plan и ownership assertions прошли на fake adapter;
5. production admin использует MFA и свежую re-auth для destructive action;
6. n8n license gate закрыт до предоставления управляемой среды ученикам;
7. Vercel production Workflow/Cron, Postgres backup policy и secret redaction проверены evidence.

## 15. Двойной саморевью

### Проход 1 — полнота продукта

Проверены роли, desktop/mobile navigation, loading/empty/error states, create/detail/delete flows, границы 1A/1B, student minimum, метрики и acceptance scenarios.

Исправления после прохода:

- добавлен отдельный student flow, чтобы роль не оставалась только названием;
- разделены создание VPS и создание готовой n8n-среды;
- добавлены preview стоимости, degraded state и явная обработка оставшегося платного IP;
- автоматическое создание owner n8n вынесено из обещаний в открытое ограничение.
- добавлен обязательный license/ownership gate для случая, когда школа размещает n8n для учеников.

### Проход 2 — безопасность и реализуемость

Проверены trust boundaries, permissions Timeweb token, secret paths, destructive actions, retries, idempotency, atomic step transitions, DNS ownership, TLS prerequisites и соответствие текущему starter kit.

Исправления после прохода:

- первоначально provider credentials были разделены; решением владельца в ADR-0006 схема упрощена до одного production-only token с allowlisted server adapter;
- запрещены raw secrets в cloud-init, UI, audit и logs;
- добавлены уникальные SSH keys, stable worker egress и ограничение порта 22;
- зафиксированы ownership-based cleanup и reconciliation после timeout;
- запрещены hardcoded preset/price IDs и production `releases/latest`;
- реальный Timeweb smoke отделён от mock tests и требует бюджета/evidence.

Оставшиеся release gates не скрыты: они перечислены в разделах 13–14 и не должны подменяться предположениями реализации.

### Исправления после независимого review

Первый независимый review отклонил документ. Исправлены все блокирующие замечания:

- отдельный репозиторий заменён на изолированный `platform/` в текущем multi-product repository;
- добавлен ADR-0005 и актуализированы канонические product/architecture границы;
- определены независимые CI, release, runtime и secret boundaries platform/starter kit;
- Foundation Ready отделён от допуска к реальным платным Timeweb mutations;
- решения владельца по Vercel, `neurokurs.ru`, одному VPS, расходам и автоматическому delete внесены как обязательные constraints;
- удалены trailing whitespace, а повторная проверка выполняется по exact commit range.
