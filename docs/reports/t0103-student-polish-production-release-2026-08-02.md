# T-0103 — production release полировки ученика

Дата: 2026-08-02

Ветка: `codex/t0058-student-release`

Проверенный product commit: `d9de10daffe3616cbe9c72d2c0979d7f542caeae`

## Результат

- Ветка опубликована в `origin` без untracked `main_design.pen`.
- Создан draft PR: <https://github.com/marcusaure1ius/alfa-ai-course/pull/4>.
- GitHub Actions `Platform quality` и `Quality gates` завершились успешно.
- Production deployment `dpl_CvLbp2Bcm4qHmCwK29XVcq9FMXQa` имеет статус
  `READY` и назначен alias <https://neurokurs.ru>.
- Production build применил миграции `0011`, `0012`, `0013`, `0014` и собрал
  44 маршрута Next.js.

## Проверки до публикации

- repository quality gates: `PASS`, 0 failures;
- secret scan: 538 текстовых файлов, 0 findings;
- unit tests: 289 из 289;
- integration tests: 82 из 82;
- durable workflow tests: 4 из 4;
- lint, typecheck и production build: успешно;
- production dependency audit: 0 vulnerabilities;
- Docker workflow import и PostgreSQL health: успешно.

Локальная установка `shellcheck` остановлена после зависшей загрузки Homebrew.
Это не оставило пропущенного release gate: точный `shellcheck` CI-профиль затем
успешно прошёл в GitHub Actions.

## Production smoke

- `/` отвечает `307` на `/login`, `/login` отвечает `200`;
- защищённые student/admin routes без сессии отвечают `401` и не раскрывают
  данные;
- student n8n API и gateway authorize без сессии отвечают `401` с `no-store`;
- desktop и mobile 375×812 login отображаются без Next.js error overlay;
- student recovery-экран показывает «Нужно войти» и реальный переход к login;
- синтетическая неверная пара email/password возвращает доступную ошибку без
  создания или изменения пользователя;
- deployment-scoped Vercel scans после smoke: error 0, fatal 0, 5xx 0,
  warning 0.

## Факты и ограничения

В production подтверждены HSTS `max-age=63072000` и `no-store` для динамических
и защищённых ответов. CSP, `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy` и `Permissions-Policy` пока не настроены. Этот существующий
security-header gap не расширял scope уже reviewed student-polish release и
должен закрываться отдельной задачей с browser regression после настройки CSP.

Проверка не использовала реальные credentials, не меняла пользовательские
данные, не вызывала Timeweb/provider и не запускала destructive lifecycle.
