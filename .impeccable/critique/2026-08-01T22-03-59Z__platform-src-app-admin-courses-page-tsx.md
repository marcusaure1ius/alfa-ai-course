---
target: Экран «Курсы» /admin/courses
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-08-01T22-03-59Z
slug: platform-src-app-admin-courses-page-tsx
---
Method: dual-agent (A: `/root/courses_design_review` · B: `/root/courses_detector_review`)

## Design Health Score

| # | Эвристика | Балл | Ключевая проблема |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Статусы и ошибки видимы, но успешное создание/сохранение подтверждается только закрытием окна |
| 2 | Match system / real world | 4 | Термины понятны: «Адрес курса», «Черновик», «Опубликован» |
| 3 | User control and freedom | 2 | Закрытие настроек без предупреждения уничтожает несохранённые изменения |
| 4 | Consistency and standards | 3 | Система цельная, но часть контролов ниже принятой hit-area 44 px |
| 5 | Error prevention | 3 | Удаление защищено хорошо; снятие с публикации не объясняет последствия |
| 6 | Recognition rather than recall | 3 | Основные действия видны; круглая стрелка не объясняет переход в разделы |
| 7 | Flexibility and efficiency | 1 | Для большого каталога нет сортировки, фильтров или bulk-пути |
| 8 | Aesthetic and minimalist design | 3 | Чисто, но badge «Курс» и крупная декоративная обложка дают лишний вес |
| 9 | Error recovery | 3 | Ошибки форм локальны; server recovery и явный success-feedback ограничены |
| 10 | Help and documentation | 2 | Helper-тексты хороши, контекстной помощи по публикации недостаточно |
| **Итого** |  | **27/40** | **Acceptable — прочная основа, но accessibility и dialog lifecycle нужно исправить** |

### Technical Audit Score

| Измерение | Балл | Ключевой факт |
|---|---:|---|
| Accessibility | 2/4 | Два `main`, потеря фокуса после AlertDialog, статус 4.14:1 |
| Performance | 3/4 | Лёгкая карточка, но счётчики вычисляются квадратическими filter-циклами |
| Responsive | 3/4 | На 375 px нет overflow; несколько targets имеют 16–40 px |
| Theming | 3/4 | Токены используются последовательно; dark destructive contrast 2.86:1 |
| Anti-patterns | 3/4 | Detector clean, один radius mismatch и чуть избыточная обложка |
| **Итого** | **14/20** | **Good — accessibility требует доработки до релиза** |

## Anti-Patterns Verdict

**PASS, с небольшими оговорками.** Экран не выглядит очевидно AI-сгенерированным: нет glassmorphism, градиентного текста, тяжёлых теней, декоративных метрик или случайной палитры. Neurokurs узнаваем по сдержанной поверхности, Styrene/Alfa typography и ясной иерархии.

Шаблонные признаки ограничены типовым card-grid, повторяющимся badge «Курс» и крупной абстрактной обложкой, занимающей почти половину карточки без сопоставимой рабочей ценности.

Bundled detector запущен по `page.tsx`, `course-card.tsx`, `course-create-form.tsx` и `course-settings-dialog.tsx`: exit `0`, JSON `[]`, findings `0`, false positives отсутствуют. Mutable injection недоступна: Chrome evaluate read-only, поэтому пользовательский overlay не создавался; использованы независимые DOM, computed-style и screenshot evidence.

## Overall Impression

Каталог уже выглядит как спокойный рабочий продукт: за несколько секунд понятны объект, статус и следующий шаг. Сильнее всего реализованы responsive-композиция и безопасное удаление. Главная возможность роста — довести dialog lifecycle и accessibility до того же уровня: сейчас интерфейс визуально обещает надёжность, но может молча потерять правки или фокус.

## What's Working

- На 1440 и 375 px карточка сохраняет ясную иерархию, а документ не получает горизонтальный overflow.
- Create/settings формы имеют labels, helpers, `aria-describedby`, inline errors и начальный фокус; новый курс честно создаётся черновиком.
- Delete-flow показывает 5 разделов, 10 заданий, потерю доступов и прогресса, требует точное название и держит destructive action disabled.

## Priority Issues

### [P1] Закрытие настроек молча стирает несохранённые изменения

**Почему важно:** X, Escape, backdrop и Cancel вызывают один reset, поэтому случайное закрытие длинного mobile-dialog уничтожает работу без предупреждения.

**Evidence:** `platform/src/components/admin/course-settings-dialog.tsx:119`, `:224`.

**Fix:** вычислять `dirty`, перехватывать закрытие при изменённых полях и показывать короткое подтверждение «Отменить изменения?». Явную кнопку подписать «Отменить изменения».

**Suggested command:** `$impeccable harden`.

### [P1] После отмены удаления клавиатурный фокус падает в `BODY`

**Почему важно:** keyboard/screen-reader пользователь теряет место в каталоге после Escape из AlertDialog.

**Evidence:** settings закрывается перед controlled AlertDialog в `course-settings-dialog.tsx:130–135`; у `:425–440` нет trigger/close-autofocus target. Live Chrome подтвердил `document.activeElement === BODY`.

