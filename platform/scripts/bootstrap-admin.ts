import { bootstrapAdmin } from "../src/server/auth/service";
import { getDatabase } from "../src/server/db/client";

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const totpSecret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
const totpCode = process.env.BOOTSTRAP_ADMIN_TOTP_CODE;
const factorEncryptionKey = process.env.AUTH_FACTOR_ENCRYPTION_KEY;

async function main(): Promise<void> {
  if (!email || !password) {
    console.error(
      "Передайте BOOTSTRAP_ADMIN_PASSWORD через process environment и укажите --email.",
    );
    process.exitCode = 2;
    return;
  }

  const sql = getDatabase();
  try {
    if (
      process.env.VERCEL_ENV === "production" &&
      (!totpSecret || !totpCode || !factorEncryptionKey)
    ) {
      throw new Error(
        "Production bootstrap требует BOOTSTRAP_ADMIN_TOTP_SECRET, BOOTSTRAP_ADMIN_TOTP_CODE и AUTH_FACTOR_ENCRYPTION_KEY.",
      );
    }
    const admin = await bootstrapAdmin(sql, {
      email,
      password,
      ...(totpSecret && totpCode && factorEncryptionKey
        ? { totpSecret, totpCode, factorEncryptionKey }
        : {}),
    });
    console.log(`Первый администратор ${admin.email} создан. Bootstrap необратимо закрыт.`);
  } finally {
    await sql.end();
  }
}

void main();
