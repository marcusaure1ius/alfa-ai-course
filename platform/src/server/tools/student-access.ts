import "server-only";

import { randomUUID } from "node:crypto";

import type { AuthSession } from "@/server/auth/service";
import type {
  DatabaseSql,
  DatabaseTransactionSql,
} from "@/server/db/client";

export type N8nLicenseEvidenceMode =
  | "written_permission"
  | "commercial_agreement"
  | "product_owner_risk_acceptance";

export type N8nStudentAccessLicenseGate =
  | {
      ready: true;
      mode: N8nLicenseEvidenceMode;
      evidenceReference: string;
    }
  | {
      ready: false;
      reason: string;
    };

type ServerEnvironment = Readonly<Record<string, string | undefined>>;

export function getN8nStudentAccessLicenseGate(
  environment: ServerEnvironment = process.env,
): N8nStudentAccessLicenseGate {
  const mode = environment.N8N_STUDENT_ACCESS_LICENSE_MODE;
  const evidenceReference =
    environment.N8N_STUDENT_ACCESS_LICENSE_EVIDENCE?.trim();
  if (
    mode !== "written_permission" &&
    mode !== "commercial_agreement" &&
    mode !== "product_owner_risk_acceptance"
  ) {
    return {
      ready: false,
      reason:
        "До выдачи доступа зафиксируйте основание production-доступа в server environment.",
    };
  }
  if (
    !evidenceReference ||
    evidenceReference.length < 3 ||
    evidenceReference.length > 500 ||
    /[\u0000-\u001f\u007f]/u.test(evidenceReference)
  ) {
    return {
      ready: false,
      reason:
        "Для решения о production-доступе нужна непустая ссылка или идентификатор evidence.",
    };
  }
  return { ready: true, mode, evidenceReference };
}

export function getN8nAccessDateDefaults(now = new Date()): {
  minimum: string;
  recommended: string;
  maximum: string;
} {
  const date = (days: number) =>
    new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  return { minimum: date(1), recommended: date(30), maximum: date(365) };
}

export type StudentN8nAccessState =
  | "locked"
  | "license_blocked"
  | "preparing"
  | "owner_setup_required"
  | "ready"
  | "attention"
  | "expired";

export type StudentN8nAccess = {
  tool: "n8n";
  displayName: "n8n";
  state: StudentN8nAccessState;
  launchUrl: string | null;
  expiresAt: string | null;
};

type StudentAccessRow = {
  status: "active" | "revoked";
  expires_at: Date;
  environment_status: string;
  public_url: string | null;
  installation_status: string | null;
  health_status: string | null;
};

const lockedAccess: StudentN8nAccess = {
  tool: "n8n",
  displayName: "n8n",
  state: "locked",
  launchUrl: null,
  expiresAt: null,
};

