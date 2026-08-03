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
  getInstallTarget,
  getOperationTimeline,
  operationEnvironmentId,
  reserveCreateOperation,
  reserveDeleteOperation,
  reserveInstallOperation,
  transitionEnvironment,
} from "../src/server/operations/repository";
import {
  COURSE_DNS_ZONE,
  COURSE_HOSTNAME,
  STARTER_KIT_BOOTSTRAP_PROFILE,
} from "../src/server/providers/timeweb/bootstrap-profile";
import { createExternalEnvironmentVerifier } from "../src/server/providers/timeweb/external-health";
import { getTimewebInstallPreview } from "../src/server/providers/timeweb/installation";
import { createProductionTimewebMutationAdapter } from "../src/server/providers/timeweb/mutation";
import { getTimewebProvisioningPreview } from "../src/server/providers/timeweb/provisioning";
import { TimewebReadOnlyAdapter } from "../src/server/providers/timeweb/read-only";
import { createEnvironmentWorkflow } from "../src/workflows/infrastructure/create";
import { deleteEnvironmentWorkflow } from "../src/workflows/infrastructure/delete";
import { installEnvironmentWorkflow } from "../src/workflows/infrastructure/install";

const CONFIRMATION_FLAG = "--confirm-disposable-smoke";
const EXPECTED_DATABASE_PREFIX = "course_platform_timeweb_smoke";
const environmentName = `t0086-disposable-${randomUUID().slice(0, 8)}`;

