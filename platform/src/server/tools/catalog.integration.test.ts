import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";

import { getToolEnvironmentDetail } from "./catalog";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform";

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
    await expect(getToolEnvironmentDetail(sql, environmentId)).resolves.toMatchObject({
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

  it("does not expose missing or deleted environments", async () => {
    await sql`
      UPDATE environments SET status = 'deleted' WHERE id = ${environmentId}
    `;
    await expect(getToolEnvironmentDetail(sql, environmentId)).resolves.toBeNull();
  });
});
