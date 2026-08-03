---
target: Экран «Ученики» /admin/students
total_score: 24
p0_count: 0
p1_count: 3
timestamp: 2026-08-01T22-26-00Z
slug: platform-src-app-admin-students-page-tsx
---
Method: dual-agent (A: `/root/courses_design_review` · B: `/root/courses_detector_review`)

## Design Health Score

| # | Эвристика | Балл | Ключевая проблема |
|---|---|---:|---|
| 1 | Visibility of system status | 3 | Count/filter видимы; отдельного success-state создания нет |
| 2 | Match system / real world | 3 | Термины ясны; mobile `0 / 10` не имеет подписи |
| 3 | User control and freedom | 2 | Row navigation хорош; clear filters нет, чувствительные поля сохраняются после Cancel/X |
| 4 | Consistency and standards | 2 | Фильтр использует платформенный Select, create-dialog — native select |
| 5 | Error prevention | 2 | Email/password валидируются, но ручной пароль и partial create создают высокий риск |
| 6 | Recognition rather than recall | 3 | Labels и full-row affordance ясны; mobile progress требует догадки |
| 7 | Flexibility and efficiency | 2 | Поиск/фильтр есть; pagination, sorting и bulk actions отсутствуют |
| 8 | Aesthetic and minimalist design | 3 | Чисто; mobile filter panel занимает много первого экрана |
| 9 | Error recovery | 2 | Zero-results понятен; partial create не даёт прямого recovery path |
| 10 | Help and documentation | 2 | Password helper полезен; безопасный delivery/activation flow отсутствует |
| **Итого** |  | **24/40** | **Acceptable — clean UI, но создание аккаунта требует переработки** |

### Technical Audit Score

| Измерение | Балл | Ключевой факт |
|---|---:|---|
| Accessibility | 2/4 | Nested `main`, form boundaries 1.57:1, малые hit areas |
| Performance | 2/4 | Полный dataset фильтруется в памяти и дважды рендерится |
| Responsive | 4/4 | На 375 px нет overflow, таблица превращается в mobile rows |
| Theming | 4/4 | Target использует системные color/spacing tokens |
| Anti-patterns | 2/4 | Два параллельных DOM-дерева и повторяющийся landmark ownership |
| **Итого** | **14/20** | **Good — release gate находится в a11y и account creation** |

## Anti-Patterns Verdict

**PASS.** Экран похож на зрелый admin-tool: restrained palette, одна primary action, знакомая таблица, без декоративных AI-клише. Detector по `students/page.tsx` и `student-create-form.tsx` завершился с exit `0`, JSON `[]`, findings `0`, false positives нет.

Mutable injection недоступна, overlay не создавался. Evidence собрано независимо через DOM snapshots, screenshots, computed styles и keyboard focus в отдельных Chrome tabs.

## Overall Impression

Список и row navigation уже очень хороши: desktop-строка и mobile-card работают как одна ясная ссылка. Самая большая проблема не визуальная, а продуктовая: создание аккаунта просит администратора придумать и передать пароль, а частичный сбой после создания оставляет его в опасном повторяемом состоянии.

## What's Working

- Desktop table имеет корректную семантику, а вся строка `1102×56` — одна ссылка с точным accessible name.
- Mobile-card `341×104` не создаёт horizontal overflow и сохраняет видимый focus.
- Формы имеют labels, 48 px основные controls, initial focus, show/hide password и `autocomplete="new-password"`.
- Search/status и zero-results дают понятную базовую ориентацию.

## Priority Issues

### [P1] Partial success создания ученика оставляет recovery dead-end

**Почему важно:** аккаунт создаётся до назначения курса; при сбое второго запроса modal остаётся с активной кнопкой «Создать ученика», повторный submit ведёт к duplicate-email.

**Evidence:** create request `platform/src/components/admin/student-create-form.tsx:67`; assignment/error `:82`; общий catch `:104`.

**Fix:** выделить `studentId` как partial-success state, заблокировать повторное создание и дать CTA «Открыть карточку ученика»; лучше всегда перейти в карточку и показать warning/retry назначения курса.

**Suggested command:** `$impeccable harden`.

### [P1] Password lifecycle хранит секрет и создаёт memory bridge

**Почему важно:** Cancel/X не очищают пароль, а администратор должен придумать, запомнить и вручную передать секрет, который повторно не показывается.

**Evidence:** password state `student-create-form.tsx:34`; open state без reset `:111`; ручное поле/helper `:149`, `:183`.

