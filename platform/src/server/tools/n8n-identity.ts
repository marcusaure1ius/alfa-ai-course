import "server-only";

import { normalizeEmail } from "@/server/auth/crypto";
import { safeN8nInvitePath } from "@/server/tools/n8n-invite";
import { getN8nGatewayManagementSecret } from "@/server/tools/n8n-managed-secret";

export type N8nMemberIdentity = {
  id: string;
  email: string;
  pending: boolean;
  invitePath: string | null;
};

export type N8nIdentityResolver = (
  instanceOrigin: string,
  email: string,
) => Promise<N8nMemberIdentity>;

export class N8nIdentityError extends Error {
  constructor(
    public readonly code:
      | "CONFIGURATION_MISSING"
      | "IDENTITY_NOT_FOUND"
      | "IDENTITY_NOT_MEMBER"
      | "PROVIDER_UNAVAILABLE",
  ) {
    super(code);
  }
}

type N8nUserResponse = {
  id?: unknown;
  email?: unknown;
  isPending?: unknown;
  role?: unknown;
};

type N8nInviteResponse = Array<{
  user?: N8nUserResponse & {
    inviteAcceptUrl?: unknown;
    emailSent?: unknown;
  };
  error?: unknown;
}>;

function memberIdentity(
  body: N8nUserResponse,
  normalizedEmail: string,
  invitePath: string | null = null,
): N8nMemberIdentity {
  const role = typeof body.role === "string" ? body.role : "";
  if (
    typeof body.id !== "string" ||
    typeof body.email !== "string" ||
    normalizeEmail(body.email) !== normalizedEmail
  ) {
    throw new N8nIdentityError("PROVIDER_UNAVAILABLE");
  }
  if (role !== "global:member" && role !== "member") {
    throw new N8nIdentityError("IDENTITY_NOT_MEMBER");
  }
  return {
    id: body.id,
    email: normalizedEmail,
    pending: body.isPending === true,
    invitePath,
  };
}

export const resolveN8nMemberIdentity: N8nIdentityResolver = async (
  instanceOrigin,
  email,
) => {
  const apiKey = process.env.N8N_MANAGEMENT_API_KEY;
  if (!apiKey) {
    throw new N8nIdentityError("CONFIGURATION_MISSING");
  }
  const managementSecret = getN8nGatewayManagementSecret();

  const normalizedEmail = normalizeEmail(email);
  let response: Response;
  try {
    response = await fetch(
      `${instanceOrigin}/api/v1/users/${encodeURIComponent(normalizedEmail)}?includeRole=true`,
      {
        cache: "no-store",
        headers: {
          "x-n8n-api-key": apiKey,
          "x-neurokurs-management": managementSecret,
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new N8nIdentityError("PROVIDER_UNAVAILABLE");
  }

  if (response.status !== 404 && !response.ok) {
    throw new N8nIdentityError("PROVIDER_UNAVAILABLE");
  }
  if (response.ok) {
    const body = (await response.json().catch(() => null)) as N8nUserResponse | null;
    if (!body) throw new N8nIdentityError("PROVIDER_UNAVAILABLE");
    const existing = memberIdentity(body, normalizedEmail);
    if (!existing.pending) return existing;
  }

  try {
    response = await fetch(`${instanceOrigin}/api/v1/users`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-n8n-api-key": apiKey,
        "x-neurokurs-management": managementSecret,
      },
      body: JSON.stringify([{ email: normalizedEmail, role: "global:member" }]),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new N8nIdentityError("PROVIDER_UNAVAILABLE");
  }
  if (!response.ok) {
    throw new N8nIdentityError(
      response.status === 404 ? "IDENTITY_NOT_FOUND" : "PROVIDER_UNAVAILABLE",
    );
  }
  const invited = (await response.json().catch(() => null)) as N8nInviteResponse | null;
  const result = invited?.[0];
  if (
    !result?.user ||
    (result.error !== undefined && result.error !== null && result.error !== "")
  ) {
    throw new N8nIdentityError("PROVIDER_UNAVAILABLE");
  }
  const invitePath = safeN8nInvitePath(
    typeof result.user.inviteAcceptUrl === "string"
      ? result.user.inviteAcceptUrl
      : undefined,
    instanceOrigin,
  );
  if (result.user.emailSent !== true && !invitePath) {
    throw new N8nIdentityError("PROVIDER_UNAVAILABLE");
  }
  return memberIdentity(
    { ...result.user, isPending: true },
    normalizedEmail,
    invitePath,
  );
};
