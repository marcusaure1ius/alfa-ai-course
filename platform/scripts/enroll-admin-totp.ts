import { enrollAdminTotp } from "../src/server/auth/service";
import { getDatabase } from "../src/server/db/client";

const emailIndex = process.argv.indexOf("--email");
const email = emailIndex >= 0 ? process.argv[emailIndex + 1] : undefined;
const totpSecret = process.env.ADMIN_TOTP_SECRET;
const totpCode = process.env.ADMIN_TOTP_CODE;
const factorEncryptionKey = process.env.AUTH_FACTOR_ENCRYPTION_KEY;

async function main(): Promise<void> {
  if (!email || !totpSecret || !totpCode || !factorEncryptionKey) {
    console.error(
      "Передайте ADMIN_TOTP_SECRET, ADMIN_TOTP_CODE и AUTH_FACTOR_ENCRYPTION_KEY через process environment, затем укажите --email.",
    );
    process.exitCode = 2;
    return;
  }
  const sql = getDatabase();
  try {
    await enrollAdminTotp(sql, {
      email,
      totpSecret,
      totpCode,
      factorEncryptionKey,
    });
    console.log(`Verified TOTP factor для ${email.toLowerCase()} добавлен.`);
  } finally {
    await sql.end();
  }
}

void main();
