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
    }>
  >`
    SELECT id, name, status, public_url, updated_at
    FROM environments
    WHERE status <> 'deleted'
    ORDER BY created_at
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
    })),
  );
}
