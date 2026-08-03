# T-0058 — production full-story и финальный cleanup, 2026-08-01

- Итог: **PASS**
- Платформа курса: `https://neurokurs.ru`
- Проверенная среда: одна новая disposable Ubuntu 24.04 LTS x86_64
- Тариф в подтверждении: 980 ₽/мес. с обычной почасовой тарификацией
- Дополнительные услуги: backups выключены; restore и разовые платные опции не
  использовались
- Финальное состояние: VPS, публичных IP и DNS A-записей — 0

Отчёт не содержит credentials, IP-адресов, provider/resource IDs, паролей,
токенов, платёжных реквизитов или персональных данных синтетических учеников.

## Проверенный production-сценарий

1. Admin прошёл защищённый login и обязательную повторную аутентификацию перед
   платным create.
2. Preview показал одну конфигурацию: VPS 800 ₽/мес. и IPv4 180 ₽/мес., всего
   980 ₽/мес.; backups были выключены.
3. Создана ровно одна новая среда «Учебная среда», один VPS и один IPv4. Restore
   удалённых серверов не выполнялся.
4. Первый durable install исчерпал 20 попыток ожидания DNS. После фактического
   появления A-записи admin возобновил ту же operation; второй VPS или IP не
   создавался.
5. Та же машина была переустановлена в Ubuntu 24.04 и дошла до bootstrap.
6. Docker Hub вернул `429 Too Many Requests` для закреплённых образов. На том же
   VPS без изменения тарифа были загружены те же версии через
   `mirror.gcr.io`; Compose и локальный doctor завершились успешно.
7. Среда перешла в `ready_owner_setup_required`. Внешняя проверка подтвердила
   HTTPS, валидный TLS, `/healthz` HTTP 200, editor HTTP 200 и официальный
   owner-setup state. PostgreSQL 5432 и прямой n8n 5678 снаружи закрыты.
8. Admin назначил доступ активному синтетическому ученику. Student route показал
   только безопасную инструкцию первоначальной настройки, срок и launch URL.
9. Отдельный ученик без назначения увидел degraded state «Доступ ещё не
   подключён» и выключенный launch action.
10. Доступы были отозваны, затем normal durable delete удалил DNS, VPS и
    публичный IP в безопасном порядке.

Production runs:

- initial install: `wrun_01KYY79A2ZVKW0H5Z0XKC8C66R` — DNS retry budget
  exhausted, operation осталась resumable;
- same-operation resume: `wrun_01KYY7WF8QJ57HS4VA83189HKM` — completed;
- automatic delete: `wrun_01KYY9J2R6MT1YDPCHQAAFAN1P` — completed
  2026-08-01 09:13 UTC.

## Student security и UX

Ready и degraded варианты проверены на desktop. Для mobile был запрошен
breakpoint 360×800: горизонтального переполнения нет. В student UI отсутствуют
IP, provider/VPS/root, стоимость, operation logs и admin controls.

`ready_owner_setup_required` не заявляет автоматическое создание владельца:
ученик направляется на официальный стартовый экран n8n и получает указание не
передавать пароль платформе. После срока URL скрывается; admin может выдать
новый ограниченный срок, иначе действует инструкция самостоятельного запуска.
Автоматическая передача VPS не обещается.

Production access основан на явном принятии риска владельцем продукта с
bounded evidence reference. Это решение владельца продукта, а не письменное
разрешение n8n и не коммерческое соглашение с n8n.

## Исправление обнаруженного rate limit

Профиль `starter-kit-v0.1.2` сохраняет fail-closed поведение и автоматически
обрабатывает только точное сочетание installer exit code 23 и строки
`429 Too Many Requests`. В этом случае он:

- загружает только закреплённые версии PostgreSQL 17.10, Caddy 2.11.4 и n8n
  2.29.10 через `mirror.gcr.io`;
- присваивает им ожидаемые installer tags;
- завершает уже подготовленный Compose project и запускает local-only doctor;
- остаётся в той же bootstrap attempt и не создаёт инфраструктуру.

Другой код или сообщение ошибки не включает fallback и проходит через обычный
redacted failure status. Исполняемые regression tests проверяют как transient
failure → resume, так и exact 23/429 → pinned mirror → success.

## Финальный cleanup и отсутствие скрытого доступа

- Control plane delete завершился штатным durable workflow.
- Timeweb API после удаления: active servers — 0, floating IP — 0, provider DNS
  records — 0, A records — 0.
- После provider delete authoritative DNS некоторое время возвращал stale
  значение с TTL 600. Финальная проверка provider API и двух независимых
  публичных DoH-резолверов Cloudflare и Google подтвердила 0 A-записей; прямые
  повторные запросы к authoritative nameservers после серии проверок были
  недоступны по timeout и поэтому не заявляются как отдельный PASS.
- Кратковременный production maintenance endpoint использовался только для
  запуска штатного delete после потери browser admin session. Он требовал
  production-only bearer token и exact loss confirmation. После cleanup route
  удалён из исходников, token удалён из Vercel, а финальный POST возвращает 404.
- Финальный deployment `dpl_DscJcUaDu9aA5XRcih9m6nUqWFUY` имеет status Ready
  и aliases `neurokurs.ru`; migrations current, временного route нет.
- Удалённая среда терминальна: restore, resume и install для tombstone
  запрещены. Новых серверов после cleanup не создавалось.

## Финальные gates

- `npm run quality` — PASS: ESLint, TypeScript, 33 test files / 139 tests,
  Next.js 16.2.12 production build, 38 routes.
- `npm run test:integration` — PASS: 7 files / 56 tests.
- `npm run test:workflow` — PASS: 1 file / 4 tests.
- `bash tests/run_static_tests.sh` — PASS: 25 suites.
- `bash tests/secret_scan.sh` — PASS: 457 text files, 0 findings.
- Production deployment — Ready; `https://neurokurs.ru` отвечает штатным auth
  redirect, удалённый maintenance route — 404.

Исторический blocked-прогон, paid restore incident и последующее утверждение
терминальной политики удаления сохранены отдельно в
[предыдущем отчёте](t0058-student-access-readiness-2026-07-31.md). Текущий
full-story использовал только новую disposable среду и снимает тот blocker.
