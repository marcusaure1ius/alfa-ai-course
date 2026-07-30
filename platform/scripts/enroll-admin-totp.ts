import { enrollAdminTotp } from "../src/server/auth/service";
import { getDatabase } from "../src/server/db/client";

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const totpSecret = process.env.ADMIN_TOTP_SECRET;
const factorEncryptionKey = process.env.AUTH_FACTOR_ENCRYPTION_KEY;

async function main(): Promise<void> {
  if (!email || !totpSecret || !factorEncryptionKey) {
    console.error(
      "Использование: ADMIN_TOTP_SECRET='<скрыто>' AUTH_FACTOR_ENCRYPTION_KEY='<скрыто>' npm run auth:enroll-admin-totp -- --email admin@example.test",
    );
    process.exitCode = 2;
    return;
  }
  const sql = getDatabase();
  try {
    await enrollAdminTotp(sql, { email, totpSecret, factorEncryptionKey });
    console.log(`Verified TOTP factor для ${email.toLowerCase()} добавлен.`);
  } finally {
    await sql.end();
  }
}

void main();
