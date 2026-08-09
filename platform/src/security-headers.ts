export type SecurityHeader = { key: string; value: string };
export type SecurityHeaderRule = { source: string; headers: SecurityHeader[] };

/**
 * Роуты, которые сами выставляют security-заголовки под свой сценарий.
 *
 * `next.config.headers()` не дополняет, а ПЕРЕКРЫВАЕТ одноимённые заголовки
 * ответа роута — проверено на production-сборке. Поэтому такие пути должны
 * исключаться из общих правил, иначе роут молча теряет свою политику.
 *
 * Сейчас список пуст: gateway-маршруты удалены вместе с ticket-моделью
 * (ADR-0016). Механизм оставлен намеренно — он закрывает ловушку, из-за
 * которой однажды чуть не сломался вход ученика в n8n. Новый роут со своими
 * `Content-Security-Policy` или `Referrer-Policy` обязан попасть сюда.
 */
export const ROUTES_WITH_OWN_SECURITY_HEADERS: readonly string[] = [];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Источник, покрывающий всё под `prefix`, кроме точных путей из списка.
 *
 * Lookahead якорится на конец пути: иначе будущий подпуть вида
 * `/api/admin/tools/n8n/launch/status` молча потерял бы политику, потому что
 * совпал бы с исключением по префиксу.
 */
export function excludingOwnHeaderRoutes(
  prefix: "" | "/api",
  // Список параметризован, чтобы якорение и экранирование оставались покрытыми
  // тестами даже когда исключений нет.
  routes: readonly string[] = ROUTES_WITH_OWN_SECURITY_HEADERS,
): string {
  const alternatives = routes
    .filter((route) => route.startsWith(`${prefix}/`))
    .map((route) => escapeRegExp(route.slice(prefix.length + 1)));
  // Пустой список даёт `(?!()$)` — это уже другое выражение, а не «исключить
  // ничего». Поэтому исключающая обёртка добавляется только при наличии путей.
  return alternatives.length === 0
    ? `${prefix}/(.*)`
    : `${prefix}/((?!(?:${alternatives.join("|")})$).*)`;
}


/**
 * Заголовки, которые не конфликтуют ни с одним роутом: их либо никто не ставит
 * сам, либо ставит с тем же значением. `X-Frame-Options: DENY` намеренно
 * согласован с `frame-ancestors 'none'` политики документа.
 */
export const UNCONDITIONAL_SECURITY_HEADERS: SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "display-capture=()",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },
];

/** Значение по умолчанию для всех путей, не заявивших собственную политику. */
export const DEFAULT_REFERRER_POLICY: SecurityHeader = {
  key: "Referrer-Policy",
  value: "strict-origin-when-cross-origin",
};

/**
 * Политика для путей из `ROUTES_WITH_OWN_SECURITY_HEADERS`: они уводят браузер
 * на внешний адрес и не должны отдавать собственный URL в `Referer`.
 *
 * Список сейчас пуст, поэтому значение ни на один ответ не попадает. Оно
 * оставлено вместе с механизмом: роут, который начнёт куда-то перенаправлять,
 * должен получать его и на ответах-ошибках, где заголовок сам не ставится.
 */
export const OWN_HEADER_ROUTES_REFERRER_POLICY: SecurityHeader = {
  key: "Referrer-Policy",
  value: "no-referrer",
};

/**
 * API отвечает только JSON и никогда не является документом, поэтому ему
 * подходит политика, запрещающая любую загрузку и любое встраивание.
 */
export const API_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Правила для `next.config.headers()`. Источники записаны как регулярные
 * выражения, поэтому их можно проверить тестом через `ruleMatches`.
 */
export function buildSecurityHeaderRules(): SecurityHeaderRule[] {
  return [
    { source: "/(.*)", headers: UNCONDITIONAL_SECURITY_HEADERS },
    {
      source: excludingOwnHeaderRoutes(""),
      headers: [DEFAULT_REFERRER_POLICY],
    },
    // По одному правилу на путь: Next.js принимает в `source` только
    // path-подобное выражение и отвергает верхнеуровневую группу `/(?:a|b)`.
    ...ROUTES_WITH_OWN_SECURITY_HEADERS.map((route) => ({
      source: route,
      headers: [OWN_HEADER_ROUTES_REFERRER_POLICY],
    })),
    {
      source: excludingOwnHeaderRoutes("/api"),
      headers: [
        { key: "Content-Security-Policy", value: API_CONTENT_SECURITY_POLICY },
      ],
    },
  ];
}

/** Проверяет, попадает ли путь под источник правила. */
export function ruleMatches(source: string, pathname: string): boolean {
  return new RegExp(`^${source}$`).test(pathname);
}

/**
 * Одноразовый nonce для политики документа. 128 бит — минимум, рекомендованный
 * спецификацией CSP.
 */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Политика для документов. Nonce проставляет Next.js: он читает его из
 * `Content-Security-Policy` запроса и сам добавляет framework-скриптам и
 * собственным inline-вставкам.
 */
export function buildDocumentContentSecurityPolicy(
  nonce: string,
  { isDevelopment }: { isDevelopment: boolean },
): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    // React вызывает eval только в development, чтобы восстановить стек
    // серверной ошибки в браузере. В production это не требуется.
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Inline-стили разрешены сознательно: прогресс курса и отступы оглавления
    // задаются атрибутом style, а Radix UI позиционирует слои тем же способом
    // в runtime. На скрипты это послабление не распространяется.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDevelopment) {
    // На http://localhost апгрейд сломал бы локальную разработку.
    directives.push("upgrade-insecure-requests");
  }

  return directives.join("; ");
}
