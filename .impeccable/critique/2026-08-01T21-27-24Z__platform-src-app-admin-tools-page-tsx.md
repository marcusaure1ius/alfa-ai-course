---
target: platform/src/app/admin/tools/page.tsx
total_score: 21
p0_count: 0
p1_count: 3
timestamp: 2026-08-01T21-27-24Z
slug: platform-src-app-admin-tools-page-tsx
---
# Аудит `/admin/tools`

Дата: 2026-08-02

## Итог

Страница визуально аккуратная, но её информационная архитектура и модель данных пока не готовы к нескольким сервисам. Текущий mental model перевёрнут: сначала показываются общие экземпляры и метрики, затем каталог сервисов, а доступы уводят в учеников. Масштабируемая модель должна читаться как `сервис → экземпляры сервиса → доступы`.

## Design Health Score

| Эвристика | Балл из 4 |
|---|---:|
| Visibility of system status | 3 |
| Match between system and real world | 2 |
| User control and freedom | 2 |
| Consistency and standards | 3 |
| Error prevention | 2 |
| Recognition rather than recall | 2 |
| Flexibility and efficiency | 1 |
| Aesthetic and minimalist design | 2 |
| Error recovery | 2 |
| Help and documentation | 2 |
| **Итого** | **21/40** |

## Anti-pattern verdict

- LLM/design review: pass with reservations; дизайн дисциплинированный, но композиция напоминает шаблонный dashboard из трёх метрик, большой empty state и повторяющихся CTA.
- Deterministic detector: `[]`, exit code 0, false positives отсутствуют.
- Browser: live-страница проверена в Chrome на desktop и mobile. Mutable overlay injection недоступна, поэтому использованы DOM snapshot, screenshot и computed layout evidence.

## Что работает

- Визуальная система цельная: спокойные поверхности, ясная типографика, единые кнопки и границы.
- Empty-state сообщает важную гарантию: незавершённая среда не выдаёт ученикам рабочую ссылку.
- Строка экземпляра содержит полезный минимум, а статус передаётся не только цветом.

## Приоритетные проблемы

1. **P1 — перевёрнутая иерархия и фиктивная multi-service модель.** Каталог сервисов расположен после общего списка экземпляров, глобальные CTA ведут в n8n, а сервер вручную присваивает всем средам `toolType: n8n`. Сделать сервис первичной сущностью overview и хранить явную привязку среды к сервису.
2. **P1 — ложный contextual action «Управлять доступами».** Ссылка рядом с экземплярами перенаправляет в общий список учеников и теряет контекст среды. Либо честно назвать переход в учеников, либо дать фильтрованный instance-centric просмотр доступов.
3. **P1 — общий alert ведёт в n8n независимо от проблемного сервиса.** В alert необходимо называть сервис, экземпляр и конкретное следующее действие.
4. **P2 — all-empty state повторяет одну мысль.** Три нуля, два setup CTA, access action и строка сервиса создают шум до появления первого экземпляра. В пустом состоянии показывать каталог сервисов и один следующий шаг.
5. **P2 — доступность и mobile semantics.** Вложенный `main`, псевдотаблица без table/grid semantics и компактные цели 36 px требуют исправления.

## Архитектурные ограничения

- `toolDefinitions` содержит только n8n.
- `environments` не имеет `tool_type`, а глобальный unique index разрешает лишь одну live-среду вообще.
- Create/install API не принимает идентификатор сервиса и реализован вокруг n8n.
- Detail route динамически строится по `tool.id`, но query не проверяет принадлежность среды сервису.
- `tool_access.tool_type` разрешает только n8n и требует environment даже для будущих сервисов, которым отдельная среда может быть не нужна.

## Personas

- Power admin: не хватает service grouping/filtering и точного пути к доступам конкретной среды.
- First-time admin: неясно различие между сервисом, экземпляром и активным доступом.
- Keyboard/screen-reader user: псевдотаблица не связывает заголовки и значения; targets меньше 44 px.

## Вопросы

1. Главная `/admin/tools` — каталог сервисов или оперативная очередь всех экземпляров?
2. Доступ остаётся student-centric или нужен также instance-centric контроль?
3. Будущие сервисы всегда имеют собственный экземпляр или возможны инструменты без environment?

## Run Notes

- Target slug: `platform-src-app-admin-tools-page-tsx`.
- Ignore list: отсутствует.
- Assessments: dual-agent, независимые до завершения Assessment A.
- CLI detector: выполнен, 0 findings.
- Browser visibility: не включалась, mutable injection отсутствовала.
- Overlay injection: skipped; использован screenshot/DOM fallback.
- Live server: не запускался в рамках аудита; существующий сервер не изменялся.
- Temporary cleanup: после записи снимка временный файл удаляется.
- Product context: `.impeccable/product.md` отсутствует; использованы канонические `docs/product-brief.md`, `docs/architecture.md` и `docs/course-platform-requirements.md`.
