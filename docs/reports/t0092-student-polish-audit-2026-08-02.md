# T-0092 — тройной UX/UI-аудит ученической части Neurokurs

Дата: 2026-08-02  
Проект: `alfa-ai-course`  
Эпик: `E11`  
Задача аудита: `T-0092`

## Результат

Проверены все шесть пользовательских экранов `/student`. Для каждого экрана
независимо работали три субагента:

1. UX/UI logic — путь пользователя, mental model, состояния и поддерживаемые
   продуктовые действия;
2. Impeccable polish — дизайн-система, иерархия, copy, визуальная и responsive
   согласованность;
3. Impeccable audit — accessibility, keyboard/touch, technical state coverage,
   performance, privacy и security.

Субагенты не изменяли код и Projects Control. Главный агент сопоставил их
выводы с `docs/product-brief.md`, `docs/architecture.md`,
`design-system/neurokurs/MASTER.md`, кодом и тестами. Формальный detector не
нашёл AI-slop паттернов, но это использовалось только как отрицательный сигнал,
а не как доказательство качества.

Итог: визуальная основа Neurokurs спокойная и последовательная, однако до
косметической полировки нужно закрыть несколько функциональных разрывов:

- завершённый курс ошибочно продолжает показываться как незавершённый;
- обзор `/student` теряется из навигации;
- статусы и progress частично недоступны assistive technology;
- reader ломает обычные fenced code blocks с language tag;
- student tools остаётся n8n-only и не следует service-first модели;
- текущая n8n-модель не доказывает реальный отзыв уже выданного доступа и
  безопасную индивидуальную identity-модель;
- Help не завершает часть входящих recovery-сценариев реальным действием.

## Метод и ограничения evidence

- Прочитаны routes, shared student components, access/course models и тесты.
- Проверены сохранённые desktop/mobile evidence из T-0089 и релевантные dialog
  screenshots.
- Для каждого экрана проверены happy, empty, loading/error и long-content
  состояния по коду и контрактам.
- Authenticated live walkthrough не выполнялся: read-only аудит не создавал и
  не менял локальные session/data, а текущий защищённый route закономерно
  возвращал `401`. Поэтому каждое implementation-задание обязано дополнить
  выводы browser evidence на `1440`, `1024`, `420` и `375` px, включая 200%
  zoom и keyboard-only путь.

## Общие системные находки

| Приоритет | Тип | Корень drift | Находка | Решение и проверка |
| --- | --- | --- | --- | --- |
| P1 | functional | conceptual misalignment | `getCourseProgress` выбирает последний материал после 100% | Ввести `empty | in_progress | complete`; при complete нет ложных «Текущий шаг» и primary «Продолжить» |
| P1 | functional/a11y | conceptual misalignment | Current/completed/upcoming часто переданы только `aria-hidden` иконками | Общий status contract: текст/sr-only, `aria-current`, подписанный progress |
| P1 | functional/a11y | missing token | Общий `ring-ring/30-35` не достигает 3:1 | Непрозрачный focus token или двухцветный ring, проверенный на Page/Surface/dark |
| P1 | functional | one-off | Layout и page повторно загружают полный course tree | Request-level cached loader и компактные route DTO |
| P2 | responsive | conceptual misalignment | `lg` одновременно включает sidebar и сложные split-layouts на 1024 px | Контентные splits переводить на container/`xl`; проверять длинные данные |
| P2 | accessibility | one-off | Shared Sheet/Dialog close и часть logout/link controls меньше 44 px | Общий 44×44 interactive contract без увеличения глифа |
| P2 | responsive | missing convention | Длинные title/URL/inline code могут быть скрыты глобальным `overflow-x-hidden` | `min-w-0`, controlled wrapping и extreme fixtures на 375 px/200% zoom |
| P2 | state quality | one-off | Shared loading геометрически не соответствует разным routes | Route-shaped skeleton, `role=status`, `aria-busy`, CLS evidence |

## Экран 1 — overview/continue `/student` и student shell

### Консенсус трёх аудиторов

