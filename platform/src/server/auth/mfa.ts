import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

function encryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) {
    throw new Error("AUTH_FACTOR_ENCRYPTION_KEY должен содержать 32 случайных байта.");
  }
  return key;
}

function base32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error("Некорректный TOTP secret.");
  }
  let bits = "";
  for (const character of normalized) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, timestamp: number): string {
  const counter = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

export function createTotpCode(secret: string, now = Date.now()): string {
  return totp(secret, now);
}

export function sealTotpSecret(secret: string, encodedKey: string): string {
  base32(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function openTotpSecret(ciphertext: string, encodedKey: string): string {
  const [version, iv, tag, payload] = ciphertext.split(".");
  if (version !== "v1" || !iv || !tag || !payload) {
    throw new Error("Некорректный encrypted MFA factor.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(encodedKey),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function verifyTotpCode(
  ciphertext: string,
  code: string,
  encodedKey: string,
  now = Date.now(),
): boolean {
  if (!/^[0-9]{6}$/.test(code)) return false;
  try {
    const secret = openTotpSecret(ciphertext, encodedKey);
    return [-1, 0, 1].some((window) => {
      const expected = Buffer.from(
        totp(secret, now + window * TOTP_PERIOD_SECONDS * 1000),
      );
      const actual = Buffer.from(code);
      return timingSafeEqual(expected, actual);
    });
  } catch {
    return false;
  }
}
