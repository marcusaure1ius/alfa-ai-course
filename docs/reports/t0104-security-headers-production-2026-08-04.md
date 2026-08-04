# T-0104 — production capture browser security headers

Дата: 2026-08-04

Закрывает последний критерий `T-0104`: capture заголовков и скан логов на живом
домене. Остальные критерии закрыты в review до выкатки.

## Выкаченный артефакт

| Параметр | Значение |
|---|---|
| Deployment | `dpl_CUmEqCAiga21xN7N5CfajRQu4qYt` |
| Commit | `2596194` |
| Статус | `READY`, alias `neurokurs.ru` |
| Точка отката | `dpl_FuKENPSopVg6puk7bmycx1tVz17T` (commit `16d7081`) |

Выкатка ручная, `vercel --prod` из корня репозитория. Автоматический deploy из
`main` отключён `git.deploymentEnabled`.

Помимо заголовков в production уехали заплатки `undici`, `brace-expansion` и
`fast-uri`, а также новый адрес installer в bootstrap-профиле провижининга.

## Baseline до выкатки

На `https://neurokurs.ru/login` присутствовал только
`strict-transport-security` от платформы. `Content-Security-Policy`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` и
`Permissions-Policy` отсутствовали — это и был gap, зафиксированный в `T-0103`.

## Фактические заголовки после выкатки

Документ `https://neurokurs.ru/login`, ответ `200`:

```text
content-security-policy: default-src 'self'; script-src 'self'
  'nonce-9R/yamjIx/W/mDfvaDxotA==' 'strict-dynamic'; style-src 'self'
  'unsafe-inline'; img-src 'self' blob: data:; font-src 'self';
  connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; upgrade-insecure-requests
permissions-policy: accelerometer=(), camera=(), display-capture=(),
  geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
referrer-policy: strict-origin-when-cross-origin
strict-transport-security: max-age=63072000
x-content-type-options: nosniff
x-frame-options: DENY
```

API `https://neurokurs.ru/api/auth/csrf`, ответ `200`:

```text
content-security-policy: default-src 'none'; base-uri 'none';
  form-action 'none'; frame-ancestors 'none'
referrer-policy: strict-origin-when-cross-origin
x-frame-options: DENY
```

Gateway `https://neurokurs.ru/api/admin/tools/n8n/launch`, ответ `401`:

```text
referrer-policy: no-referrer
```

Общий CSP на этот путь не попал — политику страницы задаёт сам роут. Заголовок
`no-referrer` присутствует на ответе-ошибке благодаря `T-0115`.

## Браузер на живом домене

- 17 тегов `<script>`, у всех проставлен `nonce`;
- React-fiber прикреплён, форма входа отрисована;
- консоль пуста: ни ошибок, ни CSP violations.

Выпавший в этом прогоне nonce содержит `/` — то есть фактически проверен
случай, отдельно отмеченный reviewer как рискованный для парсера Next.js.

## Защищённые маршруты

| Путь | Ответ без сессии |
|---|---|
| `/admin` | `401` |
| `/admin/students` | `401` |
| `/student` | `401` |
| `/api/student/tools/n8n` | `401` |
| `/` | `307` на `/login` |

## Скан логов

Логи deployment за час после выкатки: `401` — 8, `200` — 3, `307` — 2,
`404` — 1. Прицельные запросы `statusCode=5xx` за два часа и уровни
`error`/`fatal` за два часа вернули пусто.

## Границы

Отчёт подтверждает состояние домена сразу после выкатки. Он не подтверждает
поведение под нагрузкой, работу реального входа ученика в n8n через gateway
(для этого нужен ученик с активным назначением) и корректность установки n8n по
новому адресу installer — последнее проверяется отдельным provisioning-прогоном.
