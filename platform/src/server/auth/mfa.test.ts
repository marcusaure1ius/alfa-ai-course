import { describe, expect, it } from "vitest";

import { createTotpCode, sealTotpSecret, verifyTotpCode } from "./mfa";

const secret = "JBSWY3DPEHPK3PXP";
const encryptionKey = Buffer.alloc(32, 7).toString("base64url");

describe("encrypted TOTP factor", () => {
  it("verifies only a current six-digit code without storing the raw secret", () => {
    const now = Date.UTC(2026, 6, 30, 8, 0, 0);
    const ciphertext = sealTotpSecret(secret, encryptionKey);
    expect(ciphertext).not.toContain(secret);
    expect(
      verifyTotpCode(ciphertext, createTotpCode(secret, now), encryptionKey, now),
    ).toBe(true);
    expect(verifyTotpCode(ciphertext, "000000", encryptionKey, now)).toBe(false);
  });

  it("rejects a ciphertext authenticated with another encryption key", () => {
    const ciphertext = sealTotpSecret(secret, encryptionKey);
    expect(
      verifyTotpCode(
        ciphertext,
        createTotpCode(secret),
        Buffer.alloc(32, 8).toString("base64url"),
      ),
    ).toBe(false);
  });
});
