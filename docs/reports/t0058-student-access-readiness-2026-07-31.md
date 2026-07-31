# T-0058 — student access и release readiness, evidence 2026-07-31

- Дата проверки: 2026-07-31
- Scope: provider-free student access к n8n, admin assignment, owner setup,
  post-course expiry, production full-story и обязательный cleanup
- Реализация student access: **PASS**
- Production cleanup: **PASS**
- Единый production full-story: **BLOCKED — свежая среда дважды не вышла из
  bootstrap**

Отчёт не содержит credentials, IP-адресов, provider/resource/operation IDs,
паролей, токенов или персональных данных.

## Реализованный контракт

- Миграция `0009_student_tool_access.sql` добавляет назначение n8n конкретному
  ученику и environment, срок, revocation и server-side snapshot основания
  production access.
- Admin API проверяет CSRF, роль, активное участие ученика в курсе, готовый
  `starter-kit`, healthy state, HTTPS URL и срок не дальше 366 дней.
- Production gate принимает только server-side mode `written_permission`,
  `commercial_agreement` или `product_owner_risk_acceptance` с bounded evidence
  reference. Последний режим фиксирует решение владельца продукта и не
  представляется как разрешение n8n.
- Student DTO содержит только `tool`, `displayName`, `state`, `launchUrl` и
  `expiresAt`. Provider, VPS, IP, тариф, стоимость, operation logs и admin
  controls отсутствуют.
- `ready_owner_setup_required` не имитирует автоматическое создание owner:
  интерфейс направляет ученика на официальный стартовый экран и запрещает
  передавать пароль платформе.
- После `expires_at` URL скрывается. Admin может выдать новый срок; иначе ученик
  получает инструкцию самостоятельного запуска. Передача VPS и billing не
  обещается.
- Удаление среды после прерванной установки сначала отменяет resumable install,
  затем ставит cleanup operation. Это убирает конфликт двух активных mutations
  и позволяет штатно очистить зависшую среду.

## Проверки кода

- ESLint и TypeScript — PASS.
- Unit/accessibility tests — PASS: 33 files / 133 tests.
- `npm run build` — PASS: Next.js 16.2.12, 38 static pages сгенерированы.
- `npm run test:integration` — PASS: 7 files / 55 tests, включая полный
  auth/student contract и cleanup после прерванной установки.
- `npm run test:workflow` — PASS: 1 file / 4 tests.
- `bash tests/run_static_tests.sh` — PASS: 25 root contract suites.
- Secret scan — PASS: 455 text files, 0 findings.

Integration tests подтверждают exact provider-free DTO, скрытие URL после
expiry, server-side evidence snapshot, немедленный revoke, отказ grant без
production evidence и безопасный переход interrupted install → automatic
delete.

## Production full-story

В production выполнены защищённый admin login, создание синтетического ученика,
назначение курса и проверка student route.

Проверенный degraded state на desktop 1280×800 и mobile 360×800:

- ученик видит только статус «Доступ ещё не подключён»;
- launch action отключён;
- IP, provider, VPS, root, порты, расходы и operation details отсутствуют;
- горизонтального переполнения нет;
- console errors/warnings отсутствуют.

Production gate настроен в режиме явного принятия риска владельцем продукта с
отдельной evidence reference. Это решение владельца, а не разрешение n8n.

## Воспроизводимый blocker готового состояния

Единый production full-story дважды запускался на свежей disposable Ubuntu
24.04 x86_64 среде с минимальной поддерживаемой конфигурацией.

В обоих запусках:

1. VPS и публичный IPv4 создавались штатно.
2. DNS проходил ожидание TTL и становился доступен.
3. Install operation доходила до server bootstrap.
4. HTTP endpoint не поднимался, operation становилась resumable.
5. Повторный resume не переводил среду в `ready_owner_setup_required`.

Поэтому в рамках T-0058 нельзя честно заявить production-проверку готового
student launch URL, owner setup, HTTPS/health и всей цепочки до ready state.
Зависимая T-0086 отдельно подтверждает этот lifecycle на другом disposable
стенде, но не заменяет единый T-0058 full-story:
[T-0086: n8n install, TLS/health, reboot и automatic cleanup](t0086-control-plane-n8n-install-e2e-2026-07-31.md).

## Read-only recheck и локальная remediation

После двух сбоев baseline повторно проверен без создания или восстановления
ресурсов:

- действующих VPS нет, две T-0058 машины доступны только в provider recovery
  window;
