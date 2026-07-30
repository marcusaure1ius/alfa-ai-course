import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  isProductionTimewebWorkflow,
  LifecycleProviderError,
  recoverDnsRecordCandidate,
  recoverPublicIpCandidate,
  requireReadyServerStatus,
  resolveDnsAmbiguityCandidate,
  resolvePublicIpAmbiguityCandidate,
  runFreshDnsCreate,
} from "./lifecycle";
import { TimewebProviderError } from "./read-only";
import {
  reserveIpStep,
  resolveDnsAmbiguityStep,
  resolvePublicIpAmbiguityStep,
  resolveServerAmbiguityStep,
} from "@/workflows/infrastructure/steps";

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
        TIMEWEB_SMOKE_EXCLUSIVE_DNS_HOSTNAME: "true",
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

  it("recovers only the one DNS record created after the durable marker", () => {
    const environmentId = "11111111-1111-4111-8111-111111111111";
    const hostname = "n8n.neurokurs.ru";
    const address = "203.0.113.12";
    const record = (externalId: string, value = address) => ({
      externalId,
      kind: "dns_record" as const,
      environmentId,
      zone: "neurokurs.ru",
      hostname,
      type: "A" as const,
      value,
      ttl: 600,
    });
    const baselineId = "88707341";
    const createdId = "88707342";
    const marker = {
      targetHash: createHash("sha256")
        .update(`${hostname}:${address}`)
        .digest("hex"),
      baselineHashes: new Set([
        createHash("sha256").update(baselineId).digest("hex"),
      ]),
    };

    expect(() =>
      recoverDnsRecordCandidate(
        [record(baselineId), record(createdId)],
        marker,
        hostname,
        address,
        [hostname, hostname],
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "UNKNOWN_DNS_OUTCOME",
      }),
    );

    expect(
      recoverDnsRecordCandidate(
        [record(createdId)],
        marker,
        hostname,
        address,
        [hostname],
      ),
    ).toEqual(record(createdId));

    expect(() =>
      recoverDnsRecordCandidate(
        [],
        marker,
        hostname,
        address,
        [],
        2,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "DNS_RECORD_NOT_READY",
        retryable: true,
      }),
    );
  });

  it("fails closed for ambiguous DNS create outcomes and releases only an absent outcome", () => {
    const environmentId = "11111111-1111-4111-8111-111111111111";
    const hostname = "n8n.neurokurs.ru";
    const address = "203.0.113.12";
    const record = (externalId: string, value = address) => ({
      externalId,
      kind: "dns_record" as const,
      environmentId,
      zone: "neurokurs.ru",
      hostname,
      type: "A" as const,
      value,
      ttl: 600,
    });
    const baselineId = "88707341";
    const marker = {
      targetHash: createHash("sha256")
        .update(`${hostname}:${address}`)
        .digest("hex"),
      baselineHashes: new Set([
        createHash("sha256").update(baselineId).digest("hex"),
      ]),
    };

    expect(() =>
      resolveDnsAmbiguityCandidate(
        [],
        marker,
        hostname,
        address,
        [],
        2,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "DNS_RECORD_NOT_READY",
        retryable: true,
      }),
    );
    expect(() =>
      resolveDnsAmbiguityCandidate(
        [record(baselineId)],
        marker,
        hostname,
        address,
        [hostname],
        10,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "UNKNOWN_DNS_OUTCOME",
      }),
    );
    expect(() =>
      resolveDnsAmbiguityCandidate(
        [],
        marker,
        hostname,
        address,
        [],
        10,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "UNKNOWN_DNS_OUTCOME",
        retryable: false,
      }),
    );
    expect(() =>
      recoverDnsRecordCandidate(
        [record("88707342", "203.0.113.99")],
        marker,
        hostname,
        address,
        [hostname],
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "UNKNOWN_DNS_OUTCOME",
      }),
    );
    expect(() =>
      recoverDnsRecordCandidate(
        [record("88707342"), record("88707343")],
        marker,
        hostname,
        address,
        [hostname, hostname],
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "DUPLICATE_OWNED_RESOURCE",
      }),
    );
    expect(() =>
      recoverDnsRecordCandidate(
        [record("88707342")],
        { ...marker, targetHash: "0".repeat(64) },
        hostname,
        address,
        [hostname],
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "STEP_STATE_INVALID",
      }),
    );
  });

  it("gives delete ambiguity resolution ten durable attempts", () => {
    expect(
      (
        resolvePublicIpAmbiguityStep as typeof resolvePublicIpAmbiguityStep & {
          maxRetries?: number;
        }
      ).maxRetries,
    ).toBe(9);
    expect(
      (
        resolveServerAmbiguityStep as typeof resolveServerAmbiguityStep & {
          maxRetries?: number;
        }
      ).maxRetries,
    ).toBe(9);
    expect(
      (
        resolveDnsAmbiguityStep as typeof resolveDnsAmbiguityStep & {
          maxRetries?: number;
        }
      ).maxRetries,
    ).toBe(9);
  });

  it("clears a DNS marker only for a definitive fresh-POST rejection", async () => {
    const definitiveClear = vi.fn<() => Promise<void>>(
      async () => undefined,
    );
    await expect(
      runFreshDnsCreate(
        async () => {
          throw new TimewebProviderError(
            "INVALID_REQUEST",
            "bad_subdomain_name",
            false,
          );
        },
        definitiveClear,
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(definitiveClear).toHaveBeenCalledOnce();

    for (const error of [
      new TimewebProviderError("TIMEOUT", "timeout", true),
      new TimewebProviderError(
        "UPSTREAM_UNAVAILABLE",
        "unavailable",
        true,
      ),
      new TimewebProviderError(
        "INVALID_RESPONSE",
        "ambiguous 2xx payload",
        false,
      ),
    ]) {
      const ambiguousClear = vi.fn<() => Promise<void>>(
        async () => undefined,
      );
      await expect(
        runFreshDnsCreate(
          async () => {
            throw error;
          },
          ambiguousClear,
        ),
      ).rejects.toBe(error);
      expect(ambiguousClear).not.toHaveBeenCalled();
    }
  });

  it("rechecks an eventual blocked status without accepting it as ready", () => {
    expect(() =>
      requireReadyServerStatus(
        { state: "supported", value: "blocked" },
        1,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "SERVER_NOT_READY",
        retryable: true,
      }),
    );
    expect(() =>
      requireReadyServerStatus(
        { state: "supported", value: "blocked" },
        3,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "SERVER_BLOCKED",
        retryable: false,
      }),
    );
    expect(() =>
      requireReadyServerStatus(
        { state: "supported", value: "no_paid" },
        1,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "SERVER_NOT_READY",
        retryable: true,
      }),
    );
    expect(() =>
      requireReadyServerStatus(
        { state: "supported", value: "no_paid" },
        3,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<LifecycleProviderError>>({
        code: "SERVER_BILLING_BLOCKED",
        retryable: false,
      }),
    );
    expect(() =>
      requireReadyServerStatus(
        { state: "supported", value: "on" },
        1,
      ),
    ).not.toThrow();
  });
});
