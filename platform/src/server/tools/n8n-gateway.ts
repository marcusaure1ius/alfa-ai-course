import "server-only";

import { randomUUID } from "node:crypto";

import { createOpaqueToken, hashOpaqueToken } from "@/server/auth/crypto";
import type { AuthSession } from "@/server/auth/service";
import type { DatabaseSql } from "@/server/db/client";

export const N8N_GATE_COOKIE = "__Host-neurokurs_gate";
const TICKET_TTL_MS = 60_000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class N8nGatewayError extends Error {
  constructor(
    public readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "NOT_READY"
      | "INVALID_TICKET",
  ) {
    super(code);
  }
}

type GatewayTarget = {
  environmentId: string;
  origin: string;
  assignmentGeneration: string | null;
};

function httpsOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export async function issueN8nGatewayTicket(
  sql: DatabaseSql,
  actor: AuthSession,
  environmentId?: string,
  now = new Date(),
): Promise<{ exchangeUrl: string; ticket: string }> {
  if (
    environmentId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      environmentId,
    )
  ) {
    throw new N8nGatewayError("NOT_FOUND");
  }
  let target: GatewayTarget | null = null;
  if (actor.role === "admin") {
    const rows = await sql<
      Array<{ environment_id: string; public_url: string | null }>
    >`
      SELECT environment.id AS environment_id, environment.public_url
      FROM environments AS environment
      JOIN LATERAL (
        SELECT status, health_status
        FROM software_installations
        WHERE environment_id = environment.id AND profile_name = 'starter-kit'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      ) AS installation ON true
      WHERE environment.tool_type = 'n8n'
        AND environment.status = 'active'
        AND (${environmentId ?? null}::uuid IS NULL OR environment.id = ${environmentId ?? null})
        AND installation.status IN ('ready_owner_setup_required', 'ready')
        AND installation.health_status = 'healthy'
      ORDER BY environment.created_at DESC, environment.id DESC
      LIMIT 1
    `;
    const row = rows[0];
    const origin = httpsOrigin(row?.public_url ?? null);
    if (row && origin) {
      target = {
        environmentId: row.environment_id,
        origin,
        assignmentGeneration: null,
      };
    }
  } else {
    const rows = await sql<
      Array<{
        environment_id: string;
        public_url: string | null;
        gateway_generation: string | null;
      }>
    >`
      SELECT access.environment_id, environment.public_url,
        access.gateway_generation
      FROM tool_access AS access
      JOIN users AS student ON student.id = access.user_id
      JOIN course_memberships AS membership
        ON membership.user_id = student.id AND membership.status = 'active'
      JOIN environments AS environment
        ON environment.id = access.environment_id
        AND environment.tool_type = 'n8n'
        AND environment.status = 'active'
      JOIN LATERAL (
        SELECT status, health_status
        FROM software_installations
        WHERE environment_id = environment.id AND profile_name = 'starter-kit'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      ) AS installation ON true
      LEFT JOIN tool_service_settings AS setting ON setting.tool_type = 'n8n'
      WHERE access.tool_type = 'n8n'
        AND access.user_id = ${actor.userId}
        AND access.status = 'active'
        AND access.expires_at > ${now}
        AND access.n8n_identity_id IS NOT NULL
        AND access.gateway_generation IS NOT NULL
        AND student.status = 'active'
        AND student.role_id = 'student'
        AND coalesce(setting.student_access_enabled, true)
        AND installation.status = 'ready'
        AND installation.health_status = 'healthy'
      ORDER BY access.updated_at DESC, access.environment_id DESC
      LIMIT 1
    `;
    const row = rows[0];
    const origin = httpsOrigin(row?.public_url ?? null);
    if (row && origin && row.gateway_generation) {
      target = {
        environmentId: row.environment_id,
        origin,
        assignmentGeneration: row.gateway_generation,
      };
    }
  }

  if (!target) throw new N8nGatewayError("NOT_READY");
  const token = createOpaqueToken();
  await sql`
    INSERT INTO tool_gateway_tickets (
      id, token_hash, environment_id, subject_user_id, subject_role,
      assignment_generation, expires_at
    )
    VALUES (
      ${randomUUID()}, ${hashOpaqueToken(token)}, ${target.environmentId},
      ${actor.userId}, ${actor.role}, ${target.assignmentGeneration},
      ${new Date(now.getTime() + TICKET_TTL_MS)}
    )
  `;
  return {
    exchangeUrl: `${target.origin}/__neurokurs/exchange`,
    ticket: token,
  };
}

export function createN8nGatewayExchangeResponse(input: {
  exchangeUrl: string;
  ticket: string;
}): Response {
  const nonce = randomUUID();
  const action = input.exchangeUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const ticket = input.ticket.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Безопасный вход</title></head><body><form id="gateway" method="post" action="${action}"><input type="hidden" name="ticket" value="${ticket}"><button type="submit">Продолжить в n8n</button></form><script nonce="${nonce}">document.getElementById("gateway").submit()</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "content-security-policy": `default-src 'none'; base-uri 'none'; form-action ${new URL(input.exchangeUrl).origin}; script-src 'nonce-${nonce}'`,
    },
  });
}

