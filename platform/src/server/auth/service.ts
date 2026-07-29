import "server-only";

import { randomUUID } from "node:crypto";

import type { DatabaseSql } from "../db/client";
import { SESSION_TTL_SECONDS } from "./config";
import {
  createOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  normalizeEmail,
  privacyHash,
  verifyPassword,
} from "./crypto";
import { hasPermission, requiresProductionMfa, type Role } from "./rbac";

const LOGIN_WINDOW_MINUTES = 15;
const LOGIN_MAX_ATTEMPTS = 5;
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$CTeWdzATIlOu85svqxFVug$NzFtpHfpbKDzFgky/jnO25Ic0p29aiuUGR089BkOK+A";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role_id: Role;
  status: "active" | "blocked";
  has_verified_factor: boolean;
};

export type AuthSession = {
  sessionId: string;
  userId: string;
  email: string;
  role: Role;
  expiresAt: Date;
  reauthenticatedAt: Date;
};

export type LoginResult =
  | { ok: true; token: string; session: AuthSession }
  | { ok: false; reason: "invalid_credentials" | "rate_limited" | "mfa_required" };

type RequestContext = {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
};

async function appendAudit(
  sql: DatabaseSql,
  event: {
    actorUserId?: string;
    action: string;
    subjectType: string;
    subjectId?: string;
    outcome: "success" | "denied" | "failure";
    requestId?: string;
    ipHash?: string;
    metadata?: Record<string, string | number | boolean>;
  },
): Promise<void> {
  await sql`
    INSERT INTO audit_events (
      id, actor_user_id, action, subject_type, subject_id, outcome, request_id, ip_hash, metadata
    )
    VALUES (
      ${randomUUID()},
      ${event.actorUserId ?? null},
      ${event.action},
      ${event.subjectType},
      ${event.subjectId ?? null},
      ${event.outcome},
      ${event.requestId ?? null},
      ${event.ipHash ?? null},
      ${sql.json(event.metadata ?? {})}
    )
  `;
}

async function consumeLoginAttempt(
  sql: DatabaseSql,
  email: string,
  ipAddress: string,
): Promise<{ limited: boolean; bucketKey: string; ipHash: string }> {
  const ipHash = privacyHash(ipAddress);
  const bucketKey = privacyHash(`login:${email}:${ipHash}`);
  const rows = await sql<{ attempt_count: number; blocked_until: Date | null }[]>`
    INSERT INTO auth_rate_limits (
      bucket_key, action, window_started_at, attempt_count, blocked_until
    )
    VALUES (${bucketKey}, 'login', now(), 1, null)
    ON CONFLICT (bucket_key) DO UPDATE SET
      window_started_at = CASE
        WHEN auth_rate_limits.window_started_at <= now() - (${LOGIN_WINDOW_MINUTES} * interval '1 minute')
          OR auth_rate_limits.blocked_until <= now()
        THEN now()
        ELSE auth_rate_limits.window_started_at
      END,
      attempt_count = CASE
        WHEN auth_rate_limits.window_started_at <= now() - (${LOGIN_WINDOW_MINUTES} * interval '1 minute')
          OR auth_rate_limits.blocked_until <= now()
        THEN 1
        ELSE auth_rate_limits.attempt_count + 1
      END,
      blocked_until = CASE
        WHEN auth_rate_limits.window_started_at > now() - (${LOGIN_WINDOW_MINUTES} * interval '1 minute')
          AND auth_rate_limits.attempt_count + 1 > ${LOGIN_MAX_ATTEMPTS}
        THEN now() + (${LOGIN_WINDOW_MINUTES} * interval '1 minute')
        ELSE null
      END,
      updated_at = now()
    RETURNING attempt_count, blocked_until
  `;
  const row = rows[0];
  return {
    limited: Boolean(row?.blocked_until && row.blocked_until.getTime() > Date.now()),
    bucketKey,
    ipHash,
  };
}

async function resetLoginAttempts(sql: DatabaseSql, bucketKey: string): Promise<void> {
  await sql`DELETE FROM auth_rate_limits WHERE bucket_key = ${bucketKey}`;
}