| Приоритет | Тип | Корень | Находка | План |
| --- | --- | --- | --- | --- |
| P1 | functional | conceptual misalignment | Завершённый курс остаётся «текущим шагом» | Terminal completion state и unit cases zero/partial/all-complete |
| P1 | functional/IA | conceptual misalignment | Nav item «Продолжить» переписывается deep-link, поэтому `/student` недостижим и не active | Оставить стабильный overview entry; material — CTA обзора; добавить `aria-current` |
| P1 | functional/trust | conceptual misalignment | Универсальный «Маршрут шага» обещает практику/инструмент независимо от материала | Сделать data-driven по реальному материалу или убрать блок |
| P1 | a11y | one-off | Status rows и `3 / 10` не имеют доступного смысла | Status label, `aria-current=step`, «3 из 10 материалов завершено» |
| P2 | functional | one-off | Empty primitive создаёт self-link на Program и вложенный viewport | Контекстные full-page/inline variants |
| P2 | responsive/a11y | one-off | Mobile Sheet может скрыть footer/logout при малой высоте; controls меньше 44 px | Scrollable nav zone, safe-area footer, 44 px targets |
| P2 | quality | one-off | Loading/error не повторяют overview и не дают обещанный help path | Geometry-matched skeleton; retry + direct Help |

Сохранить: task-first hero, одну primary CTA, restrained palette, full-row course
links, отсутствие provider/VPS данных, desktop sidebar/mobile Sheet parity.

## Экран 2 — программа `/student/program`

| Приоритет | Тип | Корень | Находка | План |
| --- | --- | --- | --- | --- |
| P1 | functional | one-off + conceptual | Курс без материалов показывает full-page state внутри страницы и CTA на себя | Отдельный program empty state без self-link и дублирующего списка |
| P1 | functional | conceptual | 100% курс показывает последний материал как текущий | Общая terminal state model |
| P1 | functional/copy | conceptual | «Текущее место» фактически означает первый незавершённый, не сохранённую позицию | Реальная last-position модель или честное «Следующий незавершённый» |
| P1 | a11y | conceptual | Progress bar `aria-hidden`, строки icon-only | Нативный/ARIA progress + text status + `aria-current` |
| P1 | IA | conceptual | Все разделы всегда раскрыты; длинный курс превращается в бесконечный список | Progressive disclosure или быстрый индекс, текущий раздел раскрыт |
| P2 | IA/cosmetic | conceptual | Generic aside «Сначала понять…» не несёт course state | Реальные ближайшие шаги/индекс либо отсутствие aside |
| P2 | responsive | missing convention | Длинные course/section/material titles вытесняют counts/CTA | Safe wrapping/min-width contract и fixtures |

Сохранить: иерархию course → section → material, одну CTA перед каталогом,
64 px full-row links, text type/duration и понятный empty section.

## Экран 3 — reader `/student/materials/[slug]`

| Приоритет | Тип | Корень | Находка | План |
| --- | --- | --- | --- | --- |
| P0/P1 | functional/content | missing parser capability | ` ```bash ` / ` ```json ` не распознаются и closing fence может поглотить остаток документа | Поддержать language fences и EOF; regression tests для нескольких блоков |
| P1 | functional/content | conceptual | Tables/nested content не имеют определённого supported contract | Зафиксировать Markdown subset или безопасный GFM renderer с responsive table wrapper |
| P1 | functional | conceptual | `lastPosition` существует в DTO/API, но reader её не сохраняет/восстанавливает | Bounded heading anchor, debounce и явный resume UX |
| P1 | functional | one-off | Mobile TOC не закрывается после hash navigation | Controlled Sheet/`SheetClose`, focus на target heading |
| P1 | functional/IA | conceptual | Practice и completion — конкурирующие независимые primary actions | Practice-first sequence; после draft — завершение практики; одна primary CTA |
| P1 | functional | one-off | `router.refresh()` способен размонтировать completion success dialog | Удерживать success до выбора пользователя; refresh после close/navigation |
| P1 | privacy/resilience | one-off | `localStorage.getItem` не защищён; URL credentials допускаются | Safe storage adapter, in-memory fallback, reject credential URLs |
| P1 | security | one-off | `safeHref` принимает `//external` как internal | Единый URL policy; external-link convention |
| P2 | state quality | conceptual | Пустой published body выглядит как готовый материал с completion CTA | Запретить публикацию пустого body или показать «готовится» без completion |
| P2 | a11y | one-off | Success/error mutations теряют focus/live announcement; final success дублирует URL | Shared mutation feedback и одна final CTA |

