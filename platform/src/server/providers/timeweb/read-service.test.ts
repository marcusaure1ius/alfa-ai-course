import { describe, expect, it, vi } from "vitest";

import { checkTimewebConnection } from "./read-service";

describe("checkTimewebConnection", () => {
  it("forces fake discovery outside production and never invokes provider fetch", async () => {
    const fetchMock = vi.fn();
    const result = await checkTimewebConnection(
      {
        VERCEL_ENV: "preview",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: ["synthetic", "credential"].join("-"),
      },
      fetchMock as typeof fetch,
    );

    expect(result).toMatchObject({
      version: "timeweb-read-v2",
      ok: true,
      mode: "fake",
      status: "fake",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed without a production credential", async () => {
    const result = await checkTimewebConnection({
      VERCEL_ENV: "production",
      PLATFORM_PROVIDER: "timeweb",
    });

    expect(result).toMatchObject({
      ok: false,
      mode: "blocked",
      status: "unavailable",
      error: { code: "NOT_CONFIGURED", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain("TIMEWEB_API_TOKEN");
  });
});
