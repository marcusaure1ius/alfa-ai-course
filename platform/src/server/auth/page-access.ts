import "server-only";

import { forbidden, unauthorized } from "next/navigation";
import { cookies } from "next/headers";

import { getDatabase } from "../db/client";
import { SESSION_COOKIE_NAME } from "./config";
import { hasPermission } from "./rbac";
import { getSessionByToken, type AuthSession } from "./service";

export async function requirePageSession(): Promise<AuthSession> {
  const session = await getPageSession();
  if (!session) unauthorized();
  return session;
}

export async function getPageSession(): Promise<AuthSession | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
  return getSessionByToken(getDatabase(), token);
}

export async function requireAdminPage(): Promise<AuthSession> {
  const session = await requirePageSession();
  if (!hasPermission(session.role, "admin:access")) forbidden();
  return session;
}