Сохранить: 720 px prose, 17 px/1.78 reading rhythm, H1→H2/H3 semantics,
уникальные Cyrillic anchors, safe React-node rendering без raw HTML,
prev/next по published order и честный local-draft copy.

## Экран 4 — каталог `/student/tools`

| Приоритет | Тип | Корень | Находка | План |
| --- | --- | --- | --- | --- |
| P0/P1 | functional/IA | conceptual + missing model | Route hardcoded под n8n и не использует service definitions | После T-0091 generic `StudentToolCatalogItem`, zero/one/many, semantic list |
| P1 | functional | conceptual | Environmentless tool невозможно представить без фиктивной среды | Явные capabilities `required | optional | none`; access отделён от environment |
| P1 | functional/routing | conceptual | Catalog скрывает state через course boolean, detail читает другое правило | Единый effective entitlement DTO/policy |
| P1 | functional | missing model | Общий service gate не имеет `service_disabled` state | Overlay state выше индивидуального assignment без удаления назначения |
| P1 | trust/copy | conceptual | «Только сервисы из материалов» и «не требует настройки» не подтверждены данными | Честная service-neutral copy или реальная course-tool relation |
| P2 | semantics | one-off | Одна карточка не является list; service name не heading | `section` + `ul/li/article/h2`, compact accessible name |
| P2 | visual semantics | one-off | Один замок используется для ready/preparing/attention/expired | Exhaustive state presentation map с text truth source |
| P2 | hierarchy | conceptual | Карточка имеет только стрелку, а не state-aware action | «Открыть», «Подробнее», «Что делать дальше» по state/capability |

`T-0097` зависит от `T-0091`, потому что student catalog должен читать ту же
service-first capability/access модель, а не создавать параллельный literal.

## Экран 5 — n8n detail `/student/tools/n8n`

### Архитектурный security/access gate

Три аудитора сошлись, что UI-полировка не закрывает фактическую границу:

- `owner_setup_required` может предложить нескольким назначенным ученикам
  создать единственный owner общей n8n-среды;
- expiry/revoke/global off сейчас скрывают URL в Neurokurs, но сами по себе не
  отзывают уже известный адрес, n8n identity или активную session;
- assignment query должен детерминированно исключать historical/deleted/failed
  среды.

Для этого создана отдельная critical task `T-0102`, зависящая от `T-0091` и
блокирующая `T-0098`. Нельзя заявлять «доступ завершён» до enforceable revoke.

### Остальная полировка

| Приоритет | Тип | Корень | Находка | План |
| --- | --- | --- | --- | --- |
| P0/P1 | privacy/trust | conceptual | Problem dialog вставляет free text и затем ложно утверждает, что секретов нет | Preview, bounded warning/redaction, пользовательская проверка, без абсолютной гарантии |
| P0/P1 | functional | one-off | Clipboard failure советует выделить текст, которого UI не показывает | Всегда хранить/display generated message; manual copy fallback |
| P1 | trust/copy | conceptual | `license_blocked`, `attention`, `expired` обещают неподтверждённые факты и раскрывают VPS/cloud mental model | Только проверяемый state + следующий шаг, без provider/VPS |
| P1 | functional/model | missing model | Launch определяется `Boolean(url)`, что допускает противоречивый DTO | Discriminated union; URL только в разрешённых states; global gate выше |
| P1 | hierarchy | one-off | Disabled launch остаётся primary во всех закрытых states | State-scoped CTA, без бесполезной disabled primary |
| P1 | state freshness | one-off | Preparing/attention не обновляются на открытой странице | Bounded refresh/polling только transition states |
| P1 | a11y | conceptual | Success заменяет DOM без live announcement/focus transfer | Status/live region и focus на success heading/action |
| P2 | security hardening | one-off | URL policy принимает localhost/private hosts | Public-host policy либо явно подтверждённая allowed-host boundary |

