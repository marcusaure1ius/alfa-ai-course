const russianPluralRules = new Intl.PluralRules("ru-RU");

export type RussianPluralForms = {
  /** 1, 21, 101 — «раздел» */
  one: string;
  /** 2–4, 22–24 — «раздела» */
  few: string;
  /** 0, 5–20, 25–30 — «разделов» */
  many: string;
};

/**
 * Единственная точка выбора русской формы слова по числу.
 * Формы задаются на месте вызова и могут быть в любом падеже
 * («активного назначения» / «активных назначений» для контекста «у …»).
 */
export function pluralWord(count: number, forms: RussianPluralForms): string {
  const form = russianPluralRules.select(count);
  if (form === "one") return forms.one;
  if (form === "few") return forms.few;
  return forms.many;
}

export function formatCount(count: number, forms: RussianPluralForms): string {
  return `${count} ${pluralWord(count, forms)}`;
}