export async function getStudentN8nAccess(
  sql: DatabaseSql,
  studentUserId: string,
  now = new Date(),
  licenseGate = getN8nStudentAccessLicenseGate(),
): Promise<StudentN8nAccess> {
  const rows = await sql<StudentAccessRow[]>`
    SELECT
      access.status, access.expires_at,
      environment.status AS environment_status,
      environment.public_url,
      installation.status AS installation_status,
      installation.health_status
    FROM tool_access AS access
    JOIN environments AS environment ON environment.id = access.environment_id
    LEFT JOIN LATERAL (
      SELECT status, health_status
      FROM software_installations
      WHERE environment_id = environment.id AND profile_name = 'starter-kit'
      ORDER BY updated_at DESC
      LIMIT 1
    ) AS installation ON true
    WHERE access.tool_type = 'n8n' AND access.user_id = ${studentUserId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.status !== "active") return lockedAccess;
  const expiresAt = row.expires_at.toISOString();
  if (row.expires_at.getTime() <= now.getTime()) {
    return { ...lockedAccess, state: "expired", expiresAt };
  }
  if (!licenseGate.ready) {
    return { ...lockedAccess, state: "license_blocked", expiresAt };
  }
  const launchUrl = safeHttpsUrl(row.public_url);
  if (
    row.environment_status === "degraded" ||
    row.environment_status === "deleting" ||
    row.environment_status === "cleanup_required" ||
    row.health_status === "unhealthy"
  ) {
    return { ...lockedAccess, state: "attention", expiresAt };
  }
  if (!launchUrl || row.environment_status !== "active") {
    return { ...lockedAccess, state: "preparing", expiresAt };
  }
  if (row.installation_status === "ready_owner_setup_required") {
    return {
      tool: "n8n",
      displayName: "n8n",
      state: "owner_setup_required",
      launchUrl,
      expiresAt,
    };
  }
  if (
    row.installation_status === "ready" &&
    row.health_status === "healthy"
  ) {
    return {
      tool: "n8n",
      displayName: "n8n",
      state: "ready",
      launchUrl,
      expiresAt,
    };
  }
  return { ...lockedAccess, state: "preparing", expiresAt };
}

function safeHttpsUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === ""
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export type AdminN8nAccess = {
  environmentId: string;
  environmentName: string;
  environmentReady: boolean;
  status: "active" | "revoked" | null;
  expiresAt: string | null;
};

export async function getAdminStudentN8nAccess(
  sql: DatabaseSql,
  studentUserId: string,
): Promise<AdminN8nAccess | null> {
  const rows = await sql<
    Array<{
      environment_id: string;
      environment_name: string;
      environment_status: string;
      installation_status: string | null;
      access_status: "active" | "revoked" | null;
      expires_at: Date | null;
    }>
  >`
    SELECT
      environment.id AS environment_id,
      environment.name AS environment_name,
      environment.status AS environment_status,
      installation.status AS installation_status,
      access.status AS access_status,
      access.expires_at
    FROM environments AS environment
    LEFT JOIN LATERAL (
      SELECT status
      FROM software_installations
      WHERE environment_id = environment.id AND profile_name = 'starter-kit'
      ORDER BY updated_at DESC
      LIMIT 1
    ) AS installation ON true
    LEFT JOIN tool_access AS access
      ON access.environment_id = environment.id
      AND access.tool_type = 'n8n'
      AND access.user_id = ${studentUserId}
    WHERE environment.status <> 'deleted'
    ORDER BY environment.created_at DESC
    LIMIT 1
  `;
  const row = rows[0];
  return row
    ? {
        environmentId: row.environment_id,
        environmentName: row.environment_name,
        environmentReady:
          row.environment_status === "active" &&
          ["ready_owner_setup_required", "ready"].includes(
            row.installation_status ?? "",
          ),
        status: row.access_status,
        expiresAt: row.expires_at?.toISOString() ?? null,
      }
    : null;
}

export class StudentToolAccessError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID_EXPIRY"
      | "LICENSE_GATE"
      | "ENVIRONMENT_NOT_READY",
  ) {
    super(code);
  }
}

export async function setStudentN8nAccess(
  sql: DatabaseSql,
  actor: AuthSession,
  input: {
    studentUserId: string;
    environmentId: string;
    granted: boolean;
    expiresAt: Date | null;
  },
  context: { requestId?: string } = {},
  now = new Date(),
  licenseGate = getN8nStudentAccessLicenseGate(),
): Promise<void> {
  if (actor.role !== "admin") throw new StudentToolAccessError("FORBIDDEN");
  if (!input.granted) {
    await sql.begin(async (transaction) => {
      const rows = await transaction<{ present: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tool_access
          WHERE tool_type = 'n8n'
            AND user_id = ${input.studentUserId}
            AND environment_id = ${input.environmentId}
        ) AS present
      `;
      if (!rows[0]?.present) throw new StudentToolAccessError("NOT_FOUND");
      await transaction`
        UPDATE tool_access
        SET status = 'revoked', revoked_by_user_id = ${actor.userId},
          revoked_at = now(), updated_at = now()
        WHERE tool_type = 'n8n'
          AND user_id = ${input.studentUserId}
          AND environment_id = ${input.environmentId}
      `;
      await appendToolAccessAudit(
        transaction,
        actor,
        input,
        "tool.access.revoked",
        context,
      );
    });
    return;
  }
  if (!licenseGate.ready) throw new StudentToolAccessError("LICENSE_GATE");
  if (
    !input.expiresAt ||
    input.expiresAt.getTime() <= now.getTime() ||
    input.expiresAt.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000
  ) {
    throw new StudentToolAccessError("INVALID_EXPIRY");
  }
  await sql.begin(async (transaction) => {
    const rows = await transaction<{ ready: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM users AS student
        JOIN course_memberships AS membership
          ON membership.user_id = student.id AND membership.status = 'active'
        JOIN environments AS environment
          ON environment.id = ${input.environmentId}
          AND environment.status = 'active'
          AND environment.public_url ~ '^https://'
        JOIN software_installations AS installation
          ON installation.environment_id = environment.id
          AND installation.profile_name = 'starter-kit'
          AND installation.status IN ('ready_owner_setup_required', 'ready')
          AND installation.health_status = 'healthy'
        WHERE student.id = ${input.studentUserId}
          AND student.role_id = 'student'
          AND student.status = 'active'
      ) AS ready
    `;
    if (!rows[0]?.ready) {
      throw new StudentToolAccessError("ENVIRONMENT_NOT_READY");
    }
    await transaction`
      INSERT INTO tool_access (
        tool_type, user_id, environment_id, status, expires_at,
        license_evidence_mode, license_evidence_reference,
        granted_by_user_id, revoked_by_user_id, revoked_at
      )
      VALUES (
        'n8n', ${input.studentUserId}, ${input.environmentId}, 'active',
        ${input.expiresAt}, ${licenseGate.mode}, ${licenseGate.evidenceReference},
        ${actor.userId}, null, null
      )
      ON CONFLICT (tool_type, user_id) DO UPDATE SET
        environment_id = EXCLUDED.environment_id,
        status = 'active',
        expires_at = EXCLUDED.expires_at,
        license_evidence_mode = EXCLUDED.license_evidence_mode,
        license_evidence_reference = EXCLUDED.license_evidence_reference,
        granted_by_user_id = EXCLUDED.granted_by_user_id,
        granted_at = now(), revoked_by_user_id = null, revoked_at = null,
        updated_at = now()
    `;
    await appendToolAccessAudit(
      transaction,
      actor,
      input,
      "tool.access.granted",
      context,
    );
  });
}

async function appendToolAccessAudit(
  sql: DatabaseSql | DatabaseTransactionSql,
  actor: AuthSession,
  input: {
    studentUserId: string;
    environmentId: string;
    expiresAt: Date | null;
  },
  action: "tool.access.granted" | "tool.access.revoked",
  context: { requestId?: string },
): Promise<void> {
  await sql`
    INSERT INTO audit_events (
      id, actor_user_id, action, subject_type, subject_id,
      outcome, request_id, metadata
    )
    VALUES (
      ${randomUUID()}, ${actor.userId}, ${action}, 'tool_access',
      ${`n8n:${input.studentUserId}`}, 'success',
      ${context.requestId ?? null},
      ${sql.json({
        environmentId: input.environmentId,
        expiresAt: input.expiresAt?.toISOString() ?? null,
      })}
    )
  `;
}
