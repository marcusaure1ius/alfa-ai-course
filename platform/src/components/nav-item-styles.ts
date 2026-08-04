/**
 * Общий focus-treatment навигационных плашек student и admin.
 *
 * Держится одной константой намеренно: критерий T-0109 требует совпадения, а
 * при раздельном описании стили уже расходились — admin наследовал кольцо
 * снаружи от shadcn-сайдбара, student рисовал контур внутри.
 *
 * `ring-0` гасит унаследованное `focus-visible:ring-2`, `outline-solid`
 * возвращает стиль контура: базовый `outline-hidden` сайдбара обнуляет его.
 */
export const NAV_ITEM_FOCUS_CLASSES =
  "focus-visible:ring-0 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";
