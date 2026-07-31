# T-0058 — student access и release readiness, evidence 2026-07-31

- Дата проверки: 2026-07-31
- Scope: provider-free student n8n access, admin assignment, owner setup,
  post-course expiry и release gates
- Технический итог: **PASS**
- Production student release: **BLOCKED — нет документального license evidence**

Отчёт не содержит provider credentials, IP, resource/operation IDs, пароль
локального browser fixture или ссылку на будущий лицензионный документ.

## Реализованный контракт

- Миграция `0009_student_tool_access.sql` добавляет отдельное назначение n8n
  конкретному ученику и environment, явный срок, revocation и snapshot
  лицензионного evidence.
- Admin API проверяет CSRF, роль, активный course membership, готовый
  `starter-kit`, healthy state, HTTPS URL и срок не дальше 366 дней.
- License gate fail-closed: grant допускает только server-side mode
  `written_permission` или `commercial_agreement` и bounded evidence reference.
  Browser не получает mode или reference.
- Student DTO содержит ровно `tool`, `displayName`, `state`, `launchUrl` и
  `expiresAt`. Provider, VPS, IP, тариф, стоимость, operation logs и admin
  controls отсутствуют.
- `ready_owner_setup_required` не имитирует автоматическое создание owner:
  интерфейс направляет пользователя на официальный стартовый экран и запрещает
  передавать пароль платформе.
- После `expires_at` URL скрывается. Admin может выдать новый срок; иначе
  ученик получает направление за инструкцией самостоятельного запуска. Перенос
  VPS и billing не обещается.

## Проверки кода

- `npm run quality` — PASS:
  - ESLint;
  - TypeScript;
  - 32 unit test files / 125 tests, включая два automated accessibility checks;
  - Next.js `16.2.12` production build, 35 routes.
- `npm run test:integration` — PASS: 7 files / 53 tests.
- `npm run test:workflow` — PASS: 1 file / 4 tests.
- `bash tests/run_static_tests.sh` — PASS: 25 root contract suites.
- Миграция применена на local PostgreSQL 17 и повторный checksum check прошёл.

Integration tests отдельно подтверждают:

- exact provider-free DTO;
- скрытие URL после expiry и при закрытом license gate;
- сохранение evidence snapshot только server-side;
- немедленный revoke;
- отказ grant без license evidence.

## Browser verification

Локальный Next.js проверен через реальный browser с PostgreSQL fixture.

- guest login: content present, error overlay отсутствует, console errors/warnings
  отсутствуют;
- admin student detail: license gate видим и grant disabled без evidence;
- 360 px admin: horizontal scroll отсутствует после исправления длинного email;
- 360 px student: horizontal scroll отсутствует, owner setup и expiry доступны,
  provider/VPS/IP/cost terms отсутствуют;
- 1280 px student: launch URL и owner setup корректно отображаются;
- на desktop/mobile error overlay и console errors/warnings отсутствуют.

Browser fixture использовал только синтетические локальные данные и
`local-browser-evidence`; это не production license evidence.

## Связанное production E2E

Текущий create/timeline/degraded/delete и n8n install lifecycle подтверждены
зависимостями задачи:

- [T-0083: fresh VPS create/reconcile/delete](t0083-server-creation-e2e-2026-07-31.md);
- [T-0086: n8n install, TLS/health, reboot и automatic cleanup](t0086-control-plane-n8n-install-e2e-2026-07-31.md).

Оба отчёта фиксируют реальные disposable Timeweb/Vercel проверки и возврат
provider baseline без остаточных billable resources. Новый student access слой
не развёртывался в production, поэтому единый production full-story после login
до student view в рамках T-0058 не заявляется.

## Оставшийся release blocker

Официальный n8n Help Center, повторно проверенный 2026-07-31, указывает, что
hosting и управление клиентскими workflows/credentials в собственном instance
требует Enterprise license, а явное разрешение по конкретному сценарию выдаётся
через `license@n8n.io`: [Which license do I need for my use case?](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case).

В текущей модели Timeweb account, VPS и расходы принадлежат школе. До
production student grant владелец должен предоставить одно из:

1. письменное разрешение n8n для этого учебного use case;
2. подходящее коммерческое соглашение n8n.

После этого нужно добавить production-only mode и evidence reference,
развернуть exact commit и выполнить единый desktop/mobile full-story с login,
admin assignment, student view, degraded state и automatic delete. До этого
задача и release остаются честно blocked.
