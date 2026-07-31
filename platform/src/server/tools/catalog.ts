import "server-only";

import {
  composeToolCatalog,
  toolDefinitions,
  type ToolCatalogItem,
} from "@/lib/tool-catalog";
import type { DatabaseSql } from "@/server/db/client";

export async function getToolCatalog(sql: DatabaseSql): Promise<ToolCatalogItem[]> {
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      status: string;
      public_url: string | null;
      updated_at: Date;
      access_count: number;
    }>
  >`
    SELECT
      environment.id, environment.name, environment.status,
      environment.public_url, environment.updated_at,
      (
        SELECT count(*)::int
        FROM tool_access AS access
        WHERE access.environment_id = environment.id
          AND access.status = 'active'
      ) AS access_count
    FROM environments AS environment
    WHERE environment.status <> 'deleted'
    ORDER BY environment.created_at
  `;
  return composeToolCatalog(
    toolDefinitions,
    rows.map((row) => ({
      id: row.id,
      toolType: "n8n",
      name: row.name,
      status: row.status,
      publicUrl: row.public_url,
      updatedAt: row.updated_at.toISOString(),
      accessCount: row.access_count,
    })),
  );
}

export type ToolEnvironmentDetail = {
  id: string;
  name: string;
  status: string;
  publicUrl: string | null;
  updatedAt: string;
  provider: string | null;
  region: string | null;
  zone: string | null;
  preset: string | null;
  image: string | null;
  resources: Array<{
    kind: string;
    status: string;
    address: string | null;
    monthlyRoubles: number;
  }>;
  operations: Array<{
    id: string;
    kind: string;
    status: string;
    createdAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  }>;
};

export async function getToolEnvironmentDetail(
  sql: DatabaseSql,
  environmentId: string,
): Promise<ToolEnvironmentDetail | null> {
  const rows = await sql<
    Array<{
      id: string;
      name: string;
      status: string;
      public_url: string | null;
      updated_at: Date;
      provider: string | null;
      region_id: string | null;
      zone_id: string | null;
      preset_id: string | null;
      image_id: string | null;
    }>
  >`
    SELECT
      environment.id, environment.name, environment.status,
      environment.public_url, environment.updated_at,
      profile.provider, profile.region_id, profile.zone_id,
      profile.preset_id, profile.image_id
    FROM environments AS environment
    LEFT JOIN infrastructure_profiles AS profile
      ON profile.id = environment.profile_id
    WHERE environment.id = ${environmentId}
      AND environment.status <> 'deleted'
    LIMIT 1
  `;
  const environment = rows[0];
  if (!environment) return null;
  const [resources, operations] = await Promise.all([
    sql<
      Array<{
        resource_kind: string;
        lifecycle_status: string;
        address: string | null;
        monthly_roubles: number;
      }>
    >`
      SELECT
        resource_kind, lifecycle_status,
        public_metadata->>'address' AS address,
        CASE
          WHEN jsonb_typeof(public_metadata->'monthlyRoubles') = 'number'
          THEN (public_metadata->>'monthlyRoubles')::float8
          ELSE 0
        END AS monthly_roubles
      FROM provider_resources
      WHERE environment_id = ${environmentId}
        AND lifecycle_status <> 'deleted'
      ORDER BY resource_kind
    `,
    sql<
      Array<{
        id: string;
        kind: string;
        status: string;
        created_at: Date;
        error_code: string | null;
        error_message_redacted: string | null;
      }>
    >`
      SELECT id, kind, status, created_at, error_code, error_message_redacted
      FROM operations
      WHERE environment_id = ${environmentId}
      ORDER BY created_at DESC
      LIMIT 8
    `,
  ]);
  return {
    id: environment.id,
    name: environment.name,
    status: environment.status,
    publicUrl: environment.public_url,
    updatedAt: environment.updated_at.toISOString(),
    provider: environment.provider,
    region: environment.region_id,
    zone: environment.zone_id,
    preset: environment.preset_id,
    image: environment.image_id,
    resources: resources.map((resource) => ({
      kind: resource.resource_kind,
      status: resource.lifecycle_status,
      address: resource.address,
      monthlyRoubles: resource.monthly_roubles,
    })),
    operations: operations.map((operation) => ({
      id: operation.id,
      kind: operation.kind,
      status: operation.status,
      createdAt: operation.created_at.toISOString(),
      errorCode: operation.error_code,
      errorMessage: operation.error_message_redacted,
    })),
  };
}
