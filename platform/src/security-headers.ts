export type SecurityHeader = { key: string; value: string };
export type SecurityHeaderRule = { source: string; headers: SecurityHeader[] };

/**
 * Роуты, которые сами выставляют security-заголовки под свой сценарий.
 *
 * `next.config.headers()` не дополняет, а ПЕРЕКРЫВАЕТ одноимённые заголовки
 * ответа роута — проверено на production-сборке. Поэтому такие пути
 * исключаются из общих правил: иначе страница входа в n8n получила бы
 * `form-action 'none'` вместо origin инструмента, её inline-скрипт
 * автосабмита оказался бы заблокирован, и ученик не смог бы открыть n8n.
 */
export const ROUTES_WITH_OWN_SECURITY_HEADERS = [
  "/api/student/tools/n8n/launch",
  "/api/admin/tools/n8n/launch",
  "/api/tool-gateway/n8n/exchange",
] as const;

function excludingOwnHeaderRoutes(prefix: "" | "/api"): string {
  const alternatives = ROUTES_WITH_OWN_SECURITY_HEADERS.filter((route) =>
    route.startsWith(prefix),
  )
    .map((route) => route.slice(prefix.length + 1))
    .join("|");
  return `${prefix}/((?!${alternatives}).*)`;
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

/**
 * Referrer-Policy вынесен отдельно: gateway-роуты сознательно отвечают
 * `no-referrer`, чтобы ticket не утёк в Referer при переходе в n8n.
 */
export const DEFAULT_REFERRER_POLICY: SecurityHeader = {
  key: "Referrer-Policy",
  value: "strict-origin-when-cross-origin",
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
