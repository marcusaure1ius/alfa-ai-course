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
| n8n student access | ученик входит в n8n по собственному аккаунту (ADR-0016); платформа выдаёт адрес инструмента и учитывает срок назначения, но **не** проксирует вход. Отзыв в платформе скрывает адрес и запрещает выдачу, однако фактический доступ прекращается только отключением аккаунта в самом n8n | student-access integration tests + license gate |
| n8n identities | owner setup только admin; grant автоматически находит/приглашает отдельного Member с совпадающим email; вручную задаётся только scoped management API key, gateway secret выводится из `AUTH_SECRET` и синхронизируется bootstrap | identity/invite/derived-secret tests + unique DB constraints |
| TLS | Production URL всегда `https`; TLS verification не отключается; Caddy — единственная публичная точка | resolved configuration assertion |
| Execution data | Pruning всегда включён; default age `168` часов и max count `10000` | resolved configuration assertion |

Образы PostgreSQL и Caddy используют собственные root entrypoints для инициализации volumes и привязки low ports. Поэтому baseline не добавляет непроверенный глобальный `cap_drop: ALL`, который может сломать официальный image lifecycle. Вместо этого запрещены дополнительные capabilities и `privileged`, а `no-new-privileges` обязателен для каждого сервиса. Более строгий capability allowlist требует отдельного runtime rehearsal и ADR.

## Browser security headers Neurokurs

Проверено 2026-08-04 на `https://neurokurs.ru` после выкатки; фактический
capture и скан логов — в
[отчёте](reports/t0104-security-headers-production-2026-08-04.md). Раздел
описывает `platform/`, а не VPS ученика.

Заголовки задаются в `platform/src/security-headers.ts`:

| Заголовок | Значение | Где применяется |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | все ответы, включая API |
| `X-Frame-Options` | `DENY` | все ответы, включая API |
| `Permissions-Policy` | `accelerometer`, `camera`, `display-capture`, `geolocation`, `gyroscope`, `magnetometer`, `microphone`, `payment`, `usb` — все `()` | все ответы, включая API |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | все ответы |

`Strict-Transport-Security` выдаёт платформа хостинга и здесь не дублируется.

Content-Security-Policy разделён по типу ответа:

- **документы** — политика с одноразовым `nonce`, который выдаёт
  `platform/src/proxy.ts` на каждый запрос. Next.js сам проставляет этот
  `nonce` framework-скриптам и собственным inline-вставкам;
- **`/api/**`** — `default-src 'none'; base-uri 'none'; form-action 'none';
  frame-ancestors 'none'`, потому что API отвечает только JSON и никогда не
  является документом.

### Роуты со своими заголовками

`next.config.headers()` не дополняет, а **перекрывает** одноимённые заголовки
ответа route handler. Это проверено на production-сборке: роут, вернувший
`referrer-policy: no-referrer` и собственный CSP, получил в ответе значения из
`next.config`.

Список `ROUTES_WITH_OWN_SECURITY_HEADERS` сейчас **пуст**: страницы перехода в
n8n удалены вместе с ticket-моделью (ADR-0016), и других роутов со своими
политиками не осталось.

## Токен приглашения n8n в логах Caddy

Ученик задаёт себе пароль по одноразовой ссылке `/signup?token=...` на managed
инстансе (ADR-0016). Токен равнозначен праву завести аккаунт ученика, поэтому
`config/Caddyfile.platform` редактирует его в логах. Здесь есть две ловушки, и
обе уже срабатывали:

- фильтр `query` читает подпараметры **только** из блока `{ ... }`. Однострочную
  форму Caddy принимает молча, оставляя `actions` пустым, — редакция не работает,
  а `caddy validate` и grep по конфигу этого не показывают;
- блок `log` внутри сайта настраивает только **access**-лог. Ошибки
  `reverse_proxy` пишет default-логгер, и без его отдельной настройки
  `http.log.error` печатает URI с токеном целиком.

