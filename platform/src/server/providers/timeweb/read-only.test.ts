import { describe, expect, it, vi } from "vitest";

import {
  TimewebProviderError,
  TimewebReadOnlyAdapter,
} from "./read-only";

const testCredential = ["synthetic", "credential", "contract"].join("-");

function successfulPayload(url: string): unknown {
  if (url.endsWith("/api/v1/account/status")) {
    return { status: { is_blocked: false, company_info: { name: "hidden" } } };
  }
  if (url.endsWith("/api/v1/account/finances")) {
    return { finances: { balance: 2500, currency: "RUB", total_paid: 99999 } };
  }
  if (url.endsWith("/api/v1/servers")) {
    return {
      servers: [
        {
          id: 101,
          name: "Учебная среда",
          location: "ru-1",
          availability_zone: "spb-3",
          preset_id: 202,
          status: "on",
          root_pass: "must-not-leave-adapter",
          vnc_pass: "must-not-leave-adapter",
          cloud_init: "must-not-leave-adapter",
        },
      ],
    };
  }
  if (url.endsWith("/api/v1/presets/servers")) {
    return {
      server_presets: [
        {
          id: 202,
          location: "ru-1",
          price: 990,
          cpu: 2,
          ram: 4096,
          disk: 40960,
          disk_type: "nvme",
        },
      ],
    };
  }
  if (url.endsWith("/api/v1/os/servers")) {
    return {
      servers_os: [{ id: 303, family: "ubuntu", name: "Ubuntu", version: "24.04" }],
    };
  }
  if (url.endsWith("/api/v2/locations")) {
    return {
      locations: [
        {
          location: "ru-1",
          location_code: "RU",
          availability_zones: ["spb-3", "spb-4"],
        },
      ],
    };
  }
  throw new Error(`Unexpected test URL: ${url}`);
}

function successfulFetch() {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    void _init;
    return Response.json(successfulPayload(String(input)));
  });
}

describe("TimewebReadOnlyAdapter", () => {
  it("uses only allowlisted GET endpoints and maps a secret-free versioned DTO", async () => {
    const fetchMock = successfulFetch();
    const adapter = new TimewebReadOnlyAdapter(
      testCredential,
      fetchMock as typeof fetch,
    );
    const snapshot = await adapter.discover();

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(
      fetchMock.mock.calls.map(([url, init]) => ({
        url,
        method: init?.method,
        authorization: new Headers(init?.headers).get("authorization"),
      })),
    ).toEqual(
      [
        "/api/v1/account/status",
        "/api/v1/account/finances",
        "/api/v1/servers",
        "/api/v1/presets/servers",
        "/api/v1/os/servers",
        "/api/v2/locations",
      ].map((path) => ({
        url: `https://api.timeweb.cloud${path}`,
        method: "GET",
        authorization: `Bearer ${testCredential}`,
      })),
    );
    expect(snapshot).toMatchObject({
      version: "timeweb-read-v1",
      source: "timeweb",
      account: { state: "ready" },
      balance: { amount: 2500, currency: "RUB" },
      servers: [
        {
          id: "101",
          presetId: "202",
          status: { state: "supported", value: "on" },
        },
      ],
    });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(testCredential);
    expect(serialized).not.toContain("must-not-leave-adapter");
    expect(serialized).not.toContain("company_info");
    expect(serialized).not.toContain("total_paid");
    expect(JSON.stringify(adapter)).not.toContain(testCredential);
  });

  it("preserves an unknown server status as safe unsupported/degraded state", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const payload = successfulPayload(String(input));
      if (String(input).endsWith("/api/v1/servers")) {
        return Response.json({
          servers: [
            {
              ...(payload as { servers: Array<Record<string, unknown>> }).servers[0],
              status: "WARP MODE / provider drift",
            },
          ],
        });
      }
      return Response.json(payload);
    });

    const snapshot = await new TimewebReadOnlyAdapter(
      testCredential,
      fetchMock as typeof fetch,
    ).discover();

    expect(snapshot.degraded).toBe(true);
    expect(snapshot.servers[0]?.status).toEqual({
      state: "unsupported",
      providerValue: "warp_mode___provider_drift",
    });
  });

  it("returns typed redacted errors without raw provider payload or credential", async () => {
    const fetchMock = vi.fn(async () => {
      return Response.json(
        {
          error_code: "unauthorized",
          message: `rejected ${testCredential}`,
          response_id: "94608d15-8672-4eed-8ab6-28bd6fa3cdf7",
        },
        { status: 401 },
      );
    });

    const error = await new TimewebReadOnlyAdapter(
      testCredential,
      fetchMock as typeof fetch,
    )
      .discover()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(TimewebProviderError);
    expect((error as TimewebProviderError).toJSON()).toMatchObject({
      code: "UNAUTHORIZED",
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(testCredential);
    expect(JSON.stringify(error)).not.toContain("error_code");
  });

  it("fails closed on malformed provider collections", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/v1/servers")) {
        return Response.json({ servers: "not-an-array" });
      }
      return Response.json(successfulPayload(String(input)));
    });

    await expect(
      new TimewebReadOnlyAdapter(testCredential, fetchMock as typeof fetch).discover(),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", retryable: false });
  });
});
