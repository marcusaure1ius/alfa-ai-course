import "server-only";

import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { getAuthSecret } from "@/server/auth/config";

// Строку менять нельзя, несмотря на устаревшее слово gateway в названии:
// это domain-контекст HMAC, из которого выводится секрет управления. Любая
// правка изменит секрет и разорвёт канал к уже развёрнутому VPS.
const GATEWAY_SECRET_CONTEXT = "neurokurs:n8n-gateway-management:v1";
const BASE64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64Url(bytes: Uint8Array): string {
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    encoded += BASE64URL[first >> 2];
    encoded += BASE64URL[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      encoded += BASE64URL[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) encoded += BASE64URL[third & 0x3f];
  }
  return encoded;
}

export function deriveN8nGatewayManagementSecret(authSecret: string): string {
  if (authSecret.length < 32) {
    throw new Error("AUTH_SECRET должен содержать не менее 32 символов.");
  }
  const encoder = new TextEncoder();
  return base64Url(
    hmac(
      sha256,
      encoder.encode(authSecret),
      encoder.encode(GATEWAY_SECRET_CONTEXT),
    ),
  );
}

export function getN8nGatewayManagementSecret(): string {
  return deriveN8nGatewayManagementSecret(getAuthSecret());
}
