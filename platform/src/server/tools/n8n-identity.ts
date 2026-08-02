import "server-only";

import { normalizeEmail } from "@/server/auth/crypto";

export type N8nMemberIdentity = {
  id: string;
  email: string;
  pending: boolean;
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

export const resolveN8nMemberIdentity: N8nIdentityResolver = async (
  instanceOrigin,
  email,
) => {
  const apiKey = process.env.N8N_MANAGEMENT_API_KEY;
  const managementSecret = process.env.N8N_GATE_MANAGEMENT_SECRET;
  if (!apiKey || !managementSecret || managementSecret.length < 32) {
    throw new N8nIdentityError("CONFIGURATION_MISSING");
  }

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

  if (response.status === 404) {
    throw new N8nIdentityError("IDENTITY_NOT_FOUND");
  }
  if (!response.ok) {
    throw new N8nIdentityError("PROVIDER_UNAVAILABLE");
  }

  const body = (await response.json().catch(() => null)) as N8nUserResponse | null;
  const role = typeof body?.role === "string" ? body.role : "";
  if (
    !body ||
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
  };
};
