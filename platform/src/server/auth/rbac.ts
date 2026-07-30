import "server-only";

import { REAUTH_MAX_AGE_SECONDS } from "./config";

export type Role = "admin" | "student";
export type Permission =
  | "admin:access"
  | "audit:read"
  | "infrastructure:manage"
  | "student:home"
  | "user:self";

const permissionsByRole = {
  admin: new Set<Permission>([
    "admin:access",
    "audit:read",
    "infrastructure:manage",
    "student:home",
    "user:self",
  ]),
  student: new Set<Permission>(["student:home", "user:self"]),
} satisfies Record<Role, ReadonlySet<Permission>>;

export function isRole(value: string): value is Role {
  return value === "admin" || value === "student";
}

export function hasPermission(role: string, permission: Permission): boolean {
  return isRole(role) && permissionsByRole[role].has(permission);
}

export function requiresProductionMfa(
  role: string,
  vercelEnvironment: string | undefined,
  hasVerifiedFactor: boolean,
  challengeSatisfied = false,
): boolean {
  return (
    role === "admin" &&
    vercelEnvironment === "production" &&
    hasVerifiedFactor &&
    !challengeSatisfied
  );
}

export function hasFreshReauthentication(
  reauthenticatedAt: Date,
  now = new Date(),
): boolean {
  const ageMilliseconds = now.getTime() - reauthenticatedAt.getTime();
  return (
    ageMilliseconds >= 0 &&
    ageMilliseconds <= REAUTH_MAX_AGE_SECONDS * 1000
  );
}
