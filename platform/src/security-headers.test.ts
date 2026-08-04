import { describe, expect, it } from "vitest";

import {
  API_CONTENT_SECURITY_POLICY,
  DEFAULT_REFERRER_POLICY,
  ROUTES_WITH_OWN_SECURITY_HEADERS,
  UNCONDITIONAL_SECURITY_HEADERS,
  buildDocumentContentSecurityPolicy,
  buildSecurityHeaderRules,
  ruleMatches,
} from "./security-headers";

function headerValue(key: string): string | undefined {
  const all = [...UNCONDITIONAL_SECURITY_HEADERS, DEFAULT_REFERRER_POLICY];
  return all.find((header) => header.key.toLowerCase() === key.toLowerCase())
    ?.value;
}

/** Заголовки, которые фактически получит путь по всем правилам next.config. */
function headersFor(pathname: string): Map<string, string> {
  const applied = new Map<string, string>();
  for (const rule of buildSecurityHeaderRules()) {
    if (!ruleMatches(rule.source, pathname)) continue;
    for (const header of rule.headers) {
      applied.set(header.key.toLowerCase(), header.value);
    }
  }
  return applied;
}

function directive(policy: string, name: string): string | undefined {
  return policy
    .split("; ")
    .find((entry) => entry === name || entry.startsWith(`${name} `));
}

describe("статические заголовки", () => {
  it("задают nosniff, referrer и permissions policy", () => {
    expect(headerValue("X-Content-Type-Options")).toBe("nosniff");
    expect(headerValue("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerValue("Permissions-Policy")).toContain("camera=()");
    expect(headerValue("Permissions-Policy")).toContain("microphone=()");
    expect(headerValue("Permissions-Policy")).toContain("geolocation=()");
  });

  it("согласуют X-Frame-Options с frame-ancestors документа", () => {
    expect(headerValue("X-Frame-Options")).toBe("DENY");
    expect(
      directive(
        buildDocumentContentSecurityPolicy("test-nonce", {
          isDevelopment: false,
        }),
        "frame-ancestors",
      ),
    ).toBe("frame-ancestors 'none'");
  });
});

describe("политика документа", () => {
  const production = buildDocumentContentSecurityPolicy("test-nonce", {
    isDevelopment: false,
  });

  it("привязывает скрипты к nonce и strict-dynamic", () => {
    const scriptSrc = directive(production, "script-src");
    expect(scriptSrc).toContain("'nonce-test-nonce'");
    expect(scriptSrc).toContain("'strict-dynamic'");
  });

  it("не разрешает inline-скрипты и eval в production", () => {
    const scriptSrc = directive(production, "script-src") ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("закрывает объекты, встраивание и подмену base", () => {
    expect(directive(production, "default-src")).toBe("default-src 'self'");
    expect(directive(production, "object-src")).toBe("object-src 'none'");
    expect(directive(production, "frame-ancestors")).toBe(
      "frame-ancestors 'none'",
    );
    expect(directive(production, "base-uri")).toBe("base-uri 'self'");
    expect(directive(production, "form-action")).toBe("form-action 'self'");
  });

  it("разрешает inline-стили, но только их", () => {
    expect(directive(production, "style-src")).toBe(
      "style-src 'self' 'unsafe-inline'",
    );
  });

  it("апгрейдит небезопасные запросы только вне development", () => {
    expect(directive(production, "upgrade-insecure-requests")).toBe(
      "upgrade-insecure-requests",
    );
    const development = buildDocumentContentSecurityPolicy("test-nonce", {
      isDevelopment: true,
    });
    expect(directive(development, "upgrade-insecure-requests")).toBeUndefined();
  });

  it("добавляет unsafe-eval только в development", () => {
    const development = buildDocumentContentSecurityPolicy("test-nonce", {
      isDevelopment: true,
    });
    expect(directive(development, "script-src")).toContain("'unsafe-eval'");
  });

  it("подставляет разный nonce в разные политики", () => {
    const first = buildDocumentContentSecurityPolicy("nonce-one", {
      isDevelopment: false,
    });
    const second = buildDocumentContentSecurityPolicy("nonce-two", {
      isDevelopment: false,
    });
    expect(first).not.toBe(second);
  });
});

describe("политика API", () => {
  it("запрещает загрузку и встраивание", () => {
    expect(directive(API_CONTENT_SECURITY_POLICY, "default-src")).toBe(
      "default-src 'none'",
    );
    expect(directive(API_CONTENT_SECURITY_POLICY, "frame-ancestors")).toBe(
      "frame-ancestors 'none'",
    );
  });
});

describe("правила next.config", () => {
  // next.config.headers() перекрывает одноимённые заголовки ответа роута,
  // поэтому важно не то, какие правила объявлены, а какие из них попадают
  // на конкретный путь.
  it("накрывает обычный API-роут политикой и referrer-policy", () => {
    const applied = headersFor("/api/auth/csrf");
    expect(applied.get("content-security-policy")).toBe(
      API_CONTENT_SECURITY_POLICY,
    );
    expect(applied.get("referrer-policy")).toBe(DEFAULT_REFERRER_POLICY.value);
    expect(applied.get("x-content-type-options")).toBe("nosniff");
  });

  it("накрывает документ статическими заголовками", () => {
    const applied = headersFor("/login");
    expect(applied.get("x-frame-options")).toBe("DENY");
    expect(applied.get("referrer-policy")).toBe(DEFAULT_REFERRER_POLICY.value);
    // Политику документа выдаёт proxy, а не next.config.
    expect(applied.has("content-security-policy")).toBe(false);
  });

  it.each(ROUTES_WITH_OWN_SECURITY_HEADERS)(
    "не перекрывает собственные CSP и referrer-policy роута %s",
    (route) => {
      const applied = headersFor(route);
      expect(applied.has("content-security-policy")).toBe(false);
      expect(applied.has("referrer-policy")).toBe(false);
      // Заголовки, которые роут не задаёт сам, остаются применёнными.
      expect(applied.get("x-frame-options")).toBe("DENY");
    },
  );

  it("оставляет исключение узким: соседние пути под правила попадают", () => {
    const neighbour = headersFor("/api/student/tools/n8n");
    expect(neighbour.get("content-security-policy")).toBe(
      API_CONTENT_SECURITY_POLICY,
    );
  });
});