**Fix:** пароль очищать при любом закрытии. Предпочтительно заменить flow на one-time activation/reset link; иначе дать secure generator, one-time copy и состояние «Скопирован».

**Suggested command:** `$impeccable harden` + `$impeccable clarify`.

### [P1] Accessibility foundation нарушена landmarks и non-text contrast

**Почему важно:** два вложенных `main` неоднозначны для screen reader, а границы controls 1.57:1 не достигают WCAG 1.4.11 (3:1).

**Evidence:** page `<main>` `platform/src/app/admin/students/page.tsx:36` внутри `SidebarInset` `platform/src/components/ui/sidebar.tsx:314`; `border-input` в `students/page.tsx:52`, `:60` и fields `student-create-form.tsx:132`, `:152`, `:191`.

**Fix:** оставить один main landmark; системно усилить `--input` либо добавить контрастную non-color boundary.

**Suggested command:** `$impeccable audit` + `$impeccable colorize`.

### [P2] Create-flow использует другой компонент и слишком малые secondary targets

**Почему важно:** native course select ведёт себя иначе, чем Neurokurs Select; dialog close 16×16 и options 32 px ниже baseline.

**Evidence:** platform Select `students/page.tsx:55`; native `<select>` `student-create-form.tsx:189`; close `dialog.tsx:71`; SelectItem `select.tsx:103`.

**Fix:** заменить course picker на платформенный Select с 48 px trigger; дать close 44×44 wrapper и option hit areas не меньше 44 px.

**Suggested command:** `$impeccable adapt`.

### [P2] Large-list state не масштабируется

**Почему важно:** все ученики загружаются и фильтруются в памяти, а mobile/desktop trees одновременно присутствуют в DOM; сотни записей увеличат response и HTML вдвое.

**Evidence:** load/filter `students/page.tsx:22–30`; mobile tree `:77`, desktop tree `:118`; formatters создаются на ученика в `:108`, `:185`.

**Fix:** query-level search/status, pagination, `N из M`, stable sorting, общий formatter и одна responsive row implementation либо условный rendering.

**Suggested command:** `$impeccable optimize`.

## Cognitive Load

**Low глобально, 1/8 failure.** Рабочая память нарушается внутри create-flow: администратор должен вынести временный пароль во внешний безопасный канал. Header, filters, results и row actions хорошо сгруппированы.

## Emotional Journey

Вход и поиск спокойны, full-row navigation — сильный peak. High-stakes valley начинается на пароле. Худший сценарий — аккаунт создан, курс не назначен, а интерфейс остаётся в исходном modal. Успешный create должен переводить в карточку, но без submit это live не проверялось.

## Persona Red Flags

- **Alex:** нет sorting, pagination и bulk block/access; каждый фильтр требует Apply.
- **Sam:** table semantics, labels и row focus хороши; nested main, border 1.57:1 и 16/32 px targets требуют исправления.
- **Jordan:** mobile `0 / 10` не объясняет прогресс; zero-results не предлагает «Сбросить».
- **Riley:** воспроизведёт retained password и broken partial success; long email защищён `break-all`.

## Minor Observations

- Header показывает общий count даже при 0 filtered results; полезнее `0 из 1`.
- Mobile progress следует писать «Прогресс: 0 из 10 заданий».
- Search только по email; при росте понадобятся имя/курс/идентификатор.
- Filter panel высотой 258 px на 375 px можно уплотнить после проверки частоты использования.
- Zero-results state нуждается в явном «Сбросить фильтры».

## Questions to Consider

- Почему администратор передаёт пароль вместо одноразовой activation link?
- После partial create оставаться в modal или сразу открывать карточку ученика?
- При каком объёме списка обязательны pagination и bulk actions?
- Должен ли zero-results иметь один явный reset?

## Recommended Actions

1. **[P1] `$impeccable harden`** — сделать create atomic/recoverable и безопасно очищать secrets.
2. **[P1] `$impeccable audit`** — исправить main ownership и control boundaries.
3. **[P2] `$impeccable adapt`** — унифицировать Select и hit-area.
4. **[P2] `$impeccable clarify`** — подписать progress, reset и password delivery.
5. **[P2] `$impeccable optimize`** — pagination/query filtering/один responsive dataset.
6. **[P3] `$impeccable polish`** — финально выровнять filters и success states.

Questions skipped: серия системных ревью продолжается, а account-creation defects дают однозначный следующий backlog без промежуточного выбора.
