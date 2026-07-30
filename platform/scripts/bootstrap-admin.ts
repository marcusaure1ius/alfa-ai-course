import { bootstrapAdmin } from "../src/server/auth/service";
import { getDatabase } from "../src/server/db/client";

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const totpSecret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET;
const factorEncryptionKey = process.env.AUTH_FACTOR_ENCRYPTION_KEY;

async function main(): Promise<void> {
  if (!email || !password) {
    console.error(
      "Использование: BOOTSTRAP_ADMIN_PASSWORD='<скрыто>' npm run auth:bootstrap-admin -- --email admin@example.test",
    );
    process.exitCode = 2;
    return;
  }

  const sql = getDatabase();
  try {
    if (process.env.VERCEL_ENV === "production" && (!totpSecret || !factorEncryptionKey)) {
      throw new Error(
        "Production bootstrap требует BOOTSTRAP_ADMIN_TOTP_SECRET и AUTH_FACTOR_ENCRYPTION_KEY.",
      );
    }
    const admin = await bootstrapAdmin(sql, {
      email,
      password,
      ...(totpSecret && factorEncryptionKey
        ? { totpSecret, factorEncryptionKey }
        : {}),
    });
    console.log(`Первый администратор ${admin.email} создан. Bootstrap необратимо закрыт.`);
  } finally {
    await sql.end();
  }
}

void main();