export async function exchangeN8nGatewayTicket(
  sql: DatabaseSql,
  token: string,
  forwardedHost: string,
  now = new Date(),
): Promise<{ cookie: string }> {
  if (!token || token.length > 200) {
    throw new N8nGatewayError("INVALID_TICKET");
  }
  return sql.begin(async (transaction) => {
    const rows = await transaction<
      Array<{
        id: string;
        environment_id: string;
        subject_user_id: string;
        subject_role: "admin" | "student";
        assignment_generation: string | null;
        public_url: string | null;
      }>
    >`
      SELECT ticket.id, ticket.environment_id, ticket.subject_user_id,
        ticket.subject_role, ticket.assignment_generation,
        environment.public_url
      FROM tool_gateway_tickets AS ticket
      JOIN environments AS environment ON environment.id = ticket.environment_id
      WHERE ticket.token_hash = ${hashOpaqueToken(token)}
        AND ticket.consumed_at IS NULL
        AND ticket.expires_at > ${now}
      FOR UPDATE OF ticket
    `;
    const row = rows[0];
    const origin = httpsOrigin(row?.public_url ?? null);
    if (!row || !origin || new URL(origin).host !== forwardedHost) {
      throw new N8nGatewayError("INVALID_TICKET");
    }
    await transaction`
      UPDATE tool_gateway_tickets SET consumed_at = ${now} WHERE id = ${row.id}
    `;
    const sessionToken = createOpaqueToken();
    await transaction`
      INSERT INTO tool_gateway_sessions (
        id, token_hash, environment_id, subject_user_id, subject_role,
        assignment_generation, expires_at
      ) VALUES (
        ${randomUUID()}, ${hashOpaqueToken(sessionToken)}, ${row.environment_id},
        ${row.subject_user_id}, ${row.subject_role},
        ${row.assignment_generation},
        ${new Date(now.getTime() + SESSION_TTL_MS)}
      )
    `;
    return {
      cookie: `${N8N_GATE_COOKIE}=${sessionToken}; Path=/; Max-Age=${SESSION_TTL_MS / 1000}; HttpOnly; Secure; SameSite=Lax`,
    };
  });
}

export async function authorizeN8nGatewayRequest(
  sql: DatabaseSql,
  token: string | null,
  forwardedHost: string,
  now = new Date(),
  studentLicenseGateReady = false,
): Promise<boolean> {
  if (!token || token.length > 200) return false;
  if (!studentLicenseGateReady) {
    await sql`
      UPDATE tool_gateway_sessions
      SET revoked_at = ${now}
      WHERE token_hash = ${hashOpaqueToken(token)}
        AND subject_role = 'student'
        AND revoked_at IS NULL
    `;
  }
  const rows = await sql<Array<{ session_id: string }>>`
    SELECT gateway.id AS session_id
    FROM tool_gateway_sessions AS gateway
    JOIN users AS subject
      ON subject.id = gateway.subject_user_id AND subject.status = 'active'
    JOIN environments AS environment
      ON environment.id = gateway.environment_id
      AND environment.status = 'active'
      AND regexp_replace(environment.public_url, '/+$', '') = ${`https://${forwardedHost}`}
    JOIN LATERAL (
      SELECT status, health_status
      FROM software_installations
      WHERE environment_id = environment.id AND profile_name = 'starter-kit'
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    ) AS installation ON true
    LEFT JOIN tool_access AS access
      ON gateway.subject_role = 'student'
      AND access.tool_type = 'n8n'
      AND access.user_id = gateway.subject_user_id
      AND access.environment_id = gateway.environment_id
      AND access.gateway_generation = gateway.assignment_generation
    LEFT JOIN tool_service_settings AS setting ON setting.tool_type = 'n8n'
    WHERE gateway.token_hash = ${hashOpaqueToken(token)}
      AND gateway.revoked_at IS NULL
      AND gateway.expires_at > ${now}
      AND (
        (
          gateway.subject_role = 'admin'
          AND subject.role_id = 'admin'
          AND installation.status IN ('ready_owner_setup_required', 'ready')
          AND installation.health_status = 'healthy'
        )
        OR
        (
          gateway.subject_role = 'student'
          AND ${studentLicenseGateReady}
          AND gateway.assignment_generation IS NOT NULL
          AND subject.role_id = 'student'
          AND access.status = 'active'
          AND access.expires_at > ${now}
          AND access.n8n_identity_id IS NOT NULL
          AND coalesce(setting.student_access_enabled, true)
          AND installation.status = 'ready'
          AND installation.health_status = 'healthy'
          AND EXISTS (
            SELECT 1 FROM course_memberships
            WHERE user_id = subject.id AND status = 'active'
          )
        )
      )
    LIMIT 1
  `;
  if (!rows[0]) return false;
  await sql`
    UPDATE tool_gateway_sessions SET last_authorized_at = ${now}
    WHERE id = ${rows[0].session_id}
  `;
  return true;
}
