import { start } from "@workflow/core/runtime";

import { requireAdmin, requireFreshAdmin } from "@/server/auth/access";
import { verifyCsrfRequest } from "@/server/auth/csrf";
import { getDatabase } from "@/server/db/client";
import {
  fakeScenario,
  hasOnlyInputKeys,
  operationError,
} from "@/server/operations/http";
import {
  attachWorkflowRun,
  operationNeedsWorkflowStart,
  OperationConflictError,
  reserveCreateOperation,
} from "@/server/operations/repository";
import { createEnvironmentWorkflow } from "@/workflows/infrastructure/create";
import { getCloudProvisioningPreview } from "@/server/providers/provisioning";
import { readCloudProviderRuntime } from "@/server/providers/runtime";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const toolType = new URL(request.url).searchParams.get("toolType");
  if (!toolType || !/^[a-z][a-z0-9_-]{1,63}$/.test(toolType)) {
    return operationError(400, "INVALID_TOOL_TYPE", "Проверьте тип сервиса.");
  }
  const rows = await getDatabase()<
    {
      id: string;
      name: string;
      status: string;
      updated_at: Date;
      public_url: string | null;
      installation_status: string | null;
      current_operation: {
        id: string;
        kind: string;
        status: string;
        currentStep: string | null;
        canResume: boolean;
      } | null;
      public_ip: string | null;
      monthly_roubles: number;
      owned_resources: Array<{
        kind: string;
        providerResourceId: string;
        status: string;
        monthlyRoubles: number;
      }>;
    }[]
  >`
    SELECT
      environments.id,
      environments.name,
      environments.status,
      environments.updated_at,
      environments.public_url,
      (
        SELECT software_installations.status
        FROM software_installations
        WHERE software_installations.environment_id = environments.id
          AND software_installations.profile_name = 'starter-kit'
        LIMIT 1
      ) AS installation_status,
      (
        SELECT jsonb_build_object(
          'id', operations.id,
          'kind', operations.kind,
          'status', operations.status,
          'currentStep', (
            SELECT operation_steps.logical_key
            FROM operation_steps
            WHERE operation_steps.operation_id = operations.id
              AND operation_steps.status <> 'succeeded'
            ORDER BY operation_steps.step_order DESC
            LIMIT 1
          ),
          'canResume', COALESCE((
            SELECT
              operations.kind = 'install_environment'
              AND operations.status = 'running'
              AND operation_steps.status = 'failed'
              AND operation_steps.retry_class = 'transient'
              AND operation_steps.execution_token IS NULL
              AND operation_steps.lease_expires_at IS NULL
              AND operation_steps.updated_at < now() - interval '2 minutes'
            FROM operation_steps
            WHERE operation_steps.operation_id = operations.id
              AND operation_steps.status <> 'succeeded'
            ORDER BY operation_steps.step_order DESC
            LIMIT 1
          ), false)
        )
        FROM operations
        WHERE operations.environment_id = environments.id
          AND operations.status IN ('queued', 'running')
        ORDER BY operations.created_at DESC
        LIMIT 1
      ) AS current_operation,
      (
        SELECT provider_resources.public_metadata->>'address'
        FROM provider_resources
        WHERE provider_resources.environment_id = environments.id
          AND provider_resources.resource_kind = 'public_ip'
          AND provider_resources.lifecycle_status <> 'deleted'
        ORDER BY provider_resources.created_at DESC
        LIMIT 1
      ) AS public_ip,
      COALESCE((
        SELECT sum(
          CASE
            WHEN jsonb_typeof(provider_resources.public_metadata->'monthlyRoubles') = 'number'
            THEN (provider_resources.public_metadata->>'monthlyRoubles')::numeric
            ELSE 0
          END
        )
        FROM provider_resources
        WHERE provider_resources.environment_id = environments.id
          AND provider_resources.lifecycle_status <> 'deleted'
      ), 0)::float8 AS monthly_roubles,
      COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'kind', provider_resources.resource_kind,
            'providerResourceId', provider_resources.provider_resource_id,
            'status', provider_resources.lifecycle_status,
            'monthlyRoubles',
              CASE
                WHEN jsonb_typeof(provider_resources.public_metadata->'monthlyRoubles') = 'number'
                THEN (provider_resources.public_metadata->>'monthlyRoubles')::numeric
                ELSE 0
              END
          )
          ORDER BY provider_resources.resource_kind
        )
        FROM provider_resources
        WHERE provider_resources.environment_id = environments.id
          AND provider_resources.ownership = 'platform'
          AND provider_resources.lifecycle_status <> 'deleted'
      ), '[]'::jsonb) AS owned_resources
    FROM environments
    WHERE environments.tool_type = ${toolType}
    ORDER BY environments.created_at DESC
  `;
  return Response.json(
    {
      version: "infrastructure-v1",
      environments: rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        updatedAt: row.updated_at.toISOString(),
        publicUrl: row.status === "deleted" ? null : row.public_url,
        installationStatus:
          row.status === "deleted" ? "deleted" : row.installation_status,
        currentOperation: row.current_operation,
        publicIp: row.public_ip,
        monthlyRoubles: row.monthly_roubles,
        ownedResources: row.owned_resources,
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyCsrfRequest(request)) return operationError(403, "CSRF", "Запрос отклонён.");
  const access = await requireFreshAdmin(request);
  if (!access.ok) return access.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const deployment =
    body?.deployment &&
    typeof body.deployment === "object" &&
    !Array.isArray(body.deployment)
      ? (body.deployment as Record<string, unknown>)
      : null;
  if (
    !body ||
    !hasOnlyInputKeys(body, [
      "name",
      "toolType",
      "idempotencyKey",
      "simulation",
      "deployment",
    ]) ||
    typeof body.name !== "string" ||
    body.toolType !== "n8n" ||
    body.name.trim().length < 2 ||
    body.name.length > 80 ||
    typeof body.idempotencyKey !== "string" ||
    body.idempotencyKey.length < 16 ||
    body.idempotencyKey.length > 128 ||
    !deployment ||
    !hasOnlyInputKeys(deployment, [
      "region",
      "presetId",
      "operatingSystemId",
      "backupsEnabled",
      "publicIpv4",
    ]) ||
    typeof deployment.region !== "string" ||
    !Number.isSafeInteger(deployment.presetId) ||
    !Number.isSafeInteger(deployment.operatingSystemId) ||
    typeof deployment.backupsEnabled !== "boolean" ||
    deployment.publicIpv4 !== true
  ) {
    return operationError(
      400,
      "INVALID_INPUT",
      "Проверьте имя и выбранную конфигурацию.",
    );
  }
  const scenario = fakeScenario(body.simulation);
  try {
    const providerRuntime = readCloudProviderRuntime();
    const preview =
      providerRuntime.mode === "provider"
        ? await getCloudProvisioningPreview(process.env, fetch, {
            selection: {
              region: deployment.region,
              presetId: deployment.presetId as number,
              operatingSystemId: deployment.operatingSystemId as number,
              backupsEnabled: deployment.backupsEnabled,
              publicIpv4: true,
            },
          })
        : null;
    if (preview && !preview.ok) {
      return operationError(409, preview.code, preview.message);
    }
    if (
      process.env.VERCEL_ENV === "production" &&
      process.env.PLATFORM_PROVIDER !== "fake" &&
      providerRuntime.mode !== "provider"
    ) {
      return operationError(
        409,
        "MUTATION_GATE_CLOSED",
        "Создание серверов временно недоступно.",
      );
    }
    const reserved = await reserveCreateOperation(getDatabase(), access.session, {
      name: body.name.trim(),
      idempotencyKey: body.idempotencyKey,
      scenario,
      ...(preview?.ok ? { providerPlan: preview.plan } : {}),
    });
    if (
      reserved.created ||
      (await operationNeedsWorkflowStart(getDatabase(), reserved.accepted.operationId))
    ) {
      const run = await start(createEnvironmentWorkflow, [
        { operationId: reserved.accepted.operationId, scenario },
      ]);
      await attachWorkflowRun(getDatabase(), reserved.accepted.operationId, run.runId);
    }
    return Response.json(reserved.accepted, {
      status: 202,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof OperationConflictError) {
      return operationError(409, error.code, "Активная среда или операция уже существует.");
    }
    throw error;
  }
}
