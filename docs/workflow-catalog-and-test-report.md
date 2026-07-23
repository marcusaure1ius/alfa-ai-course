# Каталог workflow и отчёт проверок

Проверено: 2026-07-23. Pinned runtime: `docker.n8n.io/n8nio/n8n:2.29.10`. Machine-readable каталог: [`tests/fixtures/workflow-catalog.json`](../tests/fixtures/workflow-catalog.json).

## Порядок импорта

```bash
./scripts/import-workflows.sh --input workflows/core
./scripts/import-workflows.sh --input workflows/adapters
./scripts/import-workflows.sh --input workflows/helpers
./scripts/import-workflows.sh --input workflows/diagnostics
./scripts/import-workflows.sh --input workflows/business
```

Всего импортируется 20 workflow: 9 core, 3 adapters, 1 beginner helper, 2 diagnostics и 5 business lessons. Стабильные IDs позволяют повторным импортом обновить шаблоны без дублей.

## Учебный слой

| ID | Название | Рабочих блоков | Code/Function |
|---|---|---:|---:|
| `businessTelegramAssistantV1` | Урок 1 — Telegram: черновик | 5 | 0 |
| `businessEmailAssistantV1` | Урок 2 — Почта: черновик | 5 | 0 |
| `businessGuardedLeadHandlerV1` | Урок 3 — Заявка: карточка | 5 | 0 |
| `businessDailyExecutiveDigestV1` | Урок 4 — Сводка | 6 | 0 |
| `businessRfEmailTelegramTriageV1` | Урок 5 — Письмо → Telegram | 6 | 0 |
| `helperBeginnerYandexPromptV1` | Служебный простой запрос к YandexGPT | 3 | 0 |

У каждого урока есть Manual Trigger, реальный trigger, Edit Fields, LLM-вызов и понятный финальный результат. Названия блоков и Sticky Notes написаны по-русски.

`Core` и `Adapter` — технический слой starter kit. Он остаётся закрытым для первого занятия и содержит строгую валидацию интеграций. Требование «без кода» контролируется для всех пяти учебных workflow и beginner helper.

## Связи

Проверяются восемь статических `Execute Workflow` ссылок:

- пять уроков вызывают beginner YandexGPT helper;
- helper вызывает Yandex AI Studio adapter;
- два урока с Telegram preview вызывают безопасный Telegram gateway.

Динамического выбора workflow нет. Все зависимости импортируются раньше вызывающего урока.

## Автоматические проверки

```bash
./tests/beginner_workflows_test.sh
./tests/workflow_catalog_test.sh
./tests/secret_scan.sh
```

Проверки подтверждают:

1. пять уроков идут в порядке 1–5;
2. в учебном слое нет Code, Function, Function Item и `jsCode`;
3. в уроке не более 12 исполняемых блоков и не более трёх выходных веток;
4. есть русские подписи, две обучающие заметки, ручной и реальный trigger;
5. нет прямых HTTP, Telegram Send или Email Send nodes;
6. Telegram preview остаётся в `testMode=true`, `draftOnly=true`;
7. email triggers не скачивают вложения;
8. все 20 JSON импортируются в две чистые базы закреплённого n8n;
9. повторный импорт business group не создаёт дубли;
10. очищенный export содержит 20 выключенных workflow без credential references.

Clean import подтверждает совместимость структуры, но не является проверкой внешних аккаунтов. Telegram, Gmail, Яндекс Почта и Yandex AI Studio требуют credentials владельца и отдельного контролируемого smoke-test.