Сохранить: минимальный student DTO, HTTPS/no-credentials URL normalization,
fail-closed скрытие URL в DTO, `noreferrer`, human state copy, native radio
fieldset, initial error focus и отсутствие скрытой отправки сообщения.

## Экран 6 — помощь `/student/help`

| Приоритет | Тип | Корень | Находка | План |
| --- | --- | --- | --- | --- |
| P0/P1 | functional/recovery | conceptual | Locked-course CTA и expired-tool CTA ведут на Help без соответствующей темы | Topics `course-access`, `tool-expired`, `tool-problem` со stable deep links |
| P1 | functional | missing model | Страница ссылается на канал курса, которого нет в student/course DTO | Safe course support-contact contract + honest missing-contact fallback |
| P1 | privacy | conceptual | Safety note спрятана только в «Другой вопрос» | Общая видимая privacy note перед любым contact flow |
| P1 | IA/copy | conceptual | «Если что-то не работает» не покрывает access/expiry, а n8n закрепляет one-service модель | «Помощь по курсу», service-neutral groups |
| P1 | content model | missing model | `steps: string` не поддерживает numbered actions, result и fallback | Structured steps, expected result, next action and optional link |
| P2 | accessibility | one-off | Topic titles — spans; нет heading navigation | H2 inside/associated with native disclosure |
| P2 | responsive | missing token | 14 px instructional body и `ml-14 + pl-4` слишком узки на mobile | 16 px body; indentation only from `sm`; long-content wrapping |
| P2 | routing | one-off | Error copy говорит открыть Help, но не содержит ссылки | Direct contextual help link |

Сохранить: native details/summary, большую disclosure hit area, keyboard
semantics, простой русский copy, отсутствие fake ticket status и постоянную
доступность Help в navigation.

## План реализации и зависимости

1. `T-0094` — shared foundation и `/student`: terminal progress model,
   navigation/focus/status, empty/loading/error, 1024/mobile shell.
2. После independent review `T-0094` разблокируются:
   - `T-0095` — программа;
   - `T-0096` — reader;
   - `T-0099` — Help.
3. `T-0097` — tools catalog только после `T-0091` и shared foundation.
4. `T-0102` — реальная n8n identity/revoke boundary после `T-0091`.
5. `T-0098` — n8n detail polish после `T-0102`, чтобы UI не закреплял ложную
   модель доступа.

Внутри каждой задачи порядок один:

1. functional/security P0/P1;
2. accessibility, responsive и state coverage;
3. visual/copy P2;
4. unit/component/integration tests;
5. browser walkthrough `1440/1024/420/375`, keyboard-only, 200% zoom,
   reduced motion и long-content fixtures;
6. task-key commit, evidence и independent review.

## Трассировка задач

| Задача | Экран/решение | Дополнительные gates |
| --- | --- | --- |
| `T-0094` | shell + `/student` | `T-0092` |
| `T-0095` | `/student/program` | `T-0092`, `T-0094` |
| `T-0096` | `/student/materials/[slug]` | `T-0092`, `T-0094` |
| `T-0097` | `/student/tools` | `T-0092`, `T-0094`, `T-0091` |
| `T-0102` | n8n identity и enforceable revoke | `T-0091` |
| `T-0098` | `/student/tools/n8n` | `T-0092`, `T-0094`, `T-0091`, `T-0102` |
| `T-0099` | `/student/help` | `T-0092`, `T-0094` |

## Definition of Done аудита

- шесть экранов × три независимых заключения получены;
- findings классифицированы по priority, functional/cosmetic и root cause;
- implementation tasks обновлены;
- security/access gap выделен в `T-0102`;
- dependencies зафиксированы в Projects Control;
- дальнейшая реализация начинается с `T-0094`, а не с локальной косметики.
