import { randomBytes, randomUUID } from "node:crypto";

import { RetryableError } from "@workflow/core";

import {
  bootstrapAdmin,
  getSessionByToken,
  loginWithPassword,
  reauthenticateSession,
} from "../src/server/auth/service";
import { createTotpCode } from "../src/server/auth/mfa";
import { getDatabase } from "../src/server/db/client";
import { runMigrations } from "../src/server/db/migrate";
import {
  finishOperation,
  getOperationTimeline,
  operationEnvironmentId,
  reserveCreateOperation,
  reserveDeleteOperation,
  transitionEnvironment,
} from "../src/server/operations/repository";
import { TimewebReadOnlyAdapter } from "../src/server/providers/timeweb/read-only";
import { getTimewebProvisioningPreview } from "../src/server/providers/timeweb/provisioning";
import { createEnvironmentWorkflow } from "../src/workflows/infrastructure/create";
import { deleteEnvironmentWorkflow } from "../src/workflows/infrastructure/delete";

const CONFIRMATION_FLAG = "--confirm-disposable-smoke";
const EXPECTED_DATABASE_PREFIX = "course_platform_timeweb_smoke";
const environmentName = `t0083-disposable-${randomUUID().slice(0, 8)}`;

function printHelp(): void {
  console.log(`Одноразовый production-shaped Timeweb plain-VPS smoke для T-0083.

Использование:
  npm run smoke:timeweb-plain-vps -- ${CONFIRMATION_FLAG}

Требования:
  - отдельная пустая PostgreSQL database с именем ${EXPECTED_DATABASE_PREFIX}*;
  - VERCEL_ENV=production и PLATFORM_PROVIDER=timeweb;
  - TIMEWEB_API_TOKEN с доступом к существующим project и SSH key;
  - Timeweb account без VPS;
  - test token, который будет отозван после smoke.

Smoke создаёт и удаляет один тарифицируемый VPS и один floating IPv4.
Скрипт не печатает credentials, provider resource IDs или IP-адреса.`);
}

function requireRuntime(): void {
  if (!process.argv.includes(CONFIRMATION_FLAG)) {
    throw new Error(`Требуется явный флаг ${CONFIRMATION_FLAG}.`);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL не настроен.");
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (!databaseName.startsWith(EXPECTED_DATABASE_PREFIX)) {
    throw new Error(
      `Smoke разрешён только для отдельной database ${EXPECTED_DATABASE_PREFIX}*.`,
    );
  }
  const requiredValues: Record<string, string> = {
    VERCEL_ENV: "production",
    PLATFORM_PROVIDER: "timeweb",
  };
  for (const [key, expected] of Object.entries(requiredValues)) {
    if (process.env[key] !== expected) {
      throw new Error(`${key} должен иметь значение ${expected}.`);
    }
  }
  if (!process.env.TIMEWEB_API_TOKEN) {
    throw new Error("TIMEWEB_API_TOKEN не настроен.");
  }
}

function base32(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    result += alphabet[Number.parseInt(chunk, 2)];
  }
  return result;
}

function progress(message: string): void {
  console.log(`[T-0083] ${message}`);
}

