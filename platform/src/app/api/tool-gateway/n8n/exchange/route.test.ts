import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeN8nGatewayTicket: vi.fn(),
  getDatabase: vi.fn(() => ({ database: true })),
}));

vi.mock("@/server/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/tools/n8n-gateway", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/server/tools/n8n-gateway")
  >();
  return {
    ...original,
    exchangeN8nGatewayTicket: mocks.exchangeN8nGatewayTicket,
  };
});
import { POST } from "./route";
import { deriveN8nGatewayManagementSecret } from "@/server/tools/n8n-managed-secret";

const authSecret = "exchange-example-not-a-secret-32-characters";
const secret = deriveN8nGatewayManagementSecret(authSecret);

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request(
    "https://course.example.test/api/tool-gateway/n8n/exchange?ticket=query-leak",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-host": "n8n.example.test",
        "x-neurokurs-gateway": secret,
        ...headers,
      },
      body,
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", authSecret);
  mocks.exchangeN8nGatewayTicket.mockResolvedValue({
    cookie: "__Host-neurokurs_gate=session; Path=/; Secure; HttpOnly",
    redirectPath: "/signup?token=invite",
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/tool-gateway/n8n/exchange", () => {
  it("rejects direct requests without the managed Caddy secret", async () => {
    const response = await POST(
      request("ticket=body-ticket", { "x-neurokurs-gateway": "wrong" }),
    );
    expect(response.status).toBe(403);
    expect(mocks.exchangeN8nGatewayTicket).not.toHaveBeenCalled();
  });

  it("consumes only the bounded POST body ticket and never the query", async () => {
    const response = await POST(request("ticket=body-ticket"));
    expect(response.status).toBe(303);
    expect(mocks.exchangeN8nGatewayTicket).toHaveBeenCalledWith(
      { database: true },
      "body-ticket",
      "n8n.example.test",
    );
    expect(response.headers.get("location")).toBe("/signup?token=invite");
    expect(response.headers.get("set-cookie")).toContain(
      "__Host-neurokurs_gate=session",
    );
  });

  it("rejects oversized exchange bodies before database access", async () => {
    const response = await POST(request(`ticket=${"a".repeat(1_025)}`));
    expect(response.status).toBe(400);
    expect(mocks.exchangeN8nGatewayTicket).not.toHaveBeenCalled();
  });
});