async function findUserByEmail(sql: DatabaseSql, email: string): Promise<UserRow | null> {
  const rows = await sql<UserRow[]>`
    SELECT
      users.id,
      users.email,
      users.password_hash,
      users.role_id,
      users.status,
      EXISTS (
        SELECT 1
        FROM auth_factors
        WHERE auth_factors.user_id = users.id
          AND auth_factors.verified_at IS NOT NULL
          AND auth_factors.disabled_at IS NULL
      ) AS has_verified_factor
    FROM users
    WHERE users.email = ${email}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function loginWithPassword(
  sql: DatabaseSql,
  input: { email: string; password: string },
  context: RequestContext = {},
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  const attempt = await consumeLoginAttempt(sql, email, context.ipAddress ?? "unknown");

  if (attempt.limited) {
    await appendAudit(sql, {
      action: "auth.login.rate_limited",
      subjectType: "user",
      outcome: "denied",
      requestId: context.requestId,
      ipHash: attempt.ipHash,
      metadata: { emailHash: privacyHash(email) },
    });
    return { ok: false, reason: "rate_limited" };
  }

  const user = await findUserByEmail(sql, email);
  const passwordMatches = await verifyPassword(
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
    input.password,
  );

  if (!user || user.status !== "active" || !passwordMatches) {
    await appendAudit(sql, {
      action: "auth.login.failed",
      subjectType: "user",
      subjectId: user?.id,
      outcome: "denied",
      requestId: context.requestId,
      ipHash: attempt.ipHash,
      metadata: { reason: user?.status === "blocked" ? "blocked" : "invalid" },
    });
    return { ok: false, reason: "invalid_credentials" };
  }

  if (requiresProductionMfa(user.role_id, process.env.VERCEL_ENV, user.has_verified_factor)) {
    await appendAudit(sql, {
      actorUserId: user.id,
      action: "auth.login.mfa_required",
      subjectType: "user",
      subjectId: user.id,
      outcome: "denied",
      requestId: context.requestId,
      ipHash: attempt.ipHash,
    });
    return { ok: false, reason: "mfa_required" };
  }

  const token = createOpaqueToken();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const userAgentHash = context.userAgent ? privacyHash(context.userAgent) : null;

  await sql`
    INSERT INTO auth_sessions (
      id, user_id, token_hash, ip_hash, user_agent_hash, expires_at
    )
    VALUES (
      ${sessionId},
      ${user.id},
      ${hashOpaqueToken(token)},
      ${attempt.ipHash},
      ${userAgentHash},
      ${expiresAt}
    )
  `;
  await resetLoginAttempts(sql, attempt.bucketKey);
  await appendAudit(sql, {
    actorUserId: user.id,
    action: "auth.login.succeeded",
    subjectType: "auth_session",
    subjectId: sessionId,
    outcome: "success",
    requestId: context.requestId,
    ipHash: attempt.ipHash,
  });

  return {
    ok: true,
    token,
    session: {
      sessionId,
      userId: user.id,
      email: user.email,
      role: user.role_id,
      expiresAt,
      reauthenticatedAt: new Date(),
    },
  };
}

export async function getSessionByToken(
  sql: DatabaseSql,
  token: string | null,
): Promise<AuthSession | null> {
  if (!token || token.length < 32) {
    return null;
  }
  const rows = await sql<
    {
      session_id: string;
      user_id: string;
      email: string;
      role_id: Role;
      expires_at: Date;
      reauthenticated_at: Date;
    }[]
  >`
    SELECT
      auth_sessions.id AS session_id,
      users.id AS user_id,
      users.email,
      users.role_id,
      auth_sessions.expires_at,
      auth_sessions.reauthenticated_at
    FROM auth_sessions
    JOIN users ON users.id = auth_sessions.user_id
    WHERE auth_sessions.token_hash = ${hashOpaqueToken(token)}
      AND auth_sessions.revoked_at IS NULL
      AND auth_sessions.expires_at > now()
      AND users.status = 'active'
    LIMIT 1
  `;
  const row = rows[0];
  return row
    ? {
        sessionId: row.session_id,
        userId: row.user_id,
        email: row.email,
        role: row.role_id,
        expiresAt: row.expires_at,
        reauthenticatedAt: row.reauthenticated_at,
      }
    : null;
}

export async function revokeSessionByToken(
  sql: DatabaseSql,
  token: string | null,
  reason = "logout",
): Promise<boolean> {
  if (!token) {
    return false;
  }
  const rows = await sql<{ id: string; user_id: string }[]>`
    UPDATE auth_sessions
    SET revoked_at = now(), revoke_reason = ${reason}
    WHERE token_hash = ${hashOpaqueToken(token)}
      AND revoked_at IS NULL
    RETURNING id, user_id
  `;
  const session = rows[0];
  if (!session) {
    return false;
  }
  await appendAudit(sql, {
    actorUserId: session.user_id,
    action: "auth.session.revoked",
    subjectType: "auth_session",
    subjectId: session.id,
    outcome: "success",
    metadata: { reason },
  });
  return true;
}

export async function revokeAllUserSessions(
  sql: DatabaseSql,
  session: AuthSession,
): Promise<number> {
  const rows = await sql<{ id: string }[]>`
    UPDATE auth_sessions
    SET revoked_at = now(), revoke_reason = 'user_revoke_all'
    WHERE user_id = ${session.userId}
      AND revoked_at IS NULL
    RETURNING id
  `;
  await appendAudit(sql, {
    actorUserId: session.userId,
    action: "auth.sessions.revoke_all",
    subjectType: "user",
    subjectId: session.userId,
    outcome: "success",
    metadata: { revokedCount: rows.length },
  });
  return rows.length;
}

export async function bootstrapAdmin(
  sql: DatabaseSql,
  input: { email: string; password: string },
): Promise<{ id: string; email: string }> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();

  return sql.begin(async (transaction) => {
    const bootstrapRows = await transaction<{ closed_at: Date | null }[]>`
      SELECT closed_at
      FROM auth_bootstrap_state
      WHERE singleton = true
      FOR UPDATE
    `;
    if (!bootstrapRows[0] || bootstrapRows[0].closed_at) {
      throw new Error("Bootstrap первого администратора уже закрыт.");
    }

    await transaction`
      INSERT INTO users (id, email, password_hash, role_id)
      VALUES (${userId}, ${email}, ${passwordHash}, 'admin')
    `;
    await transaction`
      UPDATE auth_bootstrap_state
      SET closed_at = now(), closed_by_user_id = ${userId}
      WHERE singleton = true
    `;
    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id, outcome, metadata
      )
      VALUES (
        ${randomUUID()},
        ${userId},
        'auth.bootstrap_admin.created',
        'user',
        ${userId},
        'success',
        ${transaction.json({ role: "admin" })}
      )
    `;
    return { id: userId, email };
  });
}

