import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  isProductionTimewebWorkflow,
  LifecycleProviderError,
  recoverPublicIpCandidate,
  resolvePublicIpAmbiguityCandidate,
} from "./lifecycle";
import { reserveIpStep } from "@/workflows/infrastructure/steps";

describe("production Timeweb lifecycle gate", () => {
  it("fails closed instead of selecting fake after a production gate closes", () => {
    expect(() =>
      isProductionTimewebWorkflow({
        VERCEL_ENV: "production",
        PLATFORM_PROVIDER: "timeweb",
        TIMEWEB_API_TOKEN: "synthetic-test-token",
        TIMEWEB_MUTATIONS_ENABLED: "false",
        TIMEWEB_CAPABILITIES_VERIFIED: "true",
        TIMEWEB_SMOKE_EXCLUSIVE_ACCOUNT: "true",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "MUTATION_GATE_CLOSED",
      }),
    );
  });

  it("recovers exactly one new unbound IP without claiming a baseline IP", () => {
    const environmentId = "11111111-1111-4111-8111-111111111111";
    const baselineId = "11111111-2222-4333-8444-555555555555";
    const newId = "22222222-3333-4444-8555-666666666666";
    const candidate = (externalId: string) => ({
      externalId,
      kind: "public_ip" as const,
      environmentId,
      address: externalId === baselineId ? "203.0.113.10" : "203.0.113.11",
      availabilityZone: "nsk-1",
      resourceType: null,
      resourceId: null,
    });
    const baseline = new Set([
      createHash("sha256").update(baselineId).digest("hex"),
    ]);

    expect(
      recoverPublicIpCandidate(
        [candidate(baselineId), candidate(newId)],
        baseline,
        "nsk-1",
      ),
    ).toEqual(candidate(newId));
    expect(() =>
      recoverPublicIpCandidate(
        [candidate(baselineId)],
        baseline,
        "nsk-1",
        2,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "PUBLIC_IP_NOT_READY",
        retryable: true,
      }),
    );
    expect(() =>
      recoverPublicIpCandidate(
        [{ ...candidate(newId), resourceType: "server", resourceId: "42" }],
        baseline,
        "nsk-1",
        10,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "UNKNOWN_PUBLIC_IP_OUTCOME",
      }),
    );
    expect(() =>
      recoverPublicIpCandidate(
        [
          candidate(newId),
          candidate("33333333-4444-4555-8666-777777777777"),
        ],
        baseline,
        "nsk-1",
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "DUPLICATE_OWNED_RESOURCE",
      }),
    );
    expect(() =>
      resolvePublicIpAmbiguityCandidate(
        [
          candidate(baselineId),
          candidate(newId),
          {
            ...candidate("44444444-5555-4666-8777-888888888888"),
            resourceType: "server",
            resourceId: "42",
          },
        ],
        baseline,
        "nsk-1",
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "DUPLICATE_OWNED_RESOURCE",
      }),
    );
    expect(
      resolvePublicIpAmbiguityCandidate(
        [candidate(baselineId)],
        baseline,
        "nsk-1",
      ),
    ).toBeNull();
    expect(
      resolvePublicIpAmbiguityCandidate(
        [candidate(baselineId), candidate(newId)],
        baseline,
        "nsk-1",
      ),
    ).toEqual(candidate(newId));
  });

  it("gives the durable reserve step all ten bounded attempts", () => {
    expect(
      (reserveIpStep as typeof reserveIpStep & { maxRetries?: number })
        .maxRetries,
    ).toBe(9);
  });
});
