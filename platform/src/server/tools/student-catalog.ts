import "server-only";

import {
  composeStudentToolCatalog,
  type StudentToolEntitlement,
} from "@/lib/student-tool-catalog";
import { toolDefinitions } from "@/lib/tool-catalog";
import type { DatabaseSql } from "@/server/db/client";
import { getStudentN8nAccess } from "@/server/tools/student-access";
import type { StudentN8nAccess } from "@/server/tools/student-access";

export function toStudentToolEntitlement(
  access: StudentN8nAccess,
): StudentToolEntitlement {
  const state: StudentToolEntitlement["state"] =
    access.state === "ready"
      ? "available"
      : access.state === "owner_setup_required" || access.state === "preparing"
        ? "preparing"
        : access.state === "license_blocked" || access.state === "attention"
          ? "attention"
          : access.state;
  return {
    toolType: access.tool,
    state,
    expiresAt: access.expiresAt,
  };
}

export async function getStudentToolCatalog(
  sql: DatabaseSql,
  studentUserId: string,
) {
  const n8nAccess = await getStudentN8nAccess(sql, studentUserId);
  return composeStudentToolCatalog(toolDefinitions, [
    toStudentToolEntitlement(n8nAccess),
  ]);
}
