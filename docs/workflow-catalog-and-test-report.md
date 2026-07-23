# Lessons-only каталог workflow и отчёт проверок

Проверено: 2026-07-23. Pinned runtime: `docker.n8n.io/n8nio/n8n:2.29.10`. Machine-readable каталог: [`tests/fixtures/workflow-catalog.json`](../tests/fixtures/workflow-catalog.json).

## Что импортируется на учебный n8n

```bash
./scripts/import-workflows.sh --input workflows/business
```

Default distribution содержит только десять самостоятельных уроков. Core, Adapter и Diagnostics JSON остаются в репозитории как advanced-библиотека и не импортируются на beginner-стенд.

| ID | Название | Рабочих блоков | Code/Function | Sub-workflows |
|---|---|---:|---:|---:|
| `businessTelegramAssistantV1` | Урок 1 — Telegram: черновик | 5 | 0 | 0 |
| `businessEmailAssistantV1` | Урок 2 — Почта: черновик | 5 | 0 | 0 |
| `businessGuardedLeadHandlerV1` | Урок 3 — Заявка: карточка | 5 | 0 | 0 |
| `businessDailyExecutiveDigestV1` | Урок 4 — Сводка | 5 | 0 | 0 |
| `businessRfEmailTelegramTriageV1` | Урок 5 — Письмо → Telegram preview | 5 | 0 | 0 |
| `businessPolzaTextToImageV1` | Урок 6 — Картинка по тексту | 5 | 0 | 0 |
| `businessPolzaImageEditV1` | Урок 7 — Картинка по образцу | 5 | 0 | 0 |
| `businessTelegramLeadIntakeV1` | Урок 8 — Лид из Telegram | 5 | 0 | 0 |
| `businessTelegramPersonalAgentV1` | Урок 9 — Персональный помощник | 5 | 0 | 0 |
| `businessAccountingDocumentReviewV1` | Урок 10 — Первичный документ | 5 | 0 | 0 |

Каждый урок содержит:

- Manual Trigger с вымышленным примером;
- один реальный trigger: Telegram, IMAP, webhook или schedule;
- Edit Fields с понятными входными данными;
- один визуальный HTTP Request к фиксированному Yandex AI Studio или Polza.ai endpoint;
- локальный результат или preview без автоматической отправки.

## Credentials

В source JSON находятся только placeholder references. Import script удаляет их из staging copy, поэтому runtime получает выключенные workflow без credential references.

После импорта преподаватель создаёт credential `Yandex AI Studio Api-Key` для уроков 1–5 и `Polza.ai API` для уроков 6–10. В Polza credential заголовок `Authorization` содержит `Bearer …`; секрет не вставляется в JSON.

Telegram Trigger, IMAP и webhook credentials добавляются только перед контролируемым тестом реального сервиса. Telegram Send и Email Send nodes в beginner-уроках отсутствуют.

## Автоматические проверки

```bash
./tests/beginner_workflows_test.sh
./tests/polza_beginner_workflows_test.sh
./tests/workflow_catalog_test.sh
./tests/secret_scan.sh
```

Проверки подтверждают:

1. lessons-only каталог содержит ровно десять business JSON;
2. workflow идут в порядке уроков 1–10;
3. в них нет Code, Function, Function Item, `jsCode` и Execute Workflow;
4. в каждом ровно пять исполняемых визуальных блоков и не более трёх выходных веток;
5. названия и Sticky Notes написаны по-русски;
6. Yandex и Polza endpoints фиксированы, а API keys находятся только в credential placeholders;
7. почтовые triggers не скачивают вложения;
8. Telegram/email send nodes отсутствуют;
9. десять source JSON и десять credential-free staging JSON импортируются в чистый pinned n8n;
10. повторный import обновляет стабильные IDs без дублей;
11. пять Polza-уроков собирают ожидаемые request bodies, разбирают success responses и показывают понятный fallback на mocked fixtures;
12. image-to-image передаёт ровно один URL reference, Telegram paths не отвечают автоматически, а accounting path заканчивается ручной сверкой.

