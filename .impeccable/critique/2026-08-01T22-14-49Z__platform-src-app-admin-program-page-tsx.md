---
target: Экран «Разделы» /admin/program
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-08-01T22-14-49Z
slug: platform-src-app-admin-program-page-tsx
---
Method: dual-agent (A: `/root/courses_design_review` · B: `/root/courses_detector_review`)

## Design Health Score

| # | Эвристика | Балл | Ключевая проблема |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Reorder сообщает saving/error, но create/edit не дают явный success feedback |
| 2 | Match system / real world | 2 | «Материалы» конфликтуют с «заданиями», authored и UI-нумерация дублируются |
| 3 | User control and freedom | 2 | Reorder отменяем и откатывается; settings теряет dirty edits при закрытии |
| 4 | Consistency and standards | 2 | Единые компоненты, но `1. Модуль 1` и 16–36 px controls нарушают систему |
| 5 | Error prevention | 3 | Непустой раздел не удаляется; изменение адреса/видимости не объясняет impact |
| 6 | Recognition rather than recall | 3 | Effective visibility и actions видимы; drag-инструкция только для AT |
| 7 | Flexibility and efficiency | 3 | Pointer/keyboard reorder и full-row links; bulk-flow отсутствует |
| 8 | Aesthetic and minimalist design | 3 | Плотный чистый список; `01` и двойные номера добавляют визуальный слой |
| 9 | Error recovery | 3 | Reorder rollback и blocked-delete ясны; server recovery live не проверен |
| 10 | Help and documentation | 3 | Helpers и SR-инструкции сильны; видимой подсказки reorder нет |
| **Итого** |  | **27/40** | **Acceptable — сильная основа, но терминология, нумерация и a11y требуют правки** |

### Technical Audit Score

| Измерение | Балл | Ключевой факт |
|---|---:|---|
| Accessibility | 2/4 | Nested `main`, success labels 4.26:1 |
| Performance | 3/4 | DnD рендерится эффективно, серверные counts повторно фильтруют коллекции |
| Responsive | 3/4 | На 375 px нет overflow; controls остаются 16–36 px |
| Theming | 3/4 | Токены системны; dark destructive foreground 2.86:1 |
| Anti-patterns | 3/4 | Detector clean; декоративный `01` — локальный numbered-marker tell |
| **Итого** | **14/20** | **Good — accessibility и hit-area нужно исправить** |

## Anti-Patterns Verdict

**PASS WITH RESERVATION.** Это зрелый product workspace: restrained palette, плотный список, отсутствие теней, glassmorphism, gradient text и лишних карточек. Локальный anti-pattern — чёрный `01`: у курса нет смысловой позиции, а с query одного курса он всегда становится первым. Похожая проблема возникает в строках: UI добавляет позицию к authored title `Модуль N`.

Detector по `page.tsx`, `sortable-section-list.tsx`, `section-dialogs.tsx`, `section-row-actions.tsx`: exit `0`, JSON `[]`, findings `0`, false positives нет. Mutable injection недоступна; overlay не создавался. Использованы отдельные DOM/computed/screenshot evidence.

## Overall Impression

Экран хорошо передаёт структуру курса и даёт редкий для admin UI качественный keyboard DnD. Самая опасная проблема — модель порядка конфликтует с текстом названия: после честного reorder интерфейс может показать `1. Модуль 4`, то есть подрывает доверие к своей основной функции.

## What's Working

- Effective visibility правильно учитывает публикацию курса и раздела.
- DnD имеет отдельную handle, Space/Enter/Arrow/Escape, localized announcements, saving state и rollback.
- Непустой раздел не удаляется каскадно: AlertDialog объясняет причину и возвращает фокус.
- На 375 px нет horizontal overflow; строки и dialogs адаптируются.

## Priority Issues

### [P1] Автоматическая и authored-нумерация противоречат reorder

**Почему важно:** live показывает `1. Модуль 1`; после перемещения интерфейс может одновременно сообщать две позиции.

**Evidence:** `platform/src/components/admin/sortable-section-list.tsx:128` добавляет `{index + 1}.`; реальные titles уже содержат `Модуль N`. Декоративный course marker — `platform/src/app/admin/program/page.tsx:69–73`.

**Fix:** отделить position от title и нормализовать legacy titles, либо полностью убрать UI-префикс; удалить бессмысленный `01` курса.

**Suggested command:** `$impeccable distill`.

### [P1] Settings молча уничтожает несохранённые изменения

**Почему важно:** X, Escape, backdrop и Cancel сбрасывают title/address/visibility без предупреждения.

**Evidence:** `platform/src/components/admin/section-dialogs.tsx:309`, `:364`.

