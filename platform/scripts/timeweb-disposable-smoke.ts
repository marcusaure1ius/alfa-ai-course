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
  operationEnvironmentId,
  finishOperation,
  reserveCreateOperation,
  reserveDeleteOperation,
  transitionEnvironment,
} from "../src/server/operations/repository";
import { TimewebReadOnlyAdapter } from "../src/server/providers/timeweb/read-only";
import { createProductionTimewebMutationAdapter } from "../src/server/providers/timeweb/mutation";
import { getTimewebProvisioningPreview } from "../src/server/providers/timeweb/provisioning";
import { ExternalEnvironmentVerifier } from "../src/server/providers/timeweb/external-health";
import {
  COURSE_DNS_ZONE,
  COURSE_HOSTNAME,
  STARTER_KIT_BOOTSTRAP_PROFILE,
} from "../src/server/providers/timeweb/bootstrap-profile";
import { createEnvironmentWorkflow } from "../src/workflows/infrastructure/create";
import { deleteEnvironmentWorkflow } from "../src/workflows/infrastructure/delete";

const CONFIRMATION_FLAG = "--confirm-disposable-smoke";
const EXPECTED_DATABASE = "course_platform_timeweb_smoke";
const environmentName = `t0057-disposable-${randomUUID().slice(0, 8)}`;

function printHelp(): void {
  console.log(`Одноразовый production-shaped Timeweb smoke для T-0057.

Использование:
  npm run smoke:timeweb-disposable -- ${CONFIRMATION_FLAG}

Требования:
  - отдельная пустая PostgreSQL database ${EXPECTED_DATABASE};
  - VERCEL_ENV=production и PLATFORM_PROVIDER=timeweb;
  - TIMEWEB_API_TOKEN с доступом к существующим project и SSH key;
  - Timeweb account без VPS;
  - test token, который будет отозван после smoke.

Скрипт не печатает credentials, provider resource IDs или IP-адреса.`);
}

