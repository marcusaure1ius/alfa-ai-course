import "server-only";

import { randomUUID } from "node:crypto";

import { getToolDefinition } from "@/lib/tool-catalog";
import type { AuthSession } from "@/server/auth/service";
import type { DatabaseSql } from "@/server/db/client";

export class ToolServiceAccessError extends Error {
  constructor(public readonly code: "FORBIDDEN" | "NOT_FOUND") {
    super(code);
  }
}

export type ToolServiceAccessResult = {
  toolType: string;
  enabled: boolean;
  changed: boolean;
  affectedAssignments: number;
};

export async function setToolServiceAccess(
  sql: DatabaseSql,
  actor: AuthSession,
  input: { toolType: string; enabled: boolean },
  context: { requestId?: string } = {},
): Promise<ToolServiceAccessResult> {
  if (actor.role !== "admin") throw new ToolServiceAccessError("FORBIDDEN");
  const definition = getToolDefinition(input.toolType);
  if (!definition?.capabilities.studentAccess) {
    throw new ToolServiceAccessError("NOT_FOUND");
  }

  return sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO tool_service_settings (tool_type, student_access_enabled)
      VALUES (${input.toolType}, true)
      ON CONFLICT (tool_type) DO NOTHING
    `;
    const settings = await transaction<Array<{ student_access_enabled: boolean }>>`
      SELECT student_access_enabled
      FROM tool_service_settings
      WHERE tool_type = ${input.toolType}
      FOR UPDATE
    `;
    const assignments = await transaction<Array<{ count: number }>>`
      SELECT count(*)::int AS count
      FROM tool_access
      WHERE tool_type = ${input.toolType}
        AND status = 'active'
        AND expires_at > now()
    `;
    const previous = settings[0]?.student_access_enabled ?? true;
    const changed = previous !== input.enabled;
    if (changed) {
      await transaction`
        UPDATE tool_service_settings
        SET student_access_enabled = ${input.enabled},
          updated_by_user_id = ${actor.userId}, updated_at = now()
        WHERE tool_type = ${input.toolType}
      `;
    }
    const affectedAssignments = assignments[0]?.count ?? 0;
    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id,
        outcome, request_id, metadata
      )
      VALUES (
        ${randomUUID()}, ${actor.userId},
        ${input.enabled ? "tool.student_access.enabled" : "tool.student_access.disabled"},
        'tool_service', ${input.toolType}, 'success',
        ${context.requestId ?? null},
        ${transaction.json({
          previousEnabled: previous,
          enabled: input.enabled,
          changed,
          affectedAssignments,
        })}
      )
    `;
    return {
      toolType: input.toolType,
      enabled: input.enabled,
      changed,
      affectedAssignments,
    };
  });
}