async function retryWorkflow<T>(
  label: string,
  action: () => Promise<T>,
  maxAttempts: number,
  retryAfterMs: number,
  beforeAttempt?: () => Promise<void>,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await beforeAttempt?.();
      return await action();
    } catch (error) {
      if (!(error instanceof RetryableError) || attempt === maxAttempts) {
        throw error;
      }
      progress(
        `${label}: безопасный retry ${attempt}/${maxAttempts}: ${error.message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    }
  }
  throw new Error(`${label}: исчерпаны retries.`);
}

async function waitForProviderCounts(
  adapter: TimewebReadOnlyAdapter,
  expected: { servers: number; ips: number },
  label: string,
): Promise<Awaited<ReturnType<TimewebReadOnlyAdapter["discover"]>>> {
  let last: Awaited<ReturnType<TimewebReadOnlyAdapter["discover"]>> | null =
    null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    last = await adapter.discover();
    if (
      last.servers.length === expected.servers &&
      last.floatingIps.length === expected.ips
    ) {
      return last;
    }
    if (attempt < 10) {
      progress(`${label}: catalog retry ${attempt}/10.`);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    }
  }
  throw new Error(
    `${label}: provider counts ${last?.servers.length ?? -1} VPS / ` +
      `${last?.floatingIps.length ?? -1} IP не совпали с ожидаемыми.`,
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }
  requireRuntime();

  const sql = getDatabase();
  let actor: Awaited<ReturnType<typeof loginWithPassword>> | null = null;
  let environmentId: string | null = null;
  let createOperationId: string | null = null;
  let deleteOperationId: string | null = null;
  let deletionCompleted = false;
  let providerBaseline: { servers: number; ips: number } | null = null;
  let authMaterial: { password: string; totpSecret: string } | null = null;
  const createIdempotencyKey = `t0083-create-${randomUUID()}`;
  const deleteIdempotencyKey = `t0083-delete-${randomUUID()}`;
  const cleanupIdempotencyKey = `t0083-cleanup-${randomUUID()}`;

  async function ensureFreshReauth(force = false): Promise<void> {
    const currentActor = actor;
    const currentAuthMaterial = authMaterial;
    if (!currentActor?.ok || !currentAuthMaterial) {
      throw new Error("Нельзя обновить re-auth без активной admin session.");
    }
    const reauthAgeMs =
      Date.now() - currentActor.session.reauthenticatedAt.getTime();
    if (!force && reauthAgeMs < 8 * 60 * 1_000) return;

    const accepted = await reauthenticateSession(sql, currentActor.session, {
      password: currentAuthMaterial.password,
      mfaCode: createTotpCode(currentAuthMaterial.totpSecret),
    });
    if (!accepted) {
      throw new Error("Не удалось обновить production MFA re-auth.");
    }
    const refreshedSession = await getSessionByToken(sql, currentActor.token);
    if (!refreshedSession?.mfaAuthenticatedAt) {
      throw new Error("Обновлённая production MFA session не найдена.");
    }
    actor = {
      ok: true,
      token: currentActor.token,
      session: refreshedSession,
    };
  }

  try {
    const readAdapter = new TimewebReadOnlyAdapter(
      process.env.TIMEWEB_API_TOKEN!,
    );
    const before = await readAdapter.discover();
    if (before.account.state !== "ready" || before.degraded) {
      throw new Error("Timeweb read-only catalog не готов к smoke.");
    }
    if (before.servers.length !== 0) {
      throw new Error("Hard limit закрыт: в Timeweb уже существует VPS.");
    }
    providerBaseline = {
      servers: before.servers.length,
      ips: before.floatingIps.length,
    };

    const catalogPreview = await getTimewebProvisioningPreview();
    if (!catalogPreview.ok || catalogPreview.mode !== "timeweb") {
      throw new Error(
        catalogPreview.ok
          ? "Preview не закреплён за Timeweb."
          : `${catalogPreview.code}: ${catalogPreview.message}`,
      );
    }
    const moscow = catalogPreview.catalog.regions.find(
      (region) => region.id === "ru-3",
    );
    const lowestMoscowPreset = moscow?.presets[0];
    if (!moscow || !lowestMoscowPreset) {
      throw new Error("Live catalog не содержит минимальный Moscow preset.");
    }
    const preview = await getTimewebProvisioningPreview(process.env, fetch, {
      selection: {
        region: moscow.id,
        presetId: lowestMoscowPreset.id,
        operatingSystemId:
          catalogPreview.catalog.defaultSelection.operatingSystemId,
        backupsEnabled: false,
        publicIpv4: true,
      },
    });
    if (!preview.ok || preview.mode !== "timeweb") {
      throw new Error(
        preview.ok
          ? "Selected preview не закреплён за Timeweb."
          : `${preview.code}: ${preview.message}`,
      );
    }
    progress(
      `preflight PASS: ${preview.plan.monthlyTotalRoubles} ₽/месяц, ` +
        `${preview.plan.operatingSystemLabel}, ${preview.plan.regionLabel}; ` +
        `provider balance ${before.balance.amount} ${before.balance.currency}.`,
    );

    await runMigrations(sql);
    const smokeDatabaseState = await sql<
      {
        users: number;
        environments: number;
        operations: number;
        resources: number;
      }[]
    >`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM environments) AS environments,
        (SELECT count(*)::int FROM operations) AS operations,
        (SELECT count(*)::int FROM provider_resources) AS resources
    `;
    const state = smokeDatabaseState[0];
    if (
      !state ||
      state.users !== 0 ||
      state.environments !== 0 ||
      state.operations !== 0 ||
      state.resources !== 0
    ) {
      throw new Error("Smoke database не пуста; mutation запрещена.");
    }

    const password = randomBytes(32).toString("base64url");
    const totpSecret = base32(randomBytes(20));
    authMaterial = { password, totpSecret };
    const factorEncryptionKey = randomBytes(32).toString("base64url");
    const email = `t0083-${randomUUID()}@localhost.invalid`;
    process.env.AUTH_FACTOR_ENCRYPTION_KEY = factorEncryptionKey;
    await bootstrapAdmin(sql, {
      email,
      password,
      totpSecret,
      totpCode: createTotpCode(totpSecret),
      factorEncryptionKey,
    });
    actor = await loginWithPassword(sql, {
      email,
      password,
      mfaCode: createTotpCode(totpSecret),
    });
    if (!actor.ok || !actor.session.mfaAuthenticatedAt) {
      throw new Error("Production MFA login не подтверждён.");
    }
    progress("production MFA и fresh re-auth подтверждены.");

    const create = await reserveCreateOperation(sql, actor.session, {
      name: environmentName,
      idempotencyKey: createIdempotencyKey,
      scenario: "success",
      providerPlan: preview.plan,
    });
    createOperationId = create.accepted.operationId;
    environmentId = await operationEnvironmentId(sql, createOperationId);
    progress("create operation зарезервирована.");

    const createResult = await retryWorkflow(
      "create/reconcile",
      () =>
        createEnvironmentWorkflow({
          operationId: createOperationId!,
          scenario: "success",
        }),
      25,
      15_000,
      ensureFreshReauth,
    );
    if (createResult.status !== "active") {
      throw new Error(`Create завершился состоянием ${createResult.status}.`);
    }

    const duplicate = await reserveCreateOperation(sql, actor.session, {
      name: environmentName,
      idempotencyKey: createIdempotencyKey,
      scenario: "success",
      providerPlan: { ...preview.plan, checkedAt: new Date().toISOString() },
    });
    if (
      duplicate.created ||
      duplicate.accepted.operationId !== create.accepted.operationId
    ) {
      throw new Error("Idempotency replay вернул другую create operation.");
    }

    const afterCreate = await waitForProviderCounts(
      readAdapter,
      {
        servers: before.servers.length + 1,
        ips: before.floatingIps.length + 1,
      },
      "after create",
    );
    const readyState = await sql<
      {
        environment_status: string;
        operation_status: string;
        server_id: string;
        public_ip_id: string;
        public_ip: string;
        preset_id: string;
      }[]
    >`
      SELECT
        environments.status AS environment_status,
        operations.status AS operation_status,
        server.provider_resource_id AS server_id,
        public_ip.provider_resource_id AS public_ip_id,
        public_ip.public_metadata->>'address' AS public_ip,
        server.public_metadata->>'presetId' AS preset_id
      FROM environments
      JOIN operations
        ON operations.id = ${createOperationId}
        AND operations.environment_id = environments.id
      JOIN provider_resources AS server
        ON server.environment_id = environments.id
        AND server.resource_kind = 'server'
        AND server.lifecycle_status = 'active'
      JOIN provider_resources AS public_ip
        ON public_ip.environment_id = environments.id
        AND public_ip.resource_kind = 'public_ip'
        AND public_ip.lifecycle_status = 'active'
      WHERE environments.id = ${environmentId}
    `;
    const ready = readyState[0];
    if (
      !ready ||
      ready.environment_status !== "active" ||
      ready.operation_status !== "succeeded" ||
      ready.preset_id !== String(preview.plan.presetId)
    ) {
      throw new Error("Durable active state или exact provider plan не подтверждены.");
    }
    const liveServer = afterCreate.servers.find(
      (server) => server.id === ready.server_id,
    );
    const liveIp = afterCreate.floatingIps.find(
      (ip) => ip.id === ready.public_ip_id,
    );
    if (
      !liveServer ||
      liveServer.status.state !== "supported" ||
      liveServer.status.value !== "on" ||
      !liveIp ||
      liveIp.address !== ready.public_ip ||
      liveIp.resourceType !== "server" ||
      liveIp.resourceId !== ready.server_id
    ) {
      throw new Error("Provider on status или exact IPv4 binding не подтверждены.");
    }
    const timeline = await getOperationTimeline(sql, createOperationId);
    const expectedSteps = [
      "reserve_public_ip",
      "create_server",
      "provider_installing",
      "configure_backups",
      "complete",
    ];
    if (
      timeline?.status !== "succeeded" ||
      expectedSteps.some(
        (key) =>
          !timeline.steps.some(
            (step) => step.key === key && step.status === "succeeded",
          ),
      )
    ) {
      throw new Error("Create timeline не подтвердил все durable шаги.");
    }
    progress("create/reconcile PASS: VPS on, exact IPv4 и backup policy подтверждены.");

    await ensureFreshReauth(true);
    if (!actor?.ok) {
      throw new Error("Admin session потеряна перед delete.");
    }
    const deletion = await reserveDeleteOperation(sql, actor.session, {
      environmentId,
      confirmationName: environmentName,
      confirmedLoss: true,
      idempotencyKey: deleteIdempotencyKey,
      scenario: "success",
    });
    deleteOperationId = deletion.accepted.operationId;
    const deleteResult = await retryWorkflow(
      "delete/cleanup",
      () =>
        deleteEnvironmentWorkflow({
          operationId: deleteOperationId!,
          scenario: "success",
        }),
      10,
      5_000,
      ensureFreshReauth,
    );
    if (deleteResult.status !== "deleted") {
      throw new Error(`Delete завершился состоянием ${deleteResult.status}.`);
    }
    deletionCompleted = true;

    const afterDelete = await waitForProviderCounts(
      readAdapter,
      providerBaseline,
      "after delete",
    );
    const databaseState = await sql<
      { status: string; active_resources: number }[]
    >`
      SELECT
        environments.status,
        count(provider_resources.id) FILTER (
          WHERE provider_resources.lifecycle_status <> 'deleted'
        )::int AS active_resources
      FROM environments
      LEFT JOIN provider_resources
        ON provider_resources.environment_id = environments.id
      WHERE environments.id = ${environmentId}
      GROUP BY environments.id
    `;
    if (
      afterDelete.servers.length !== before.servers.length ||
      afterDelete.floatingIps.length !== before.floatingIps.length ||
      databaseState[0]?.status !== "deleted" ||
      databaseState[0]?.active_resources !== 0
    ) {
      throw new Error("Финальная проверка обнаружила остаточный ресурс.");
    }

    console.log(
      JSON.stringify({
        status: "PASS",
        createOperationId: create.accepted.operationId,
        deleteOperationId: deletion.accepted.operationId,
        deploymentMode: preview.plan.deploymentMode,
        environmentStatus: databaseState[0].status,
        activeOwnedResources: databaseState[0].active_resources,
        providerServersBefore: before.servers.length,
        providerServersAfter: afterDelete.servers.length,
        providerIpsBefore: before.floatingIps.length,
        providerIpsAfter: afterDelete.floatingIps.length,
        serverReachedOn: true,
        exactIpv4Binding: true,
        backupPolicyApplied: true,
        idempotencyReplay: true,
      }),
    );
  } finally {
    if (environmentId && actor?.ok && !deletionCompleted) {
      progress("Запускаю обязательное recovery/cleanup после ошибки.");
      try {
        let rows = await sql<{ status: string }[]>`
          SELECT status FROM environments WHERE id = ${environmentId}
        `;
        if (rows[0]?.status === "creating" && createOperationId) {
          await retryWorkflow(
            "resume create for cleanup",
            () =>
              createEnvironmentWorkflow({
                operationId: createOperationId!,
                scenario: "success",
              }),
            25,
            15_000,
            ensureFreshReauth,
          ).catch(() => undefined);
          rows = await sql<{ status: string }[]>`
            SELECT status FROM environments WHERE id = ${environmentId}
          `;
          if (rows[0]?.status === "creating") {
            await finishOperation(sql, createOperationId, {
              status: "failed",
              code: "RECOVERY_CLEANUP_REQUIRED",
              message:
                "Create reconciliation не завершился; требуется guarded cleanup.",
            });
            await transitionEnvironment(
              sql,
              createOperationId,
              "creating",
              "cleanup_required",
            );
            rows = await sql<{ status: string }[]>`
              SELECT status FROM environments WHERE id = ${environmentId}
            `;
          }
        }
        if (rows[0]?.status === "deleting" && deleteOperationId) {
          const resumed = await retryWorkflow(
            "resume existing delete",
            () =>
              deleteEnvironmentWorkflow({
                operationId: deleteOperationId!,
                scenario: "success",
              }),
            10,
            5_000,
            ensureFreshReauth,
          );
          deletionCompleted = resumed.status === "deleted";
          rows = await sql<{ status: string }[]>`
            SELECT status FROM environments WHERE id = ${environmentId}
          `;
        }
        if (
          rows[0] &&
          ["active", "degraded", "cleanup_required"].includes(rows[0].status)
        ) {
          await ensureFreshReauth(true);
          if (!actor?.ok) {
            throw new Error("Admin session потеряна перед recovery cleanup.");
          }
          const cleanup = await reserveDeleteOperation(sql, actor.session, {
            environmentId,
            confirmationName: environmentName,
            confirmedLoss: true,
            idempotencyKey: cleanupIdempotencyKey,
            scenario: "success",
          });
          const result = await retryWorkflow(
            "error cleanup",
            () =>
              deleteEnvironmentWorkflow({
                operationId: cleanup.accepted.operationId,
                scenario: "success",
              }),
            10,
            5_000,
            ensureFreshReauth,
          );
          deletionCompleted = result.status === "deleted";
          progress(`error cleanup: ${result.status}.`);
        }
        const finalRows = await sql<{ status: string }[]>`
          SELECT status FROM environments WHERE id = ${environmentId}
        `;
        if (finalRows[0]?.status === "deleted") deletionCompleted = true;

        if (providerBaseline) {
          await waitForProviderCounts(
            new TimewebReadOnlyAdapter(process.env.TIMEWEB_API_TOKEN!),
            providerBaseline,
            "recovery baseline",
          );
        }
      } catch {
        console.error(
          "[T-0083] AUTOMATIC CLEANUP FAILED — database сохранена для recovery.",
        );
        process.exitCode = 1;
      }
    }
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка.";
  console.error(`[T-0083] FAIL: ${message}`);
  process.exitCode = 1;
});