- A-запись `n8n.neurokurs.ru` отсутствует;
- обе среды в control plane имеют статус «Удалён», IP не назначен, 0 ₽/мес.;
- публичный installer `v0.1.0` повторно скачан и совпал с закреплённым SHA-256;
  verify-only завершился без системных изменений.

Code-level диагностика выявила два конкретных дефекта recovery-контракта:

1. `bootstrapping` наблюдался примерно пять минут, хотя один только bounded
   network wait допускает 20 минут, а полный installer — до 45 минут. Workflow
   поэтому освобождал transient step раньше собственного допустимого bootstrap
   budget.
2. Installer запускался непосредственно из одноразового `cloud-init runcmd`.
   После interruption у него не было отдельного systemd lifecycle, сохранённого
   attempt counter или автоматической безопасной повторной попытки; control
   plane resume мог только снова проверять порт 80.

Профиль `starter-kit-v0.1.1` исправляет этот контракт:

- отдельный enabled systemd oneshot запускается через `--no-block` и переживает
  завершение `cloud-final`;
- retry ограничен четырьмя попытками, persistent attempt budget и systemd
  start limit; `Restart=always` и бесконечный timeout не используются;
- status атомарно содержит phase/profile/attempt и redacted exit/error stage;
- log ограничен 64 KiB и скрывает IP и secret-like значения;
- повторный запуск сохраняет `.env`, encryption key и volumes, а success marker
  не позволяет повторять уже завершённый bootstrap;
- окно внешнего наблюдения ограничено 50 минутами и согласовано с 45-минутным
  systemd timeout.

Regression test фактически выполняет transient installer failure, проверяет
redacted status/log, повторно запускает тот же bootstrap до успеха и
подтверждает, что третий запуск не увеличивает attempt counter. Сгенерированные
cloud-config, Bash script и systemd unit отдельно проверены в Ubuntu 24.04 LTS
x86_64; production readiness из этих локальных проверок не заявляется.

## Provider restore audit 2026-08-01

Владелец отдельно подтвердил восстановление удалённого `n8n-neurokurs`,
разовый сбор 2 000 ₽, тариф 980 ₽/мес. и немедленное удаление после
диагностики. Провайдер потребовал пополнить недостающие 505 ₽; после пополнения
и подтверждения restore история операций зафиксировала четыре списания на
общую сумму 2 000 ₽. Дополнительные 980 ₽ не оплачивались.

Восстановленный сервер появился в списке действующих, но provider назначил
только IPv6. Из текущей среды IPv6 route отсутствовал, поэтому существующий SSH
key нельзя было использовать для подключения. Provider serial console был
доступен, но требовал интерактивный root-login; пароль не извлекался и не
передавался агенту. Сохранённые on-host cloud-init/systemd diagnostics получить
не удалось.

Чтобы остановить дальнейшее потребление, сервер немедленно удалён по ранее
подтверждённому владельцем сценарию. Проверка provider UI после удаления снова
показала пустой список действующих VPS; восстановленный ресурс доступен только
в разделе удалённых. Отчёт и evidence не содержат IP, provider IDs, credentials
или платёжные реквизиты.

## Обязательный cleanup

Оба созданных T-0058 стенда и кратко восстановленный для диагностики
`n8n-neurokurs` удалены.

- Control plane: обе среды имеют статус «Удалён», IP не назначен, 0 ₽/мес.
- Provider: список действующих VPS пуст; удалённые тестовые VPS доступны только
  в восстановительном окне провайдера.
- DNS: A-записей `n8n.neurokurs.ru` — 0.
- Не связанные с T-0058 существующие provider resources не изменялись.

Первый cleanup выявил, что прерванная resumable install блокировала delete.
Исправления `51375b4` и `f2ceebb` добавили видимый cleanup и безопасную отмену
прерванной установки перед удалением. Второй стенд после того же bootstrap
сбоя удалён уже штатным production-сценарием.

## Решение по lifecycle

Разработка T-0058 завершена на уровне кода и локальных/production-software
gates, но задача должна оставаться **blocked**, а не уходить на review:
acceptance criterion единого production desktop/mobile full-story с готовым
student view не выполнен.

Для снятия blocker нужен новый явно разрешённый способ production-validation,
который не повторяет платное восстановление без гарантированного доступа:
поддерживаемый IPv4/console channel либо другой заранее проверенный disposable
стенд. Затем требуется развернуть исправленный profile и пройти create → timeline →
`ready_owner_setup_required` → student launch → degraded/expiry → automatic
delete и снова подтвердить нулевой provider/DNS baseline.

Связанный create/delete baseline:
[T-0083: fresh VPS create/reconcile/delete](t0083-server-creation-e2e-2026-07-31.md).
