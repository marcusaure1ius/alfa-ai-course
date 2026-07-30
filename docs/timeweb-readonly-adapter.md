# Read-only Timeweb adapter платформы курса

- Проверено: 2026-07-29
- Scope: только чтение account/catalog state
- Реальные API-вызовы и выпуск token в рамках проверки не выполнялись

## Проверенные официальные источники

Контракт сверялся с официальными материалами Timeweb Cloud:

- [API documentation](https://timeweb.cloud/api-docs/) — Bearer authentication,
  структура ответов/ошибок, rate limit и версионирование endpoint;
- [официальный Go SDK](https://github.com/timeweb-cloud/go-sdk/tree/a5150b7fec777ada7ee99fa65434e75a84186e10)
  на commit `a5150b7fec777ada7ee99fa65434e75a84186e10`;
- [API token permissions](https://timeweb.cloud/docs/account-management/token);
- [регионы и зоны доступности](https://timeweb.cloud/docs/zony-dostupnosti/servisy-i-zony-dostupnosti).

Проверенная SDK schema использует:

| Данные | Endpoint |
|---|---|
| Account status | `GET /api/v1/account/status` |
| Баланс | `GET /api/v1/account/finances` |
| Серверы и status | `GET /api/v1/servers` |
| Preset catalog и актуальная цена | `GET /api/v1/presets/servers` |
| Операционные системы | `GET /api/v1/os/servers` |
| Регионы и availability zones | `GET /api/v2/locations` |

ID тарифов, ОС, регионов и зон не фиксируются в product configuration: adapter
получает их из этих endpoint и переводит в внутренний DTO
`timeweb-read-v2`.

## Важная граница provider response

Официальная модель списка серверов содержит не только безопасные поля, но и
`root_pass`, `vnc_pass`, `cloud_init`, networks и другие provider details.
Поэтому raw response нельзя передавать дальше adapter.

Внутренний DTO разрешает только:

- server ID, имя, status, region, zone и preset ID;
- preset ID, region, CPU, RAM, disk и цену;
- OS ID, family, name и version;
- region, country code и availability zones;
- balance/currency и признак блокировки account.

Неизвестный server status не приводит к падению UI. Он очищается до короткого
provider value, помечается как `unsupported`, а snapshot — как `degraded`.
Raw provider error message также отбрасывается. Наружу выходят только typed code,
безопасное русское сообщение, `correlationId` и `retryable`.

## Фактическая гранулярность token permissions

Официальная инструкция подтверждает две отдельные настройки:

1. `Ограниченные права для токена` выбирают доступные **сервисы**. Настройка
   доступна основному пользователю; token дополнительного пользователя наследует
   права этого пользователя.
2. `Удалять сервисы по API без кода в Телеграме` — отдельный флаг token.

В проверенных официальных docs/SDK не найден документированный endpoint
self-introspection token и не описан action-level выбор отдельных HTTP методов
внутри одного сервиса. Поэтому read-only connection test подтверждает только
фактически выполненные GET-запросы. Он не заявляет права create/delete и не может
подтвердить delete-bypass.

Перед production mutation владелец обязан отдельно проверить в панели Timeweb:

- token ограничен минимальным набором сервисов;
- срок действия подходит эксплуатационной политике;
- delete-bypass настроен осознанно;
- budget и cleanup gates выполнены.

## Runtime gate

- `preview`, `development` и локальная разработка всегда используют
  `FakeTimewebReadAdapter`, даже если переменная с token случайно присутствует;
- production вызывает Timeweb только при одновременных
  `VERCEL_ENV=production`, `PLATFORM_PROVIDER=timeweb` и наличии
  `TIMEWEB_API_TOKEN`;
- `TIMEWEB_API_TOKEN` не входит в `.env.example`, browser DTO, PostgreSQL,
  application logs или audit;
- browser route не принимает provider URL, HTTP method, payload или resource ID;
- connection endpoint доступен только admin и защищён session policy и CSRF.

Эта проверка не является evidence реального Timeweb account, VPS, баланса,
permission set или оплаченной операции.