function printHelp(): void {
  console.log(`Одноразовый production-shaped Control Plane smoke для T-0086.

Использование:
  npm run smoke:timeweb-n8n-install -- ${CONFIRMATION_FLAG}

Требования:
  - отдельная пустая PostgreSQL database ${EXPECTED_DATABASE_PREFIX}*;
  - VERCEL_ENV=production и PLATFORM_PROVIDER=timeweb;
  - TIMEWEB_API_TOKEN с доступом к существующим project и SSH key;
  - Timeweb account без VPS;
  - свободный hostname ${COURSE_HOSTNAME}.

Smoke создаёт plain VPS и floating IPv4, переустанавливает тот же VPS с n8n,
проверяет DNS/TLS/owner gate/reboot и удаляет только созданные ресурсы.
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
  for (const [key, expected] of Object.entries({
    VERCEL_ENV: "production",
    PLATFORM_PROVIDER: "timeweb",
  })) {
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
    result += alphabet[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

function progress(message: string): void {
  console.log(`[T-0086] ${message}`);
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
      progress(`${label}: безопасный retry ${attempt}/${maxAttempts}: ${error.message}`);
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
  let last: Awaited<ReturnType<TimewebReadOnlyAdapter["discover"]>> | null = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    last = await adapter.discover();
    if (
      last.servers.length === expected.servers &&
      last.floatingIps.length === expected.ips
    ) {
      return last;
    }
    if (attempt < 12) {
      progress(`${label}: catalog retry ${attempt}/12.`);
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  throw new Error(
    `${label}: provider counts ${last?.servers.length ?? -1} VPS / ` +
      `${last?.floatingIps.length ?? -1} IP не совпали с ожидаемыми.`,
  );
}

async function waitForRebootRecovery(
  readAdapter: TimewebReadOnlyAdapter,
  serverId: string,
  publicIpv4: string,
  fingerprintBefore: string,
): Promise<void> {
  const verifier = createExternalEnvironmentVerifier();
  let rebootObserved = false;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const snapshot = await readAdapter.discover();
    const server = snapshot.servers.find((candidate) => candidate.id === serverId);
    if (!server) throw new Error("VPS исчез во время reboot.");
    if (server.status.state !== "supported" || server.status.value !== "on") {
      rebootObserved = true;
    }
    if (attempt > 2) {
      try {
        const fingerprintAfter = await verifier.verifyTlsAndPorts(publicIpv4);
        await verifier.verifyN8nHealth();
        if (fingerprintAfter !== fingerprintBefore) {
          throw new Error("TLS certificate изменился после reboot.");
        }
        if (
          server.status.state === "supported" &&
          server.status.value === "on"
        ) {
          if (!rebootObserved) {
            progress("provider transition был короче read interval; проверен recovery.");
          }
          return;
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("certificate изменился")) {
          throw error;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
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
  let authMaterial: { password: string; totpSecret: string } | null = null;
  let environmentId: string | null = null;
  let createOperationId: string | null = null;
  let installOperationId: string | null = null;
  let deleteOperationId: string | null = null;
  let deletionCompleted = false;
  let providerBaseline: { servers: number; ips: number } | null = null;
  const createIdempotencyKey = `t0086-create-${randomUUID()}`;
  const installIdempotencyKey = `t0086-install-${randomUUID()}`;
  const deleteIdempotencyKey = `t0086-delete-${randomUUID()}`;
  const cleanupIdempotencyKey = `t0086-cleanup-${randomUUID()}`;

  async function ensureFreshReauth(force = false): Promise<void> {
    const currentActor = actor;
    const currentAuthMaterial = authMaterial;
    if (!currentActor?.ok || !currentAuthMaterial) {
      throw new Error("Нельзя обновить re-auth без активной admin session.");
    }
    const ageMs = Date.now() - currentActor.session.reauthenticatedAt.getTime();
    if (!force && ageMs < 8 * 60 * 1_000) return;
    const accepted = await reauthenticateSession(sql, currentActor.session, {
      password: currentAuthMaterial.password,
      mfaCode: createTotpCode(currentAuthMaterial.totpSecret),
    });
    if (!accepted) throw new Error("Не удалось обновить production MFA re-auth.");
    const refreshedSession = await getSessionByToken(sql, currentActor.token);
    if (!refreshedSession?.mfaAuthenticatedAt) {
      throw new Error("Обновлённая production MFA session не найдена.");
    }
    actor = { ok: true, token: currentActor.token, session: refreshedSession };
  }

  try {
    const token = process.env.TIMEWEB_API_TOKEN!;
    const readAdapter = new TimewebReadOnlyAdapter(token);
    const mutationAdapter = createProductionTimewebMutationAdapter();
    if (!mutationAdapter) throw new Error("Timeweb mutation gate закрыт.");
    const before = await readAdapter.discover();
    if (before.account.state !== "ready" || before.degraded) {
      throw new Error("Timeweb read-only catalog не готов к smoke.");
    }
    if (before.servers.length !== 0) {
      throw new Error("Hard limit закрыт: в Timeweb уже существует VPS.");
    }
    const baselineDns = await mutationAdapter.listDnsRecords({
      environmentId: "00000000-0000-4000-8000-000000000000",
      zone: COURSE_DNS_ZONE,
      hostname: COURSE_HOSTNAME,
    });
    if (baselineDns.length !== 0) {
      throw new Error(`${COURSE_HOSTNAME} уже занят; mutation запрещена.`);
    }
    providerBaseline = { servers: before.servers.length, ips: before.floatingIps.length };

    const catalogPreview = await getTimewebProvisioningPreview();
    if (!catalogPreview.ok || catalogPreview.mode !== "timeweb") {
      throw new Error(
        catalogPreview.ok
          ? "Provisioning preview не закреплён за Timeweb."
          : `${catalogPreview.code}: ${catalogPreview.message}`,
      );
    }
    const moscow = catalogPreview.catalog.regions.find((region) => region.id === "ru-3");
    const preset = moscow?.presets[0];
    if (!moscow || !preset) throw new Error("Live catalog не содержит Moscow preset.");
    const createPreview = await getTimewebProvisioningPreview(process.env, fetch, {
      selection: {
        region: moscow.id,
        presetId: preset.id,
        operatingSystemId: catalogPreview.catalog.defaultSelection.operatingSystemId,
        backupsEnabled: false,
        publicIpv4: true,
      },
    });
    if (!createPreview.ok || createPreview.mode !== "timeweb") {
      throw new Error(
        createPreview.ok
          ? "Selected preview не закреплён за Timeweb."
          : `${createPreview.code}: ${createPreview.message}`,
      );
    }
    progress(
      `preflight PASS: ${createPreview.plan.monthlyTotalRoubles} ₽/месяц, ` +
        `${createPreview.plan.operatingSystemLabel}; provider balance ` +
        `${before.balance.amount} ${before.balance.currency}.`,
    );

    await runMigrations(sql);
    const counts = await sql<
      { users: number; environments: number; operations: number; resources: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM environments) AS environments,
        (SELECT count(*)::int FROM operations) AS operations,
        (SELECT count(*)::int FROM provider_resources) AS resources
    `;
    if (
      !counts[0] ||
      counts[0].users !== 0 ||
      counts[0].environments !== 0 ||
      counts[0].operations !== 0 ||
      counts[0].resources !== 0
    ) {
      throw new Error("Smoke database не пуста; mutation запрещена.");
    }

    const password = randomBytes(32).toString("base64url");
    const totpSecret = base32(randomBytes(20));
    authMaterial = { password, totpSecret };
    const factorEncryptionKey = randomBytes(32).toString("base64url");
    const email = `t0086-${randomUUID()}@localhost.invalid`;
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
    await ensureFreshReauth(true);
    if (!actor?.ok) throw new Error("Admin session потеряна перед create.");
    progress("production MFA и fresh re-auth подтверждены.");

    const create = await reserveCreateOperation(sql, actor.session, {
      name: environmentName,
      idempotencyKey: createIdempotencyKey,
      scenario: "success",
      providerPlan: createPreview.plan,
    });
    createOperationId = create.accepted.operationId;
    environmentId = await operationEnvironmentId(sql, createOperationId);
    await ensureFreshReauth(true);
    const createResult = await retryWorkflow(
      "create/reconcile",
      () => createEnvironmentWorkflow({ operationId: createOperationId!, scenario: "success" }),
      25,
      15_000,
      ensureFreshReauth,
    );
    if (createResult.status !== "active") {
      throw new Error(`Create завершился состоянием ${createResult.status}.`);
    }
    const afterCreate = await waitForProviderCounts(
      readAdapter,
      { servers: before.servers.length + 1, ips: before.floatingIps.length + 1 },
      "after create",
    );
    progress("plain-VPS create/reconcile PASS: ровно один новый VPS и IPv4.");

    const target = await getInstallTarget(sql, environmentId);
    if (!target) throw new Error("Owned plain VPS не прошёл install target gate.");
    const installPreview = await getTimewebInstallPreview(process.env, fetch, target);
    if (!installPreview.ok || installPreview.mode !== "timeweb") {
      throw new Error(
        installPreview.ok
          ? "Install preview не закреплён за Timeweb."
          : `${installPreview.code}: ${installPreview.message}`,
      );
    }
    await ensureFreshReauth(true);
    if (!actor?.ok) throw new Error("Admin session потеряна перед install.");
    const installation = await reserveInstallOperation(sql, actor.session, {
      environmentId,
      confirmationName: environmentName,
      confirmedLoss: true,
      idempotencyKey: installIdempotencyKey,
      scenario: "success",
      installPlan: installPreview.plan,
    });
    installOperationId = installation.accepted.operationId;
    const installResult = await retryWorkflow(
      "install/reconcile",
      () => installEnvironmentWorkflow({ operationId: installOperationId!, scenario: "success" }),
      100,
      15_000,
      ensureFreshReauth,
    );
    if (installResult.status !== "ready_owner_setup_required") {
      throw new Error(`Install завершился состоянием ${installResult.status}.`);
    }
    const replay = await reserveInstallOperation(sql, actor.session, {
      environmentId,
      confirmationName: environmentName,
      confirmedLoss: true,
      idempotencyKey: installIdempotencyKey,
      scenario: "success",
      installPlan: { ...installPreview.plan, checkedAt: new Date().toISOString() },
    });
    if (replay.created || replay.accepted.operationId !== installOperationId) {
      throw new Error("Idempotency replay вернул другую install operation.");
    }

    const readyRows = await sql<
      {
        environment_status: string;
        operation_status: string;
        public_url: string | null;
        server_id: string;
        public_ip_id: string;
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
        environments.status AS environment_status,
        operations.status AS operation_status,
        environments.public_url,
        server.provider_resource_id AS server_id,
        public_ip.provider_resource_id AS public_ip_id,
        public_ip.public_metadata->>'address' AS public_ip,
        dns.provider_resource_id AS dns_record_id,
        domain_allocations.status AS domain_status,
        software_installations.status AS software_status,
        software_installations.health_status,
        software_installations.profile_version,
        software_installations.software_version
      FROM environments
      JOIN operations ON operations.id = ${installOperationId}
      JOIN provider_resources AS server
        ON server.environment_id = environments.id
        AND server.resource_kind = 'server' AND server.lifecycle_status = 'active'
      JOIN provider_resources AS public_ip
        ON public_ip.environment_id = environments.id
        AND public_ip.resource_kind = 'public_ip' AND public_ip.lifecycle_status = 'active'
      JOIN provider_resources AS dns
        ON dns.environment_id = environments.id
        AND dns.resource_kind = 'dns_record' AND dns.lifecycle_status = 'active'
      JOIN domain_allocations ON domain_allocations.environment_id = environments.id
      JOIN software_installations
        ON software_installations.environment_id = environments.id
        AND software_installations.profile_name = 'starter-kit'
      WHERE environments.id = ${environmentId}
    `;
    const ready = readyRows[0];
    if (
      !ready ||
      ready.environment_status !== "active" ||
      ready.operation_status !== "succeeded" ||
      ready.public_url !== `https://${COURSE_HOSTNAME}` ||
      ready.domain_status !== "record_created" ||
      ready.software_status !== "ready_owner_setup_required" ||
      ready.health_status !== "healthy" ||
      ready.profile_version !== STARTER_KIT_BOOTSTRAP_PROFILE.version ||
      ready.software_version !== STARTER_KIT_BOOTSTRAP_PROFILE.n8nVersion
    ) {
      throw new Error("Durable ready_owner_setup_required state не подтверждён.");
    }
    if (
      afterCreate.servers.length + 0 !== before.servers.length + 1 ||
      afterCreate.floatingIps.length !== before.floatingIps.length + 1 ||
      target.serverExternalId !== ready.server_id ||
      target.publicIpExternalId !== ready.public_ip_id
    ) {
      throw new Error("Install создал второй VPS/IP или изменил owned target.");
    }
    const timeline = await getOperationTimeline(sql, installOperationId);
    const expectedSteps = [
      "configure_dns",
      "waiting_dns",
      "installing_n8n",
      "provider_installing",
      "bootstrapping",
      "issuing_tls",
      "health_check",
      "complete_install",
    ];
    if (
      timeline?.status !== "succeeded" ||
      expectedSteps.some(
        (key) => !timeline.steps.some((step) => step.key === key && step.status === "succeeded"),
      )
    ) {
      throw new Error("Install timeline не подтвердил все durable шаги.");
    }
    const ownedDns = await mutationAdapter.listDnsRecords({
      environmentId,
      zone: COURSE_DNS_ZONE,
      hostname: COURSE_HOSTNAME,
    });
    if (
      ownedDns.length !== 1 ||
      ownedDns[0]?.externalId !== ready.dns_record_id ||
      ownedDns[0]?.value !== ready.public_ip
    ) {
      throw new Error("DNS ownership после install не подтверждён.");
    }
    const verifier = createExternalEnvironmentVerifier();
    await verifier.verifyDns(ready.public_ip);
    const fingerprint = await verifier.verifyTlsAndPorts(ready.public_ip);
    await verifier.verifyN8nHealth();
    progress("install PASS: DNS, 80/443, закрытые 5432/5678, TLS, health и owner gate.");

    await mutationAdapter.rebootServer({
      externalId: ready.server_id,
      kind: "server",
      environmentId,
    });
    await waitForRebootRecovery(readAdapter, ready.server_id, ready.public_ip, fingerprint);
    progress("reboot PASS: HTTPS, health и TLS certificate data сохранены.");

    await ensureFreshReauth(true);
    if (!actor?.ok) throw new Error("Admin session потеряна перед delete.");
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
      () => deleteEnvironmentWorkflow({ operationId: deleteOperationId!, scenario: "success" }),
      12,
      5_000,
      ensureFreshReauth,
    );
    if (deleteResult.status !== "deleted") {
      throw new Error(`Delete завершился состоянием ${deleteResult.status}.`);
    }
    deletionCompleted = true;

    const afterDelete = await waitForProviderCounts(readAdapter, providerBaseline, "after delete");
    const finalRows = await sql<
      { status: string; active_resources: number; domain_status: string }[]
    >`
      SELECT
        environments.status,
        count(provider_resources.id) FILTER (
          WHERE provider_resources.lifecycle_status <> 'deleted'
        )::int AS active_resources,
        max(domain_allocations.status) AS domain_status
      FROM environments
      LEFT JOIN provider_resources ON provider_resources.environment_id = environments.id
      LEFT JOIN domain_allocations ON domain_allocations.environment_id = environments.id
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
      finalRows[0]?.status !== "deleted" ||
      finalRows[0]?.active_resources !== 0 ||
      finalRows[0]?.domain_status !== "released" ||
      dnsAfterDelete.length !== 0
    ) {
      throw new Error("Финальная проверка обнаружила остаточный ресурс.");
    }

    console.log(
      JSON.stringify({
        status: "PASS",
        createOperationId,
        installOperationId,
        deleteOperationId,
        environmentStatus: finalRows[0].status,
        activeOwnedResources: finalRows[0].active_resources,
        providerServersBefore: before.servers.length,
        providerServersAfter: afterDelete.servers.length,
        providerIpsBefore: before.floatingIps.length,
        providerIpsAfter: afterDelete.floatingIps.length,
        dnsRecordAfterDelete: false,
        sameServerAndIpv4: true,
        exactInstallProfile: true,
        ownerSetupRequired: true,
        servicePortsPrivate: true,
        idempotencyReplay: true,
        rebootRecovery: true,
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
            () => createEnvironmentWorkflow({ operationId: createOperationId!, scenario: "success" }),
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
              message: "Create reconciliation не завершился; требуется guarded cleanup.",
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
        if (installOperationId) {
          const operations = await sql<{ status: string }[]>`
            SELECT status FROM operations WHERE id = ${installOperationId}
          `;
          if (operations[0] && ["queued", "running"].includes(operations[0].status)) {
            await finishOperation(sql, installOperationId, {
              status: "failed",
              code: "RECOVERY_CLEANUP_REQUIRED",
              message: "Install smoke прерван; запускается guarded cleanup.",
            });
          }
        }
        if (rows[0]?.status === "deleting" && deleteOperationId) {
          const resumed = await retryWorkflow(
            "resume existing delete",
            () => deleteEnvironmentWorkflow({ operationId: deleteOperationId!, scenario: "success" }),
            12,
            5_000,
            ensureFreshReauth,
          );
          deletionCompleted = resumed.status === "deleted";
          rows = await sql<{ status: string }[]>`
            SELECT status FROM environments WHERE id = ${environmentId}
          `;
        }
        if (rows[0] && ["active", "degraded", "cleanup_required"].includes(rows[0].status)) {
          await ensureFreshReauth(true);
          if (!actor?.ok) throw new Error("Admin session потеряна перед recovery cleanup.");
          const cleanup = await reserveDeleteOperation(sql, actor.session, {
            environmentId,
            confirmationName: environmentName,
            confirmedLoss: true,
            idempotencyKey: cleanupIdempotencyKey,
            scenario: "success",
          });
          const result = await retryWorkflow(
            "error cleanup",
            () => deleteEnvironmentWorkflow({ operationId: cleanup.accepted.operationId, scenario: "success" }),
            12,
            5_000,
            ensureFreshReauth,
          );
          deletionCompleted = result.status === "deleted";
          progress(`error cleanup: ${result.status}.`);
        }
        if (providerBaseline) {
          await waitForProviderCounts(
            new TimewebReadOnlyAdapter(process.env.TIMEWEB_API_TOKEN!),
            providerBaseline,
            "recovery baseline",
          );
        }
      } catch {
        console.error("[T-0086] AUTOMATIC CLEANUP FAILED — database сохранена для recovery.");
        process.exitCode = 1;
      }
    }
    await sql.end();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка.";
  console.error(`[T-0086] FAIL: ${message}`);
  process.exitCode = 1;
});
