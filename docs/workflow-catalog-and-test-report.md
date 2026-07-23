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
10. повторный import обновляет стабильные IDs без дублей.

Clean import подтверждает совместимость структуры, но не является проверкой внешних аккаунтов. Yandex AI Studio, Polza.ai, Telegram, Gmail и Яндекс Почта требуют user-owned credentials и отдельного smoke-test.

## Внешние шаблоны

Внешние JSON не входят в lessons-only distribution. Сначала их нужно проверить на Code nodes, credentials, реальные получатели, доступность LLM из РФ и автоматические опасные действия. Research и shortlist: [курсы n8n и библиотеки готовых сценариев](research/2026-07-23-n8n-courses-and-templates.md).
