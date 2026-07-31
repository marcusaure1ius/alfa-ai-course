# T-0089 — реализация интерфейса Neurokurs по `main_design.pen`

Дата проверки: 31 июля 2026 года.

## Результат

Интерфейс student- и admin-частей приведён к общей визуальной и поведенческой
системе из `main_design.pen` и `design-system/neurokurs/MASTER.md`.
Маркетинговая логика продукта и инфраструктурные контракты не менялись.

Основные изменения:

- унифицированы цвета, типографика, радиусы, контейнеры, focus ring и motion;
- обычные поверхности избавлены от декоративных теней и лишних больших
  скруглений;
- student dashboard получил акцентную рабочую зону, маршрут текущего шага и
  более ясную карту курса;
- согласованы программа, материал, инструменты, n8n и помощь;
- добавлены доступные диалоги завершения материала, локального черновика
  практики и безопасного сообщения о проблеме n8n;
- admin navigation приведена к пяти основным разделам: «Ученики»,
  «Материалы», «Программа», «Доступы», «Инструменты»;
- добавлены самостоятельные страницы «Программа» и «Доступы»;
- создание курса, раздела, ученика и материала переведено в единые диалоги;
- раздел программы теперь можно создать, переименовать, изменить его slug и
  опубликовать из интерфейса; стрелки без действия и инструкция про ручной API
  удалены;
- admin «Инструменты» пересобраны в плотную рабочую область: сводка,
  attention state, таблица экземпляров, число доступов, статусы, обновление и
  явные переходы к деталям/управлению;
- редактор материала показывает несохранённые изменения и предупреждает при
  закрытии вкладки;
- формы получили видимые labels, inline errors, `aria-invalid`,
  `aria-describedby`, focus-first-error и pending/error/success feedback;
- вход получил кнопку показа/скрытия пароля;
- destructive infrastructure flows и их reauth/exact-name safeguards не
  ослаблялись.

## Доработка после независимого review

Первое review вернуло задачу на доработку. Закрыты все четыре блокирующих
замечания:

1. Program/Materials стали самодостаточными: create/edit section работает через
   существующий course content backend, material create/edit остаётся связанным
   с выбранным разделом.
2. Admin Tools больше не использует прежнюю крупную одиночную карточку и
   соответствует плотному list → details паттерну `.pen`.
3. Локальное сохранение практики и копирование сообщения о проблеме имеют
   `pending`, disabled controls, spinner и `aria-busy`, поэтому повторное
   действие невозможно.
4. `course-slug` и `student-password` добавляют error ID в
   `aria-describedby` только когда соответствующий error element существует.

## Ограничение backend

Отправка практической работы и тикета преподавателю не заявлена как готовая
серверная функция. Практика сохраняется локальным черновиком, а сообщение о
проблеме безопасно копируется для передачи преподавателю привычным каналом.
Интерфейс прямо объясняет это пользователю и не показывает ложный статус
отправки.

## Browser QA

Проверены размеры 1280×900, 1280×720, 375×812 и landscape 667×375.

- страницы загружаются без Next.js error overlay и console errors;
- `scrollWidth` равен ширине viewport на desktop, mobile и landscape;
- desktop/sidebar и mobile/sheet navigation содержат одинаковые пять разделов;
- Escape закрывает dialog и возвращает focus на trigger;
- невалидная форма фокусирует первое проблемное поле;
- completion, practice, student creation, material creation и n8n problem
  dialogs имеют доступные заголовки, подписи, cancel/close и error states;
- через реальный UI создан, затем переименован и опубликован новый раздел;
  после сохранения dialog закрылся, а обновлённая строка появилась в программе;
- create/edit section dialogs на desktop и mobile переводят фокус в первый
  смысловой control и не выходят за viewport;
- `aria-describedby` проверен до и после появления ошибок у course slug и
  student password: все IDREF указывают на существующие элементы;
- Admin Tools на 1280 и 375 показывает сводку и responsive instance row без
  horizontal overflow; console error log пуст;
- на проверенных экранах нет inputs без label и кнопок без доступного имени;
- глобальный `prefers-reduced-motion` отключает долгие animation/transition;
- ключевые light/dark text pairs проверены по WCAG: light foreground 14.64:1,
  light muted 4.61:1, dark foreground 17.04:1, dark muted 8.78:1;
- обычный текст на brand surface использует тёмный foreground (4.72:1), белый
  остаётся только для крупного display-заголовка и небольших графических
  индикаторов.

## Visual evidence

- `docs/assets/design-audit/t0089/login-desktop.jpg`
- `docs/assets/design-audit/t0089/student-desktop.jpg`
- `docs/assets/design-audit/t0089/student-mobile.jpg`
- `docs/assets/design-audit/t0089/admin-materials-desktop.jpg`
- `docs/assets/design-audit/t0089/admin-access-mobile.jpg`
- `docs/assets/design-audit/t0089/completion-dialog.jpg`
- `docs/assets/design-audit/t0089/practice-dialog-error.jpg`
- `docs/assets/design-audit/t0089/admin-create-material-error.jpg`
- `docs/assets/design-audit/t0089/admin-create-student.jpg`
- `docs/assets/design-audit/t0089/n8n-problem-dialog-error.jpg`
- `docs/assets/design-audit/t0089/admin-tools-remediation-desktop.jpg`
- `docs/assets/design-audit/t0089/admin-tools-remediation-mobile-row.jpg`
- `docs/assets/design-audit/t0089/admin-materials-remediation-desktop.jpg`
- `docs/assets/design-audit/t0089/admin-section-create-dialog.jpg`
- `docs/assets/design-audit/t0089/admin-section-edit-dialog.jpg`
- `docs/assets/design-audit/t0089/admin-section-create-mobile.jpg`

Browser QA использовал только синтетические локальные account/course/section.
После проверки удалены пользователь, курс, созданные через UI разделы,
материал, сессия и связанные audit events; проверка точных fixture ID вернула
0 пользователей, 0 курсов, 0 сред и 0 audit events T-0089. Эти временные данные
не восстанавливаются и не относились к пользовательским данным.

## Проверки

- `npm run lint` — passed;
- `npm run typecheck` — passed;
- `npm test` — 33 files, 129 tests passed;
- `npm run test:integration` — 7 files, 55 tests passed;
- `npm run test:workflow` — 1 file, 4 tests passed;
- `npm run build` — passed, 38 routes generated/validated.

Итоговый повтор после всех правок прошёл полностью: quality, integration и
workflow зелёные. UI-код не изменяет auth/operations runtime.

## Вне результата

Эта задача не закрывает production bootstrap blocker T-0058 и не подтверждает
готовность VPS, HTTPS, DNS или `ready_owner_setup_required`. Production
диагностика остаётся отдельной работой.
