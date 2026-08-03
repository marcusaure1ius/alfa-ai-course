const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "yi",
  є: "ye",
  ґ: "g",
  ў: "u",
  "№": "",
};

function transliterate(value: string): string {
  return Array.from(value.toLocaleLowerCase("ru-RU"), (character) =>
    CYRILLIC_TO_LATIN[character] ?? character,
  )
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function sanitizeContentAddressInput(value: string): string {
  return transliterate(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

export function createContentAddress(title: string): string {
  return sanitizeContentAddressInput(title).replace(/-+$/, "");
}
