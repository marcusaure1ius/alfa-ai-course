export type SecurityHeader = { key: string; value: string };

/**
 * Заголовки, не зависящие от запроса. Применяются ко всем ответам, включая API.
 * `X-Frame-Options: DENY` намеренно согласован с `frame-ancestors 'none'`:
 * встраивание Neurokurs в чужую страницу запрещено полностью.
 */
export const STATIC_SECURITY_HEADERS: SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
