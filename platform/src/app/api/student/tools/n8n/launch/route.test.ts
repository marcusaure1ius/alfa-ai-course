import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  getDatabase: vi.fn(() => ({ database: true })),
  issueN8nGatewayTicket: vi.fn(),
  createN8nGatewayExchangeResponse: vi.fn(),
}));

vi.mock("@/server/auth/access", () => ({
  requireSession: mocks.requireSession,
}));
vi.mock("@/server/db/client", () => ({ getDatabase: mocks.getDatabase }));
vi.mock("@/server/tools/student-access", () => ({
  getN8nStudentAccessLicenseGate: () => ({
    ready: true,
    mode: "product_owner_risk_acceptance",
    evidenceReference: "test",
  }),
}));
vi.mock("@/server/tools/n8n-gateway", async (importOriginal) => {
  const original = await importOriginal<
    typeof import("@/server/tools/n8n-gateway")
  >();
  return {
    ...original,
    issueN8nGatewayTicket: mocks.issueN8nGatewayTicket,
    createN8nGatewayExchangeResponse: mocks.createN8nGatewayExchangeResponse,
  };
});

import { N8nGatewayError } from "@/server/tools/n8n-gateway";

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue({
    ok: true,
    session: {
      userId: "student-1",
      role: "student",
    },
  });
});

describe("GET /api/student/tools/n8n/launch", () => {
  it("возвращает ученика на detail с понятным notice при race доступа", async () => {
    mocks.issueN8nGatewayTicket.mockRejectedValue(
      new N8nGatewayError("NOT_READY"),
    );
    const response = await GET(
      new Request("https://course.example.test/api/student/tools/n8n/launch"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://course.example.test/student/tools/n8n?notice=launch-unavailable",
    );
  });
});
