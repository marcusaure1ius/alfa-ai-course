import "server-only";

import { randomUUID } from "node:crypto";

import { toolDefinitions, type ToolDefinition } from "@/lib/tool-catalog";
import type { AuthSession } from "@/server/auth/service";
import type { DatabaseSql } from "@/server/db/client";

export class ToolAssignmentError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "TOOL_NOT_FOUND"
      | "STUDENT_NOT_FOUND"
      | "INVALID_ENVIRONMENT"
      | "INVALID_EXPIRY"
      | "LICENSE_EVIDENCE_REQUIRED",
  ) {
    super(code);
  }
}

export async function grantStudentToolAssignment(
  sql: DatabaseSql,
  actor: AuthSession,
  input: {
    toolType: string;
    studentUserId: string;
    environmentId: string | null;
    expiresAt: Date;
    licenseEvidence?: {
      mode: "written_permission" | "commercial_agreement" | "product_owner_risk_acceptance";
      reference: string;
    };
  },
  options: {
    definitions?: readonly ToolDefinition[];
    now?: Date;
    requestId?: string;
  } = {},
): Promise<void> {
  if (actor.role !== "admin") throw new ToolAssignmentError("FORBIDDEN");
  const definition = (options.definitions ?? toolDefinitions).find(
    (candidate) => candidate.id === input.toolType,
  );
  if (!definition?.capabilities.studentAccess) {
    throw new ToolAssignmentError("TOOL_NOT_FOUND");
  }
  const now = options.now ?? new Date();
  if (
    input.expiresAt.getTime() <= now.getTime() ||
    input.expiresAt.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000
  ) {
    throw new ToolAssignmentError("INVALID_EXPIRY");
  }
  if (
    (definition.capabilities.environment === "required" && !input.environmentId) ||
    (definition.capabilities.environment === "none" && input.environmentId)
  ) {
    throw new ToolAssignmentError("INVALID_ENVIRONMENT");
  }
  if (input.toolType === "n8n" && !input.licenseEvidence) {
    throw new ToolAssignmentError("LICENSE_EVIDENCE_REQUIRED");
  }

  await sql.begin(async (transaction) => {
    const students = await transaction<Array<{ present: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM users AS student
        JOIN course_memberships AS membership
          ON membership.user_id = student.id AND membership.status = 'active'
        WHERE student.id = ${input.studentUserId}
          AND student.role_id = 'student'
          AND student.status = 'active'
      ) AS present
    `;
    if (!students[0]?.present) throw new ToolAssignmentError("STUDENT_NOT_FOUND");
    if (input.environmentId) {
      const environments = await transaction<Array<{ present: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM environments
          WHERE id = ${input.environmentId}
            AND tool_type = ${input.toolType}
            AND status = 'active'
        ) AS present
      `;
      if (!environments[0]?.present) {
        throw new ToolAssignmentError("INVALID_ENVIRONMENT");
      }
    }
    await transaction`
      INSERT INTO tool_service_settings (tool_type, student_access_enabled)
      VALUES (${input.toolType}, true)
      ON CONFLICT (tool_type) DO NOTHING
    `;
    await transaction`
      INSERT INTO tool_access (
        tool_type, user_id, environment_id, status, expires_at,
        license_evidence_mode, license_evidence_reference,
        granted_by_user_id, revoked_by_user_id, revoked_at
      )
      VALUES (
        ${input.toolType}, ${input.studentUserId}, ${input.environmentId}, 'active',
        ${input.expiresAt}, ${input.licenseEvidence?.mode ?? null},
        ${input.licenseEvidence?.reference ?? null}, ${actor.userId}, null, null
      )
      ON CONFLICT (tool_type, user_id) DO UPDATE SET
        environment_id = EXCLUDED.environment_id,
        status = 'active', expires_at = EXCLUDED.expires_at,
        license_evidence_mode = EXCLUDED.license_evidence_mode,
        license_evidence_reference = EXCLUDED.license_evidence_reference,
        granted_by_user_id = EXCLUDED.granted_by_user_id,
        granted_at = now(), revoked_by_user_id = null, revoked_at = null,
        updated_at = now()
    `;
    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id,
        outcome, request_id, metadata
      )
      VALUES (
        ${randomUUID()}, ${actor.userId}, 'tool.access.granted', 'tool_access',
        ${`${input.toolType}:${input.studentUserId}`}, 'success',
        ${options.requestId ?? null},
        ${transaction.json({
          toolType: input.toolType,
          environmentId: input.environmentId,
          expiresAt: input.expiresAt.toISOString(),
        })}
      )
    `;
  });
}
