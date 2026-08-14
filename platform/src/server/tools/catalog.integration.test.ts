import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import {
  environmentBelongsToTool,
  getToolCatalog,
  getToolEnvironmentDetail,
} from "./catalog";

import { requireIntegrationDatabaseUrl } from "../../../test/integration/database";

const databaseUrl = requireIntegrationDatabaseUrl();

let sql: DatabaseSql;
let environmentId: string;

beforeAll(async () => {
  sql = createDatabaseClient(databaseUrl);
  await runMigrations(sql);
});

beforeEach(async () => {
  await sql`
    TRUNCATE TABLE audit_events, auth_rate_limits, auth_factors, auth_sessions,
      operation_steps, operations, provider_resources, domain_allocations,
      software_installations, environments, infrastructure_profiles,
      provider_connections, auth_bootstrap_state, users CASCADE
  `;
  const adminId = randomUUID();
  const profileId = randomUUID();
  environmentId = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES (${adminId}, 'tools-admin@example.test', 'not-used', 'admin')
  `;
  await sql`
    INSERT INTO infrastructure_profiles (
      id, name, provider, region_id, zone_id, preset_id, image_id
    )
    VALUES (
      ${profileId}, 'n8n', 'timeweb', 'ru-1', 'ru-1a', 'preset-2', 'ubuntu-24'
    )
  `;
  await sql`
    INSERT INTO environments (
      id, name, owner_user_id, profile_id, status
    )
    VALUES (
      ${environmentId}, 'Основная среда', ${adminId}, ${profileId}, 'active'
    )
  `;
  await sql`
    INSERT INTO provider_resources (
      id, environment_id, provider, resource_kind, provider_resource_id,
      ownership, lifecycle_status, public_metadata
    )
    VALUES (
      ${randomUUID()}, ${environmentId}, 'timeweb', 'public_ip', 'provider-1',
      'platform', 'active', '{"address":"203.0.113.10","monthlyRoubles":180}'::jsonb
    )
  `;
  await sql`
    INSERT INTO operations (
      id, environment_id, kind, status, requested_by_user_id, idempotency_key
    )
    VALUES (
      ${randomUUID()}, ${environmentId}, 'create', 'succeeded',
      ${adminId}, ${`detail-${randomUUID()}`}
    )
  `;
});

afterAll(async () => {
  await sql.end();
});

describe("tool environment detail", () => {
  it("returns safe technical drill-down data for the selected environment", async () => {
    await expect(getToolEnvironmentDetail(sql, "n8n", environmentId)).resolves.toMatchObject({
      id: environmentId,
      name: "Основная среда",
      provider: "timeweb",
      region: "ru-1",
      resources: [
        {
          kind: "public_ip",
          address: "203.0.113.10",
          monthlyRoubles: 180,
        },
      ],
      operations: [{ kind: "create", status: "succeeded" }],
    });
  });

  it("does not cross tool boundaries when resolving a service route", async () => {
    await expect(
      getToolEnvironmentDetail(sql, "notebook", environmentId),
    ).resolves.toBeNull();
    await expect(
      environmentBelongsToTool(sql, "notebook", environmentId),
    ).resolves.toBe(false);
    await expect(
      environmentBelongsToTool(sql, "n8n", environmentId),
    ).resolves.toBe(true);
  });

  it("applies the live-environment limit per tool type instead of globally", async () => {
    await expect(
      sql`
        INSERT INTO environments (id, tool_type, name, owner_user_id, status)
        SELECT ${randomUUID()}, 'notebook', 'Notebook', owner_user_id, 'active'
        FROM environments WHERE id = ${environmentId}
      `,
    ).resolves.toBeDefined();
    await expect(
      sql`
        INSERT INTO environments (id, tool_type, name, owner_user_id, status)
        SELECT ${randomUUID()}, 'n8n', 'Вторая n8n', owner_user_id, 'active'
        FROM environments WHERE id = ${environmentId}
      `,
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("counts active assignments even when a service setting uses its default", async () => {
    const studentId = randomUUID();
    await sql`
      INSERT INTO users (id, email, password_hash, role_id)
      VALUES (${studentId}, 'catalog-student@example.test', 'unused', 'student')
    `;
    await sql`
      INSERT INTO tool_access (
        tool_type, user_id, environment_id, status, expires_at,
        license_evidence_mode, license_evidence_reference, granted_by_user_id
      )
      SELECT
        'n8n', ${studentId}, id, 'active', now() + interval '30 days',
        'product_owner_risk_acceptance', 'owner-decision:test', owner_user_id
      FROM environments WHERE id = ${environmentId}
    `;
    await expect(getToolCatalog(sql)).resolves.toMatchObject([
      {
        id: "n8n",
        studentAccessEnabled: true,
        activeAccessCount: 1,
        environments: [{ id: environmentId, accessCount: 1 }],
      },
    ]);
  });

  it("does not expose missing or deleted environments", async () => {
    await sql`
      UPDATE environments SET status = 'deleted' WHERE id = ${environmentId}
    `;
    await expect(getToolEnvironmentDetail(sql, "n8n", environmentId)).resolves.toBeNull();
  });
});