Clean import подтверждает совместимость структуры, но не является проверкой внешних аккаунтов. Yandex AI Studio, Polza.ai, Telegram, Gmail и Яндекс Почта требуют user-owned credentials и отдельного smoke-test.

## Credential-free Polza preflight

Проверено с учебного VPS 2026-07-23 без заголовка Authorization и без сохранения response body:

| Endpoint | HTTP | TLS verify | Content-Type |
|---|---:|---:|---|
| `POST https://polza.ai/api/v1/chat/completions` | 401 | 0 | `application/json; charset=utf-8` |
| `POST https://polza.ai/api/v2/images/generations` | 401 | 0 | `application/json; charset=utf-8` |
| `POST https://polza.ai/api/v1/media` | 401 | 0 | `application/json; charset=utf-8` |

Это подтверждает DNS/TLS/HTTP-достижимость и ожидаемую auth boundary именно из сети учебного VPS. Проверка не подтверждает успешный completion, доступ конкретной модели, баланс, цену или качество результата. Оставшийся gate: владелец регистрируется в Polza.ai, пополняет баланс, создаёт API key и вводит его непосредственно в Credentials n8n.

## Реальный Polza.ai smoke-test

Проведён 2026-07-23 с user-owned тестовым ключом и только на синтетических данных. Ключ введён владельцем непосредственно в n8n и не сохранён в Git или evidence. Перед изменением runtime создан и проверен backup:

`/opt/n8n-backups/n8n-backup-v1-20260723T124029Z-386842.tar.gz`

| Урок | Модель | Фактический результат | Стоимость успешного вызова |
|---|---|---|---:|
| 6 — картинка по тексту | `openai/gpt-image-1.5` | `success`; PNG 1254×1254 получен с `s3.polza.ai` и визуально проверен | 3 ₽ |
| 7 — картинка по образцу | `google/gemini-2.5-flash-image` | `completed`; PNG 1024×1024 получен с `s3.polza.ai`, товар перенесён на фон кофейни | 3 ₽ |
| 8 — карточка лида | `openai/gpt-4o` | `success`; выделены Анна, `@anna_demo`, уборка офиса 120 м² и следующий вопрос | 0,11925871 ₽ |
| 9 — персональный помощник | `openai/gpt-4o` | `success`; получен русскоязычный план планёрки без автоматических действий | 0,31268726 ₽ |
| 10 — первичный документ | `openai/gpt-4o` | `success`; извлечены номер `100`, сумма `12000`, валюта `RUB`, низкая уверенность и список полей для сверки | 0,39486104 ₽ |

Сумма пяти успешных вызовов — около 6,83 ₽. Неуспешные provider attempts в эту сумму не включены: фактическое списание по ним нужно смотреть в кабинете Polza.ai.

Во время проверки обнаружены и исправлены две актуальные несовместимости:

- пример `dall-e-3` из документации Polza.ai на реальном endpoint вернул `BAD_REQUEST: модель не найдена`; урок 6 переведён на модель из текущего публичного каталога `openai/gpt-image-1.5`;
- `qwen/image` принял image-to-image запрос, но upstream вернул `INTERNAL_ERROR`; урок 7 переведён на документированный Nano Banana `google/gemini-2.5-flash-image`, после чего запрос завершился успешно.

Для HTTP Request с raw JSON body оставлено автоопределение response format. В pinned n8n 2.29.10 явный `responseFormat=json` возвращал поток вместо разобранного JSON; отдельный fixture-test не позволяет вернуть эту настройку.

Итоговая runtime-проверка после smoke:

- ровно 10 workflow, активных — 0;
- credential Polza выбран в 5 из 5 HTTP Request уроков 6–10;
- Code/Function nodes — 0;
- outbound Telegram/email nodes в уроках 6–10 — 0;
- секретные шаблоны в runtime export и evidence — 0;
- n8n после технического окна снова `healthy`.

## Внешние шаблоны

Внешние JSON не входят в lessons-only distribution. Сначала их нужно проверить на Code nodes, credentials, реальные получатели, доступность LLM из РФ и автоматические опасные действия. Research и shortlist: [курсы n8n и библиотеки готовых сценариев](research/2026-07-23-n8n-courses-and-templates.md).
