import "server-only";

import { randomUUID } from "node:crypto";

import type { DatabaseSql } from "../../db/client";
import type { FakeScenario } from "../../operations/contracts";
import type { OwnedProviderResource, TimewebResourceKind } from "./contracts";

export class FakeProviderError extends Error {
  constructor(
    public readonly code:
      | "TIMEOUT_AFTER_MUTATION"
      | "INSUFFICIENT_FUNDS"
      | "DNS_FAILED"
      | "TLS_FAILED"
      | "BACKUP_UNAVAILABLE"
      | "PARTIAL_CLEANUP",
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export class FakeTimewebAdapter {
  constructor(
    private readonly sql: DatabaseSql,
    private readonly operationId: string,
    private readonly environmentId: string,
    private readonly scenario: FakeScenario,
  ) {}

  private async ensureResource(kind: TimewebResourceKind): Promise<OwnedProviderResource> {
    const existing = await this.sql<{ provider_resource_id: string }[]>`
      SELECT provider_resource_id
      FROM provider_resources
      WHERE environment_id = ${this.environmentId}
        AND provider = 'fake-timeweb'
        AND resource_kind = ${kind}
        AND lifecycle_status <> 'deleted'
      LIMIT 1
    `;
    if (existing[0]) {
      return {
        externalId: existing[0].provider_resource_id,
        kind,
        environmentId: this.environmentId,
      };
    }
    const externalId = `fake-${kind}-${this.environmentId}`;
    await this.sql`
      INSERT INTO provider_resources (
        id, environment_id, operation_id, provider, resource_kind,
        provider_resource_id, ownership, lifecycle_status, public_metadata
      )
      VALUES (
        ${randomUUID()}, ${this.environmentId}, ${this.operationId},
        'fake-timeweb', ${kind}, ${externalId}, 'platform', 'active',
        ${this.sql.json({ simulation: true })}
      )
      ON CONFLICT (provider, resource_kind, provider_resource_id) DO NOTHING
    `;
    return { externalId, kind, environmentId: this.environmentId };
  }

  async reservePublicIp(): Promise<OwnedProviderResource> {
    if (this.scenario === "insufficient_funds") {
      throw new FakeProviderError("INSUFFICIENT_FUNDS", "Недостаточно средств для создания ресурса.");
    }
    return this.ensureResource("public_ip");
  }

  async createServer(): Promise<OwnedProviderResource> {
    await this.sql`
      INSERT INTO fake_provider_events (operation_id, event_key)
      VALUES (${this.operationId}, ${`create_server_call:${randomUUID()}`})
    `;
    await new Promise((resolve) => setTimeout(resolve, 25));
    const resource = await this.ensureResource("server");
    if (this.scenario === "timeout_after_create") {
      const first = await this.sql<{ event_key: string }[]>`
        INSERT INTO fake_provider_events (operation_id, event_key)
        VALUES (${this.operationId}, 'timeout_after_create')
        ON CONFLICT DO NOTHING
        RETURNING event_key
      `;
      if (first[0]) {
        throw new FakeProviderError(
          "TIMEOUT_AFTER_MUTATION",
          "Ответ провайдера потерян; требуется reconciliation.",
        );
      }
    }
    return resource;
  }

  async configureDns(): Promise<OwnedProviderResource> {
    if (this.scenario === "dns_failure") {
      throw new FakeProviderError("DNS_FAILED", "DNS не подтверждён.");
    }
    const resource = await this.ensureResource("dns_record");
    await this.sql`
      INSERT INTO domain_allocations (
        id, environment_id, hostname, zone_name, record_type,
        provider_resource_id, status
      )
      SELECT
        ${randomUUID()}, ${this.environmentId}, 'n8n.neurokurs.ru',
        'neurokurs.ru', 'A', provider_resources.id, 'active'
      FROM provider_resources
      WHERE environment_id = ${this.environmentId}
        AND provider_resource_id = ${resource.externalId}
      ON CONFLICT DO NOTHING
    `;
    return resource;
  }

  async verifyTls(): Promise<void> {
    if (this.scenario === "tls_failure") {
      throw new FakeProviderError("TLS_FAILED", "TLS не подтверждён.");
    }
  }

  async configureBackups(): Promise<void> {
    if (this.scenario === "backup_unavailable") {
      throw new FakeProviderError(
        "BACKUP_UNAVAILABLE",
        "Timeweb временно не применил настройки автобэкапа.",
        true,
      );
    }
  }

  async deleteOwnedResource(resource: OwnedProviderResource): Promise<void> {
    if (
      resource.environmentId !== this.environmentId ||
      !["server", "public_ip", "dns_record"].includes(resource.kind)
    ) {
      throw new FakeProviderError(
        "PARTIAL_CLEANUP",
        "Ownership resource не подтверждён.",
      );
    }
    if (resource.kind === "public_ip" && this.scenario === "partial_cleanup") {
      throw new FakeProviderError(
        "PARTIAL_CLEANUP",
        "Публичный IP остался активным и требует cleanup.",
      );
    }
    const changed = await this.sql<{ id: string }[]>`
      UPDATE provider_resources
      SET lifecycle_status = 'deleted', updated_at = now()
      WHERE environment_id = ${this.environmentId}
        AND provider = 'fake-timeweb'
        AND resource_kind = ${resource.kind}
        AND provider_resource_id = ${resource.externalId}
        AND ownership = 'platform'
        AND lifecycle_status <> 'deleted'
      RETURNING id
    `;
    if (!changed[0]) {
      const alreadyDeleted = await this.sql<{ id: string }[]>`
        SELECT id FROM provider_resources
        WHERE environment_id = ${this.environmentId}
          AND provider = 'fake-timeweb'
          AND resource_kind = ${resource.kind}
          AND provider_resource_id = ${resource.externalId}
          AND ownership = 'platform'
          AND lifecycle_status = 'deleted'
      `;
      if (!alreadyDeleted[0]) {
        throw new FakeProviderError(
          "PARTIAL_CLEANUP",
          "Ownership resource не подтверждён.",
        );
      }
    }
    if (resource.kind === "dns_record") {
      await this.sql`
        UPDATE domain_allocations SET status = 'released', updated_at = now()
        WHERE environment_id = ${this.environmentId}
          AND provider_resource_id IN (
            SELECT id FROM provider_resources
            WHERE provider_resource_id = ${resource.externalId}
          )
      `;
    }
  }
}
