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
- Unit/accessibility tests — PASS: 32 files / 125 tests.
- `npm run build` — PASS: Next.js 16.2.12, 36 static pages сгенерированы.
- `npm run test:integration` — PASS: 7 files / 54 tests, включая полный
  auth/student contract и cleanup после прерванной установки.
- `npm run test:workflow` — PASS: 1 file / 4 tests.
- `bash tests/run_static_tests.sh` — PASS: 25 root contract suites.
- Secret scan — PASS: 446 text files, 0 findings.

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

## Обязательный cleanup

Оба созданных T-0058 стенда удалены через production control plane.

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

T-0058 должна оставаться **blocked**, а не уходить на review: acceptance
criterion единого production desktop/mobile full-story с готовым student view
не выполнен.

Для снятия blocker нужно получить cloud-init/systemd diagnostics через
поддерживаемый root/serial доступ, исправить или сделать устойчивее bootstrap,
затем на новой disposable среде пройти create → timeline →
`ready_owner_setup_required` → student launch → degraded/expiry → automatic
delete и снова подтвердить нулевой provider/DNS baseline.

Связанный create/delete baseline:
[T-0083: fresh VPS create/reconcile/delete](t0083-server-creation-e2e-2026-07-31.md).
