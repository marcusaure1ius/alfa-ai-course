import { execFileSync } from "node:child_process";

function runNpm(script: string): void {
  execFileSync("npm", ["run", script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
}

if (process.env.VERCEL_ENV === "production") {
  console.log("[Vercel] Применяем versioned database migrations.");
  runNpm("db:migrate");
} else {
  console.log("[Vercel] Preview не изменяет shared database schema.");
}

runNpm("build");
