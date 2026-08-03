import { describe, expect, it } from "vitest";

import {
  openN8nInvitePath,
  safeN8nInvitePath,
  sealN8nInvitePath,
} from "./n8n-invite";

const authSecret = "invite-example-not-a-secret-32-characters";

describe("n8n invite path", () => {
  it("keeps only same-origin signup links and encrypts them at rest", () => {
    const path = safeN8nInvitePath(
      "https://n8n.example.test/signup?token=live-token",
      "https://n8n.example.test",
    );
    expect(path).toBe("/signup?token=live-token");
    const sealed = sealN8nInvitePath(path!, authSecret);
    expect(sealed).not.toContain("live-token");
    expect(openN8nInvitePath(sealed, authSecret)).toBe(path);
  });

  it("rejects cross-origin, credentialed, and unrelated links", () => {
    expect(
      safeN8nInvitePath(
        "https://evil.example/signup?token=live-token",
        "https://n8n.example.test",
      ),
    ).toBeNull();
    expect(
      safeN8nInvitePath(
        "https://user:pass@n8n.example.test/signup?token=live-token",
        "https://n8n.example.test",
      ),
    ).toBeNull();
    expect(
      safeN8nInvitePath(
        "https://n8n.example.test/login?token=live-token",
        "https://n8n.example.test",
      ),
    ).toBeNull();
  });
});
