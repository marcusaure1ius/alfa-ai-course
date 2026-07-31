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
- создание курса, ученика и материала переведено в единые диалоги;
- редактор материала показывает несохранённые изменения и предупреждает при
  закрытии вкладки;
- формы получили видимые labels, inline errors, `aria-invalid`,
  `aria-describedby`, focus-first-error и pending/error/success feedback;
- вход получил кнопку показа/скрытия пароля;
- destructive infrastructure flows и их reauth/exact-name safeguards не
  ослаблялись.

## Ограничение backend

Отправка практической работы и тикета преподавателю не заявлена как готовая
серверная функция. Практика сохраняется локальным черновиком, а сообщение о
проблеме безопасно копируется для передачи преподавателю привычным каналом.
Интерфейс прямо объясняет это пользователю и не показывает ложный статус
отправки.

## Browser QA

Проверены размеры 1280×900, 375×812 и landscape 667×375.

- страницы загружаются без Next.js error overlay и console errors;
- `scrollWidth` равен ширине viewport на desktop, mobile и landscape;
- desktop/sidebar и mobile/sheet navigation содержат одинаковые пять разделов;
- Escape закрывает dialog и возвращает focus на trigger;
- невалидная форма фокусирует первое проблемное поле;
- completion, practice, student creation, material creation и n8n problem
  dialogs имеют доступные заголовки, подписи, cancel/close и error states;
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

Browser QA использовал только синтетические локальные accounts/course. После
проверки в локальной базе осталось 0 синтетических пользователей и 0
синтетических курсов T-0089.

## Проверки

- `npm run lint` — passed;
- `npm run typecheck` — passed;
- `npm test` — 32 files, 127 tests passed;
- `npm run test:integration` — 7 files, 54 tests passed;
- `npm run test:workflow` — 1 file, 4 tests passed;
- `npm run build` — passed, 38 routes generated/validated.

Один повторный integration run кратковременно воспроизвёл существующий
timestamp-sensitive `STALE_REAUTH` flake в трёх инфраструктурных тестах. Тот же
файл сразу прошёл 27/27, затем полный повтор прошёл 54/54. UI-код не изменяет
auth/operations runtime.

## Вне результата

Эта задача не закрывает production bootstrap blocker T-0058 и не подтверждает
готовность VPS, HTTPS, DNS или `ready_owner_setup_required`. Production
диагностика остаётся отдельной работой.