**Fix:** сохранять ref исходной кнопки «Настроить» и явно возвращать фокус после закрытия AlertDialog либо возвращать пользователя в settings с валидной focus target.

**Suggested command:** `$impeccable audit`.

### [P1] Accessibility-контракт нарушен landmark-структурой и контрастом статуса

**Почему важно:** два вложенных `main` делают навигацию по landmarks неоднозначной, а текст «Опубликован» не достигает WCAG AA.

**Evidence:** `<main>` в `platform/src/app/admin/courses/page.tsx:21` вложен в `<main>` из `platform/src/components/ui/sidebar.tsx:314–316`; success badge из `course-card.tsx:57–59` измерен как 4.14:1 на текущей обложке.

**Fix:** оставить владельцем `main` только shell либо страницу; подобрать opaque success-soft/foreground пару, проверенную на всех четырёх tone карточки.

**Suggested command:** `$impeccable audit` + `$impeccable colorize`.

### [P2] Несколько интерактивных зон меньше 44 px

**Почему важно:** «Настроить» 36 px, visibility Select 36 px, стрелка 40 px и close control 16 px ухудшают mobile и motor accessibility.

**Evidence:** `course-settings-dialog.tsx:232–237`, `:376–378`; `button.tsx:28`; `select.tsx:40`; `course-card.tsx:113`; `dialog.tsx:71–73`.

**Fix:** отделить визуальную компактность от доступной 44 px hit-area; устранить конфликт specificity у Select.

**Suggested command:** `$impeccable adapt`.

### [P2] Публикация и успешное сохранение дают слишком слабую обратную связь

**Почему важно:** перевод опубликованного курса в черновик скрывает его от учеников как обычное текстовое редактирование, а успешный create/save обозначается только исчезновением окна.

**Evidence:** `course-settings-dialog.tsx:365`, `:411`; `course-create-form.tsx:75`; `course-settings-dialog.tsx:170`.

**Fix:** при `Опубликован → Черновик` показать inline impact warning; после success дать `aria-live` toast «Настройки курса сохранены» / «Курс создан как черновик».

**Suggested command:** `$impeccable clarify` + `$impeccable harden`.

## Cognitive Load

**Low: 0 явных failures из 8.** Single focus, chunking, grouping, hierarchy, minimal choices, working memory и progressive disclosure соблюдены. Пограничный случай — settings на mobile: scrollHeight 946 px при viewport 812 px, но последовательность остаётся понятной.

## Emotional Journey

Вход спокойный и уверенный; create-dialog снижает страх случайной публикации; карточка с 5 разделами и 10 заданиями создаёт ощущение собранного продукта. Эмоциональная долина возникает при молчаливой потере edits и неочевидном impact снятия публикации. Лучший high-stakes момент — delete-flow; финал create/save слабее, потому что исчезнувший modal заменяет явное подтверждение.

## Persona Red Flags

- **Alex:** при десятках курсов grid не предлагает sort/filter/recent; shortcut для create не обозначен.
- **Sam:** 16–40 px targets, nested `main`, focus loss и success contrast 4.14:1. При этом labels, focus entry, error relations и destructive semantics сделаны хорошо.
- **Jordan:** круглая стрелка визуально самостоятельна, но не объясняет «Открыть разделы»; create-copy и модель черновика понятны.
- **Riley:** быстро воспроизводит потерю edits через Escape/backdrop; empty/multi-card и server-error states доступны только по коду.

## Minor Observations

- Badge «Курс» повторяет контекст страницы; в multi-card состоянии достаточно статуса.
- Tone карточки зависит от позиции массива и меняется при reorder; стабильнее вычислять его из course id.
- Счётчики на `page.tsx:35–41` фильтруют sections/materials для каждого курса и масштабируются как `O(courses × content)`.
- `rounded-2xl` карточки даёт 24 px при guideline 16 px.
- White text на dark destructive `#FF675C` имеет 2.86:1; нужен семантический foreground token.
- Muted text live проходит AA лишь с небольшим запасом 4.61–4.71:1.

## Questions to Consider

- Какую рабочую информацию должна помогать узнавать обложка, занимающая почти половину карточки?
- Должно ли снятие публикации ощущаться как обычное сохранение текста, если оно меняет доступ учеников?
- Что важнее на карточке: декоративная стрелка или явная подпись «Открыть разделы»?
- При каком числе курсов каталог должен перейти от чистого grid к sort/filter/recent?

## Recommended Actions

1. **[P1] `$impeccable harden`** — защитить dirty settings, восстановить focus lifecycle и добавить success-feedback.
2. **[P1] `$impeccable audit`** — исправить landmark ownership, focus return и hit-area.
3. **[P1] `$impeccable colorize`** — привести success/destructive пары к WCAG AA во всех темах и tones.
4. **[P2] `$impeccable clarify`** — объяснить impact снятия публикации и назначение перехода в разделы.
5. **[P2] `$impeccable optimize`** — агрегировать счётчики один раз для больших каталогов.
6. **[P3] `$impeccable polish`** — убрать лишний badge, стабилизировать tone и radius.

Questions skipped: пользователь запросил последовательное системное ревью всех экранов; текущие находки достаточно конкретны для backlog без остановки серии на промежуточном выборе.