**Fix:** вычислять `dirty`, подтверждать отмену и обновлять baseline после save.

**Suggested command:** `$impeccable harden`.

### [P1] Landmark и status contrast не достигают accessibility-контракта

**Почему важно:** вложенные `main` неоднозначны для screen reader; шесть success labels имеют 4.26:1 вместо 4.5:1.

**Evidence:** `platform/src/app/admin/program/page.tsx:30` внутри `platform/src/components/ui/sidebar.tsx:314–316`; статусы в `page.tsx:84–99` и `sortable-section-list.tsx:138–152`, token `globals.css:132`.

**Fix:** оставить один владеющий `main`; затемнить success foreground или дать проверенную opaque success pair.

**Suggested command:** `$impeccable audit` + `$impeccable colorize`.

### [P2] Row actions и Select системно меньше 44 px

**Почему важно:** drag 36×36, settings 114×36, delete 32×32, Select 36 px и close 16×16 ухудшают motor/mobile use.

**Evidence:** `sortable-section-list.tsx:117–125`; `section-dialogs.tsx:372–376`, `:175–179`, `:476–479`; `section-row-actions.tsx:111–120`; `select.tsx:40`; `dialog.tsx:71–73`.

**Fix:** единая 44 px interaction box; устранить specificity-конфликт Select, сохранив компактный глиф.

**Suggested command:** `$impeccable adapt`.

### [P2] Терминология и first-run state нарушают IA

**Почему важно:** «материалы» возвращают удалённое понятие рядом с «заданиями», а без курса disabled CTA говорит создать курс, но не ведёт к созданию.

**Evidence:** `section-dialogs.tsx:159`; `section-row-actions.tsx:50`, `:128`; no-course state `page.tsx:118`, disabled CTA `section-dialogs.tsx:143`.

**Fix:** заменить на правильные формы «задание» через plural helper; в no-course state показать ссылку `Создать курс` и последовательность `курс → раздел → задания`.

**Suggested command:** `$impeccable clarify` + `$impeccable onboard`.

## Cognitive Load

**Low: 1/8 failures.** Единственный провал — minimal choices на mobile: в строке конкурируют open, drag, visibility, chevron, settings и delete. Остальные критерии проходят благодаря ясной иерархии и progressive disclosure.

## Emotional Journey

Пять упорядоченных строк, visibility и published counts дают контроль. Двойная нумерация сразу создаёт ощущение ошибки. Reorder хорошо страхует через announcements и rollback. Blocked-delete объясняет recovery. Финал save/create слабый: modal исчезает без отдельного подтверждения, а dirty edits можно потерять.

## Persona Red Flags

- **Alex:** keyboard reorder полезен, но противоречивые номера делают результат недостоверным; bulk visibility отсутствует.
- **Sam:** DnD instruction и focus return после blocked-delete сильны; 16–36 px targets, nested `main` и 4.26:1 statuses требуют исправления.
- **Jordan:** «материалы» против «заданий», `01` и `1. Модуль 1` создают лишние понятия; no-course state не ведёт к действию.
- **Riley:** найдёт silent edit loss и конфликт номеров; rollback и guard непустого удаления выдерживают stress test.

## Minor Observations

- Settings description не упоминает редактируемый адрес; изменение адреса не предупреждает о сохранённых ссылках.
- Create/edit success обозначен только закрытием modal и refresh.
- `page.tsx:44–60` повторно фильтрует sections/materials; лучше pre-index или query counts.
- White on dark destructive `#FF675C` имеет 2.86:1.
- Mobile rows 120–141 px без overflow, но повторение actions удлиняет экран.

## Questions to Consider

- Должен ли номер быть частью названия, если порядок — отдельная изменяемая сущность?
- Нужна ли видимая подсказка drag при первом использовании?
- Следует ли изменение адреса предупреждать о старых ссылках?
- В no-course state создавать курс прямо здесь или вести в каталог?

## Recommended Actions

1. **[P1] `$impeccable distill`** — устранить двойную нумерацию и декоративный `01`.
2. **[P1] `$impeccable harden`** — защитить dirty settings и добавить success feedback.
3. **[P1] `$impeccable audit`** — исправить landmark, contrast и hit-area системно.
4. **[P2] `$impeccable clarify`** — унифицировать «задания» и объяснить impact address/visibility.
5. **[P2] `$impeccable onboard`** — дать прямой first-run путь при отсутствии курса.
6. **[P3] `$impeccable optimize`** — агрегировать counts без повторных filters.
7. **[P3] `$impeccable polish`** — финально проверить mobile density и системные tokens.

Questions skipped: серия экранных ревью продолжается, а найденные дефекты уже достаточно конкретны для приоритизированного backlog.
