import { afterEach, describe, expect, it } from "vitest";

import { csrfCookie, sessionCookie } from "./cookies";

describe("auth cookies", () => {
  const originalEnvironment = process.env.VERCEL_ENV;

  afterEach(() => {
    process.env.VERCEL_ENV = originalEnvironment;
  });

  it("uses HttpOnly and SameSite=Lax for the session", () => {
    process.env.VERCEL_ENV = "development";
    const cookie = sessionCookie("opaque");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
  });

  it("adds Secure in production and keeps the CSRF nonce HttpOnly", () => {
    process.env.VERCEL_ENV = "production";
    expect(sessionCookie("opaque")).toContain("Secure");
    expect(csrfCookie("nonce")).toContain("HttpOnly");
  });
});
