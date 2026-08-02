import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { getAuthSecret } from "@/server/auth/config";

const INVITE_KEY_CONTEXT = "neurokurs:n8n-invite:v1";

function inviteKey(authSecret: string): Buffer {
  if (authSecret.length < 32) {
    throw new Error("AUTH_SECRET должен содержать не менее 32 символов.");
  }
  return createHash("sha256")
    .update(`${INVITE_KEY_CONTEXT}\0${authSecret}`)
    .digest();
}

export function safeN8nInvitePath(
  value: string | undefined,
  instanceOrigin: string,
): string | null {
  if (!value || value.length > 4_096) return null;
  try {
    const url = new URL(value, instanceOrigin);
    if (
      url.origin !== new URL(instanceOrigin).origin ||
      url.pathname !== "/signup" ||
      !url.searchParams.get("token") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function sealN8nInvitePath(
  path: string,
  authSecret = getAuthSecret(),
): string {
  if (!path.startsWith("/signup?token=") || path.length > 4_096) {
    throw new Error("Некорректная ссылка приглашения n8n.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", inviteKey(authSecret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(path, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function openN8nInvitePath(
  sealed: string | null,
  authSecret?: string,
): string | null {
  if (!sealed) return null;
  try {
    const [version, iv, tag, payload] = sealed.split(".");
    if (version !== "v1" || !iv || !tag || !payload) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      inviteKey(authSecret ?? getAuthSecret()),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const path = Buffer.concat([
      decipher.update(Buffer.from(payload, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return path.startsWith("/signup?token=") && path.length <= 4_096
      ? path
      : null;
  } catch {
    return null;
  }
}
