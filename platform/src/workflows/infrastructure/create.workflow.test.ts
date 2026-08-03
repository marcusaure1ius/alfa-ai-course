import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getRun, start } from "@workflow/core/runtime";

import { POST as createEndpoint } from "@/app/api/admin/infrastructure/environments/route";
import { DELETE as deleteEndpoint } from "@/app/api/admin/infrastructure/environments/[id]/route";
import { POST as installEndpoint } from "@/app/api/admin/infrastructure/environments/[id]/install-n8n/route";
import type { AuthSession } from "@/server/auth/service";
import { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/server/auth/config";
import { hashOpaqueToken } from "@/server/auth/crypto";
import { issueCsrfToken } from "@/server/auth/csrf";
import { createDatabaseClient, type DatabaseSql } from "@/server/db/client";
import { runMigrations } from "@/server/db/migrate";
import { reserveCreateOperation } from "@/server/operations/repository";
import { createEnvironmentWorkflow } from "./create";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://platform:local-example-not-a-secret@127.0.0.1:55432/course_platform_t0052";
process.env.DATABASE_URL = databaseUrl;
process.env.AUTH_SECRET = "workflow-example-not-a-secret-32-characters";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.VERCEL_ENV = "development";
const fakeDeployment = {
  region: "ru-3",
  presetId: 4_800,
  operatingSystemId: 202,
  backupsEnabled: false,
  publicIpv4: true,
} as const;

let sql: DatabaseSql;
let actor: AuthSession;
let sessionToken: string;

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
  const userId = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES (${userId}, 'workflow-admin@example.test', 'not-used-by-this-test', 'admin')
  `;
  actor = {
    sessionId: randomUUID(),
    userId,
    email: "workflow-admin@example.test",
    role: "admin",
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: new Date(),
    mfaAuthenticatedAt: null,
  };
  sessionToken = `workflow-session-${randomUUID()}`;
  await sql`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
    VALUES (
      ${actor.sessionId}, ${userId}, ${hashOpaqueToken(sessionToken)},
      ${actor.expiresAt}
    )
  `;
});

afterAll(async () => {
  await sql.end();
});

describe("Vercel Workflow orchestration", () => {
  it("rejects generic provider proxy fields at the browser boundary", async () => {
    const csrf = issueCsrfToken();
    const headers = {
      cookie: `${CSRF_COOKIE_NAME}=${csrf.nonce}; ${SESSION_COOKIE_NAME}=${sessionToken}`,
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "x-csrf-token": csrf.token,
    };
    const createResponse = await createEndpoint(
      new Request("http://localhost:3000/api/admin/infrastructure/environments", {
        method: "POST",
        headers,
        body: JSON.stringify({
          toolType: "n8n",
          name: "API среда",
          idempotencyKey: "proxy-create-key-0001",
          providerResourceId: "54321",
          url: "https://attacker.invalid",
          method: "DELETE",
          payload: { arbitrary: true },
        }),
      }),
    );
    expect(createResponse.status).toBe(400);

    const deleteResponse = await deleteEndpoint(
      new Request(
        "http://localhost:3000/api/admin/infrastructure/environments/11111111-1111-4111-8111-111111111111",
        {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            toolType: "n8n",
            confirmationName: "API среда",
            idempotencyKey: "proxy-delete-key-0001",
            providerResourceId: "54321",
          }),
        },
      ),
      {
        params: Promise.resolve({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      },
    );
    expect(deleteResponse.status).toBe(400);
    const missingLossConfirmation = await deleteEndpoint(
      new Request(
        "http://localhost:3000/api/admin/infrastructure/environments/11111111-1111-4111-8111-111111111111",
        {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            toolType: "n8n",
            confirmationName: "API среда",
            idempotencyKey: "missing-loss-confirmation-01",
          }),
        },
      ),
      {
        params: Promise.resolve({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      },
    );
    expect(missingLossConfirmation.status).toBe(400);
    const installProxyResponse = await installEndpoint(
      new Request(
        "http://localhost:3000/api/admin/infrastructure/environments/11111111-1111-4111-8111-111111111111/install-n8n",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            toolType: "n8n",
            confirmationName: "API среда",
            confirmedLoss: true,
            idempotencyKey: "proxy-install-key-0001",
            providerResourceId: "54321",
            cloudInit: "#!/bin/sh",
          }),
        },
      ),
      {
        params: Promise.resolve({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      },
    );
    expect(installProxyResponse.status).toBe(400);
    expect(
      await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM operations
      `,
    ).toEqual([{ count: 0 }]);
  });

  it("returns 202 and one operation for repeated actor/idempotency requests", async () => {
    const csrf = issueCsrfToken();
    const request = () =>
      new Request("http://localhost:3000/api/admin/infrastructure/environments", {
        method: "POST",
        headers: {
          cookie: `${CSRF_COOKIE_NAME}=${csrf.nonce}; ${SESSION_COOKIE_NAME}=${sessionToken}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
          "x-csrf-token": csrf.token,
        },
        body: JSON.stringify({
          toolType: "n8n",
          name: "API среда",
          idempotencyKey: "api-create-idempotency-01",
          simulation: "success",
          deployment: fakeDeployment,
        }),
      });
    const first = await createEndpoint(request());
    const second = await createEndpoint(request());
    expect(first.status, await first.clone().text()).toBe(202);
    expect(second.status).toBe(202);
    const firstBody = (await first.json()) as { operationId: string };
    const secondBody = (await second.json()) as { operationId: string };
    expect(secondBody.operationId).toBe(firstBody.operationId);

    const runs = await sql<{ workflow_run_id: string }[]>`
      SELECT workflow_run_id FROM operations WHERE id = ${firstBody.operationId}
    `;
    await expect(getRun(runs[0]!.workflow_run_id).returnValue).resolves.toEqual({
      status: "active",
    });
    expect(
      await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM operations
        WHERE requested_by_user_id = ${actor.userId}
          AND idempotency_key = 'api-create-idempotency-01'
      `,
    ).toEqual([{ count: 1 }]);
  });

  it("retries an unknown create outcome and reconciles to one server", async () => {
    const reserved = await reserveCreateOperation(sql, actor, {
      name: "Workflow среда",
      idempotencyKey: "workflow-timeout-key-01",
      scenario: "timeout_after_create",
    });
    const run = await start(createEnvironmentWorkflow, [
      {
        operationId: reserved.accepted.operationId,
        scenario: "timeout_after_create",
      },
    ]);
    await expect(run.returnValue).resolves.toEqual({ status: "active" });

    const rows = await sql<{ servers: number; attempts: number }[]>`
      SELECT
        count(DISTINCT provider_resources.id) FILTER (
          WHERE provider_resources.resource_kind = 'server'
        )::int AS servers,
        max(operation_steps.attempt_count) FILTER (
          WHERE operation_steps.logical_key = 'create_server'
        )::int AS attempts
      FROM operations
      LEFT JOIN provider_resources
        ON provider_resources.environment_id = operations.environment_id
      LEFT JOIN operation_steps ON operation_steps.operation_id = operations.id
      WHERE operations.id = ${reserved.accepted.operationId}
      GROUP BY operations.id
    `;
    expect(rows[0]).toEqual({ servers: 1, attempts: 2 });
  });

  it("installs n8n as a separate idempotent operation on the same VPS", async () => {
    const csrf = issueCsrfToken();
    const headers = {
      cookie: `${CSRF_COOKIE_NAME}=${csrf.nonce}; ${SESSION_COOKIE_NAME}=${sessionToken}`,
      origin: "http://localhost:3000",
      "content-type": "application/json",
      "x-csrf-token": csrf.token,
    };
    const createResponse = await createEndpoint(
      new Request("http://localhost:3000/api/admin/infrastructure/environments", {
        method: "POST",
        headers,
        body: JSON.stringify({
          toolType: "n8n",
          name: "Install среда",
          idempotencyKey: "install-create-idempotency-01",
          simulation: "success",
          deployment: fakeDeployment,
        }),
      }),
    );
    expect(createResponse.status, await createResponse.clone().text()).toBe(202);
    const createBody = (await createResponse.json()) as { operationId: string };
    const createRows = await sql<
      { workflow_run_id: string; environment_id: string }[]
    >`
      SELECT workflow_run_id, environment_id
      FROM operations
      WHERE id = ${createBody.operationId}
    `;
    await expect(
      getRun(createRows[0]!.workflow_run_id).returnValue,
    ).resolves.toEqual({ status: "active" });
    const environmentId = createRows[0]!.environment_id;
    const installRequest = () =>
      new Request(
        `http://localhost:3000/api/admin/infrastructure/environments/${environmentId}/install-n8n`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            toolType: "n8n",
            confirmationName: "Install среда",
            confirmedLoss: true,
            idempotencyKey: "install-operation-idempotency-01",
            simulation: "success",
          }),
        },
      );
    const first = await installEndpoint(installRequest(), {
      params: Promise.resolve({ id: environmentId }),
    });
    const second = await installEndpoint(installRequest(), {
      params: Promise.resolve({ id: environmentId }),
    });
    expect(first.status, await first.clone().text()).toBe(202);
    expect(second.status, await second.clone().text()).toBe(202);
    const firstBody = (await first.json()) as { operationId: string };
    const secondBody = (await second.json()) as { operationId: string };
    expect(secondBody.operationId).toBe(firstBody.operationId);

    const installRows = await sql<{ workflow_run_id: string }[]>`
      SELECT workflow_run_id FROM operations WHERE id = ${firstBody.operationId}
    `;
    await expect(
      getRun(installRows[0]!.workflow_run_id).returnValue,
    ).resolves.toEqual({ status: "ready_owner_setup_required" });

    const result = await sql<
      {
        servers: number;
        public_ips: number;
        dns_records: number;
        installations: number;
        install_calls: number;
        public_url: string | null;
      }[]
    >`
      SELECT
        count(*) FILTER (
          WHERE provider_resources.resource_kind = 'server'
            AND provider_resources.lifecycle_status <> 'deleted'
        )::int AS servers,
        count(*) FILTER (
          WHERE provider_resources.resource_kind = 'public_ip'
            AND provider_resources.lifecycle_status <> 'deleted'
        )::int AS public_ips,
        count(*) FILTER (
          WHERE provider_resources.resource_kind = 'dns_record'
            AND provider_resources.lifecycle_status <> 'deleted'
        )::int AS dns_records,
        (SELECT count(*)::int FROM software_installations
          WHERE environment_id = ${environmentId}) AS installations,
        (SELECT count(*)::int FROM fake_provider_events
          WHERE operation_id = ${firstBody.operationId}
            AND event_key = 'install_server') AS install_calls,
        environments.public_url
      FROM environments
      LEFT JOIN provider_resources
        ON provider_resources.environment_id = environments.id
      WHERE environments.id = ${environmentId}
      GROUP BY environments.id
    `;
    expect(result[0]).toEqual({
      servers: 1,
      public_ips: 1,
      dns_records: 1,
      installations: 1,
      install_calls: 1,
      public_url: "https://n8n.neurokurs.ru",
    });

    const deleteResponse = await deleteEndpoint(
      new Request(
        `http://localhost:3000/api/admin/infrastructure/environments/${environmentId}`,
        {
          method: "DELETE",
          headers,
          body: JSON.stringify({
            toolType: "n8n",
            confirmationName: "Install среда",
            confirmedLoss: true,
            idempotencyKey: "install-cleanup-idempotency-01",
            simulation: "success",
          }),
        },
      ),
      { params: Promise.resolve({ id: environmentId }) },
    );
    expect(
      deleteResponse.status,
      await deleteResponse.clone().text(),
    ).toBe(202);
    const deleteBody = (await deleteResponse.json()) as { operationId: string };
    const deleteRows = await sql<{ workflow_run_id: string }[]>`
      SELECT workflow_run_id FROM operations WHERE id = ${deleteBody.operationId}
    `;
    await expect(
      getRun(deleteRows[0]!.workflow_run_id).returnValue,
    ).resolves.toEqual({ status: "deleted" });
    await expect(
      sql<
        {
          owned_resources: number;
          installation_status: string;
          public_url: string | null;
        }[]
      >`
        SELECT
          (SELECT count(*)::int FROM provider_resources
            WHERE environment_id = ${environmentId}
              AND lifecycle_status <> 'deleted') AS owned_resources,
          software_installations.status AS installation_status,
          environments.public_url
        FROM environments
        JOIN software_installations
          ON software_installations.environment_id = environments.id
        WHERE environments.id = ${environmentId}
      `,
    ).resolves.toEqual([
      {
        owned_resources: 0,
        installation_status: "deleted",
        public_url: null,
      },
    ]);
  });
});
