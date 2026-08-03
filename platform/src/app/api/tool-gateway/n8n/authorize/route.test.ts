import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeN8nGatewayRequest: vi.fn(),
  getDatabase: vi.fn(() => ({ database: true })),
}));

vi.mock("@/server/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/tools/n8n-gateway", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/server/tools/n8n-gateway")
  >();
  return {
    ...original,
    authorizeN8nGatewayRequest: mocks.authorizeN8nGatewayRequest,
  };
});

import { deriveN8nGatewayManagementSecret } from "@/server/tools/n8n-managed-secret";

import { GET } from "./route";

const authSecret = "authorize-example-not-a-secret-32-characters";
const secret = deriveN8nGatewayManagementSecret(authSecret);

function request(gatewaySecret = secret): Request {
  return new Request("https://course.example.test/api/tool-gateway/n8n/authorize", {
    headers: {
      cookie: "__Host-neurokurs_gate=gateway-session",
      "x-forwarded-host": "course-proxy.example.test",
      "x-neurokurs-gateway": gatewaySecret,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_SECRET", authSecret);
  vi.stubEnv("N8N_STUDENT_ACCESS_LICENSE_MODE", "product_owner_risk_acceptance");
  vi.stubEnv("N8N_STUDENT_ACCESS_LICENSE_EVIDENCE", "T-0114 route test");
  mocks.authorizeN8nGatewayRequest.mockResolvedValue(true);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/tool-gateway/n8n/authorize", () => {
  it("rejects requests without the managed Caddy secret", async () => {
    const response = await GET(request("wrong"));
    expect(response.status).toBe(403);
    expect(mocks.authorizeN8nGatewayRequest).not.toHaveBeenCalled();
  });

  it("uses the pinned n8n host instead of proxy-rewritten forwarded headers", async () => {
    const response = await GET(request());
    expect(response.status).toBe(204);
    expect(mocks.authorizeN8nGatewayRequest).toHaveBeenCalledWith(
      { database: true },
      "gateway-session",
      "n8n.neurokurs.ru",
      expect.any(Date),
      true,
    );
  });
});
