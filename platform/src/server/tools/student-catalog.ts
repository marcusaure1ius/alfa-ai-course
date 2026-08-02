import "server-only";

import { composeStudentToolCatalog } from "@/lib/student-tool-catalog";
import { toolDefinitions } from "@/lib/tool-catalog";
import type { DatabaseSql } from "@/server/db/client";
import { getStudentN8nAccess } from "@/server/tools/student-access";

export async function getStudentToolCatalog(
  sql: DatabaseSql,
  studentUserId: string,
) {
  const n8nAccess = await getStudentN8nAccess(sql, studentUserId);
  return composeStudentToolCatalog(toolDefinitions, [
    {
      toolType: n8nAccess.tool,
      state: n8nAccess.state,
      launchUrl: n8nAccess.launchUrl,
      expiresAt: n8nAccess.expiresAt,
    },
  ]);
}