export async function createUser(
  sql: DatabaseSql,
  actor: AuthSession,
  input: { email: string; password: string; role?: Role },
): Promise<string> {
  if (!hasPermission(actor.role, "admin:access")) {
    await appendAudit(sql, {
      actorUserId: actor.userId,
      action: "user.create",
      subjectType: "user",
      outcome: "denied",
    });
    throw new Error("FORBIDDEN");
  }
  const userId = randomUUID();
  await sql`
    INSERT INTO users (id, email, password_hash, role_id)
    VALUES (
      ${userId},
      ${normalizeEmail(input.email)},
      ${await hashPassword(input.password)},
      ${input.role ?? "student"}
    )
  `;
  await appendAudit(sql, {
    actorUserId: actor.userId,
    action: "user.create",
    subjectType: "user",
    subjectId: userId,
    outcome: "success",
    metadata: { role: input.role ?? "student" },
  });
  return userId;
}

export async function changeUserRole(
  sql: DatabaseSql,
  actor: AuthSession,
  targetUserId: string,
  role: Role,
): Promise<void> {
  if (!hasPermission(actor.role, "admin:access")) {
    await appendAudit(sql, {
      actorUserId: actor.userId,
      action: "user.role.change",
      subjectType: "user",
      subjectId: targetUserId,
      outcome: "denied",
    });
    throw new Error("FORBIDDEN");
  }
  await sql`
    UPDATE users
    SET role_id = ${role}, updated_at = now()
    WHERE id = ${targetUserId}
  `;
  await appendAudit(sql, {
    actorUserId: actor.userId,
    action: "user.role.change",
    subjectType: "user",
    subjectId: targetUserId,
    outcome: "success",
    metadata: { role },
  });
}

export async function blockUser(
  sql: DatabaseSql,
  actor: AuthSession,
  targetUserId: string,
): Promise<void> {
  if (!hasPermission(actor.role, "admin:access")) {
    await appendAudit(sql, {
      actorUserId: actor.userId,
      action: "user.block",
      subjectType: "user",
      subjectId: targetUserId,
      outcome: "denied",
    });
    throw new Error("FORBIDDEN");
  }
  await sql.begin(async (transaction) => {
    await transaction`
      UPDATE users
      SET status = 'blocked', blocked_at = now(), updated_at = now()
      WHERE id = ${targetUserId}
    `;
    await transaction`
      UPDATE auth_sessions
      SET revoked_at = now(), revoke_reason = 'user_blocked'
      WHERE user_id = ${targetUserId} AND revoked_at IS NULL
    `;
    await transaction`
      INSERT INTO audit_events (
        id, actor_user_id, action, subject_type, subject_id, outcome, metadata
      )
      VALUES (
        ${randomUUID()},
        ${actor.userId},
        'user.block',
        'user',
        ${targetUserId},
        'success',
        ${transaction.json({ sessionsRevoked: true })}
      )
    `;
  });
}
