import { beforeEach, describe, expect, it } from "vitest";

import { CSRF_COOKIE_NAME } from "./config";
import { issueCsrfToken, verifyCsrfRequest } from "./csrf";

describe("CSRF protection", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "unit-example-not-a-secret-32-characters";
    process.env.APP_ORIGIN = "http://localhost:3000";
  });

  function request(token: string, nonce: string, origin = "http://localhost:3000") {
    return new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        cookie: `${CSRF_COOKIE_NAME}=${encodeURIComponent(nonce)}`,
        origin,
        "x-csrf-token": token,
      },
    });
  }

  it("accepts a signed double-submit token from the configured origin", () => {
    const issued = issueCsrfToken();
    expect(verifyCsrfRequest(request(issued.token, issued.nonce))).toBe(true);
  });

  it("rejects a foreign origin, changed cookie, or changed signature", () => {
    const issued = issueCsrfToken();
    expect(
      verifyCsrfRequest(request(issued.token, issued.nonce, "https://attacker.test")),
    ).toBe(false);
    expect(verifyCsrfRequest(request(issued.token, `${issued.nonce}x`))).toBe(false);
    expect(verifyCsrfRequest(request(`${issued.token}x`, issued.nonce))).toBe(false);
  });
});