Поэтому редакция задана в обоих логгерах, а гейт `compose-config` проверяет
результат `caddy adapt`, а не текст конфига: он требует непустой `actions` с
заменой `token` ровно в двух логгерах.

## Инструмент вне поисковой выдачи

Managed profile отдаёт собственный `robots.txt` с `Disallow: /` и ставит
`X-Robots-Tag: noindex, nofollow` на все ответы сайта.

Причина не косметическая. n8n — одностраничное приложение: на любой неизвестный
путь оно возвращает `index.html` с кодом `200`. Всё, что не входит в allowlist
Caddy, уходит в n8n, поэтому до правки **своего `robots.txt` не существовало** —
`/robots.txt` отдавал ту же HTML-оболочку. Практически это означало, что
неограниченное число URL на домене отдаёт страницу входа с заголовком
`n8n.io - Workflow Automation`, то есть под брендом чужого домена.

Собственный `robots.txt` обязан стоять **до** общего `handle`, иначе его
перехватывает проксирование. Гейт `compose-config` проверяет адаптированный
конфиг: обработчик с `Disallow: /` и заголовок с `noindex` должны существовать.

Это снижает поверхность, но **не является средством снятия предупреждения Safe
Browsing**: оно работает не через индексацию. Причина предупреждения
устанавливается только в Google Search Console — см. T-0117.

Механизм исключения сохранён намеренно. Исключение якорится на **точный** путь,
поэтому подпуть исключённого маршрута получает общие правила: совпадение по
префиксу молча лишило бы такой маршрут политики.

**Добавляя роут, который сам выставляет `Content-Security-Policy` или
`Referrer-Policy`, внесите его путь в `ROUTES_WITH_OWN_SECURITY_HEADERS`** —
иначе общее правило молча перекроет его политику. Именно так однажды чуть не
сломался вход ученика в инструмент.

`X-Frame-Options: DENY` согласован с `frame-ancestors 'none'`: встраивание
запрещено обоими механизмами одинаково.

### Осознанные послабления

`style-src` содержит `'unsafe-inline'`. Это не недосмотр: прогресс курса и
отступы оглавления задаются атрибутом `style`, а Radix UI позиционирует
всплывающие слои тем же способом в runtime. На скрипты послабление не
распространяется — `script-src` не содержит ни `'unsafe-inline'`, ни
`'unsafe-eval'` в production.

`'unsafe-eval'` добавляется только в development, где React использует `eval`
для восстановления стека серверной ошибки в браузере.

### Что фактически проверено

Автоматические тесты `platform/src/security-headers.test.ts` фиксируют состав
заголовков, согласованность `X-Frame-Options` с `frame-ancestors`, отсутствие
`unsafe`-расширений у скриптов в production и то, какие правила фактически
попадают на конкретный путь. Кейсы про исключения помечены как пропущенные,
пока список пуст, и оживают при добавлении первого такого роута.

Механизм исключения был проверен на production-сборке двумя пробными роутами:
путь вне списка получил значения из `next.config`, путь в списке сохранил свои;
подпуть исключённого маршрута получал общие правила.

Nonce использует 128 бит из `crypto.getRandomValues`.

Проверка в браузере на production-сборке подтвердила:

- все 17 скриптов страницы получают `nonce`, внешние бандлы загружаются,
  React-гидрация проходит;
- inline-обработчик события и `javascript:`-URL блокируются;
- запрос на чужой origin блокируется, свой — проходит;
- `/admin` без сессии отвечает `401` в том числе на prefetch-запрос.

Последний пункт — причина, по которой matcher `proxy.ts` намеренно **не**
исключает prefetch, хотя документация Next.js это предлагает: тот же proxy
закрывает `/admin`, и исключение отдало бы RSC-данные админки без проверки
доступа.

Тесты и локальная проверка не доказывают состояние production-домена. Такое
утверждение допустимо только с evidence реального прогона на `neurokurs.ru`
после выкатки.

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