function requireRuntime(): void {
  if (!process.argv.includes(CONFIRMATION_FLAG)) {
    throw new Error(`Требуется явный флаг ${CONFIRMATION_FLAG}.`);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL не настроен.");
  const databaseName = new URL(databaseUrl).pathname.replace(/^\//, "");
  if (databaseName !== EXPECTED_DATABASE) {
    throw new Error(
      `Smoke разрешён только для отдельной database ${EXPECTED_DATABASE}.`,
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
  console.log(`[T-0057] ${message}`);
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

async function waitForRebootRecovery(
  readAdapter: TimewebReadOnlyAdapter,
  verifier: ExternalEnvironmentVerifier,
  serverId: string,
  expectedIpv4: string,
): Promise<string> {
  let rebootObserved = false;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const catalog = await readAdapter.discover();
    const server = catalog.servers.find((candidate) => candidate.id === serverId);
    const providerNotReady =
      !server ||
      server.status.state !== "supported" ||
      server.status.value !== "on";
    let endpointNotReady = false;
    try {
      await verifier.verifyN8nHealth();
    } catch {
      endpointNotReady = true;
    }
    if (providerNotReady || endpointNotReady) {
      rebootObserved = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  if (!rebootObserved) {
    throw new Error("Provider reboot не был наблюдаем во внешнем состоянии.");
  }

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const catalog = await readAdapter.discover();
      const server = catalog.servers.find(
        (candidate) => candidate.id === serverId,
      );
      if (
        !server ||
        server.status.state !== "supported" ||
        server.status.value !== "on"
      ) {
        throw new Error("VPS ещё не вернулся в on.");
      }
      await verifier.verifyDns(expectedIpv4);
      const fingerprint = await verifier.verifyTlsAndPorts(expectedIpv4);
      await verifier.verifyN8nHealth();
      return fingerprint;
    } catch (error) {
      if (attempt === 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
  throw new Error("VPS не восстановился после reboot.");
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
  const createIdempotencyKey = `t0057-create-${randomUUID()}`;
  const deleteIdempotencyKey = `t0057-delete-${randomUUID()}`;
  const cleanupIdempotencyKey = `t0057-cleanup-${randomUUID()}`;

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
    const mutationAdapter = createProductionTimewebMutationAdapter();
    if (!mutationAdapter) {
      throw new Error("Production mutation adapter не открылся.");
    }
    const verifier = new ExternalEnvironmentVerifier();
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
    const dnsBefore = await mutationAdapter.listDnsConflictingHostnames({
      environmentId: "00000000-0000-4000-8000-000000000057",
      zone: COURSE_DNS_ZONE,
      hostname: COURSE_HOSTNAME,
    });
    if (dnsBefore.includes(COURSE_HOSTNAME)) {
      throw new Error("DNS baseline содержит approved hostname.");
    }

    const preview = await getTimewebProvisioningPreview();
    if (!preview.ok || preview.mode !== "timeweb") {
      throw new Error(
        preview.ok
          ? "Preview не закреплён за Timeweb."
          : `${preview.code}: ${preview.message}`,
      );
    }
    progress(
      `preflight PASS: ${preview.plan.monthlyTotalRoubles} ₽/месяц, ` +
        `${preview.plan.operatingSystemLabel}, ${preview.plan.region}.`,
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
    const email = `t0057-${randomUUID()}@localhost.invalid`;
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
    environmentId = await operationEnvironmentId(
      sql,
      createOperationId,
    );
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
      providerPlan: preview.plan,
    });
    if (
      duplicate.created ||
      duplicate.accepted.operationId !== create.accepted.operationId
    ) {
      throw new Error("Idempotency replay вернул другую create operation.");
    }

    await waitForProviderCounts(
      readAdapter,
      {
        servers: before.servers.length + 1,
        ips: before.floatingIps.length + 1,
      },
      "after create",
    );
    const readyState = await sql<
      {
        server_id: string;
        public_ip: string;
        dns_record_id: string;
        domain_status: string;
        software_status: string;
        health_status: string;
        profile_version: string;
        software_version: string;
      }[]
    >`
      SELECT
        server.provider_resource_id AS server_id,
        public_ip.public_metadata->>'address' AS public_ip,
        dns.provider_resource_id AS dns_record_id,
        domain_allocations.status AS domain_status,
        software_installations.status AS software_status,
        software_installations.health_status,
        software_installations.profile_version,
        software_installations.software_version
      FROM environments
      JOIN provider_resources AS server
        ON server.environment_id = environments.id
        AND server.resource_kind = 'server'
        AND server.lifecycle_status = 'active'
      JOIN provider_resources AS public_ip
        ON public_ip.environment_id = environments.id
        AND public_ip.resource_kind = 'public_ip'
        AND public_ip.lifecycle_status = 'active'
      JOIN provider_resources AS dns
        ON dns.environment_id = environments.id
        AND dns.resource_kind = 'dns_record'
        AND dns.lifecycle_status = 'active'
      JOIN domain_allocations
        ON domain_allocations.environment_id = environments.id
      JOIN software_installations
        ON software_installations.environment_id = environments.id
      WHERE environments.id = ${environmentId}
    `;
    const ready = readyState[0];
    if (
      !ready ||
      ready.domain_status !== "record_created" ||
      ready.software_status !== "ready_owner_setup_required" ||
      ready.health_status !== "healthy" ||
      ready.profile_version !== STARTER_KIT_BOOTSTRAP_PROFILE.version ||
      ready.software_version !== STARTER_KIT_BOOTSTRAP_PROFILE.n8nVersion
    ) {
      throw new Error("Durable ready_owner_setup_required state не подтверждён.");
    }
    const dnsAfterCreate = await mutationAdapter.listDnsRecords({
      environmentId,
      zone: COURSE_DNS_ZONE,
      hostname: COURSE_HOSTNAME,
    });
    const ownedDns = dnsAfterCreate.filter(
      (record) => record.hostname === COURSE_HOSTNAME,
    );
    if (
      ownedDns.length !== 1 ||
      ownedDns[0]?.externalId !== ready.dns_record_id ||
      ownedDns[0]?.value !== ready.public_ip
    ) {
      throw new Error("DNS ownership после create не подтверждён.");
    }
    await verifier.verifyDns(ready.public_ip);
    const fingerprintBefore =
      await verifier.verifyTlsAndPorts(ready.public_ip);
    await verifier.verifyN8nHealth();
    progress(
      "create/reconcile PASS: n8n, PostgreSQL, Caddy, DNS/TLS и owner gate подтверждены.",
    );

    await mutationAdapter.rebootServer({
      externalId: ready.server_id,
      kind: "server",
      environmentId,
    });
    const fingerprintAfter = await waitForRebootRecovery(
      readAdapter,
      verifier,
      ready.server_id,
      ready.public_ip,
    );
    if (fingerprintAfter !== fingerprintBefore) {
      throw new Error("TLS certificate изменился после reboot.");
    }
    progress("reboot PASS: HTTPS и Caddy certificate data сохранены.");

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
      5,
      5_000,
      ensureFreshReauth,
    );
    if (deleteResult.status !== "deleted") {
      throw new Error(`Delete завершился состоянием ${deleteResult.status}.`);
    }
    deletionCompleted = true;

    const afterDelete = await waitForProviderCounts(
      readAdapter,
      {
        servers: before.servers.length,
        ips: before.floatingIps.length,
      },
      "after delete",
    );
    const databaseState = await sql<
      {
        status: string;
        active_resources: number;
        domain_status: string;
      }[]
    >`
      SELECT
        environments.status,
        count(provider_resources.id) FILTER (
          WHERE provider_resources.lifecycle_status <> 'deleted'
        )::int AS active_resources,
        max(domain_allocations.status) AS domain_status
      FROM environments
      LEFT JOIN provider_resources
        ON provider_resources.environment_id = environments.id
      LEFT JOIN domain_allocations
        ON domain_allocations.environment_id = environments.id
      WHERE environments.id = ${environmentId}
      GROUP BY environments.id
    `;
    const dnsAfterDelete = await mutationAdapter.listDnsRecords({
      environmentId,
      zone: COURSE_DNS_ZONE,
      hostname: COURSE_HOSTNAME,
    });
    if (
      afterDelete.servers.length !== before.servers.length ||
      afterDelete.floatingIps.length !== before.floatingIps.length ||
      databaseState[0]?.status !== "deleted" ||
      databaseState[0]?.active_resources !== 0 ||
      databaseState[0]?.domain_status !== "released" ||
      dnsAfterDelete.some((record) => record.hostname === COURSE_HOSTNAME)
    ) {
      throw new Error("Финальная проверка обнаружила остаточный ресурс.");
    }

    console.log(
      JSON.stringify({
        status: "PASS",
        createOperationId: create.accepted.operationId,
        deleteOperationId: deletion.accepted.operationId,
        environmentStatus: databaseState[0].status,
        activeOwnedResources: databaseState[0].active_resources,
        providerServersBefore: before.servers.length,
        providerServersAfter: afterDelete.servers.length,
        providerIpsBefore: before.floatingIps.length,
        providerIpsAfter: afterDelete.floatingIps.length,
        dnsRecordAfterDelete: false,
        ownerSetupRequired: true,
        servicePortsPrivate: true,
        caddyDataSurvivedReboot: true,
      }),
    );
  } finally {
    if (
      environmentId &&
      actor?.ok &&
      !deletionCompleted
    ) {
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
            5,
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
          "[T-0057] AUTOMATIC CLEANUP FAILED — database сохранена для recovery.",
        );
        process.exitCode = 1;
      }
    }
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка.";
  console.error(`[T-0057] FAIL: ${message}`);
  process.exitCode = 1;
});
