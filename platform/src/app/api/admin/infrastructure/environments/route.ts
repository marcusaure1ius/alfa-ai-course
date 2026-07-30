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
import { getTimewebProvisioningPreview } from "@/server/providers/timeweb/provisioning";
import { readTimewebMutationRuntimeGate } from "@/server/providers/timeweb";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;
  const rows = await getDatabase()<
    {
      id: string;
      name: string;
      status: string;
      updated_at: Date;
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
      "idempotencyKey",
      "simulation",
      "deployment",
    ]) ||
    typeof body.name !== "string" ||
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
    const mutationGate = readTimewebMutationRuntimeGate();
    const preview =
      mutationGate.mode === "timeweb"
        ? await getTimewebProvisioningPreview(process.env, fetch, {
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
      process.env.PLATFORM_PROVIDER === "timeweb" &&
      mutationGate.mode !== "timeweb"
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
