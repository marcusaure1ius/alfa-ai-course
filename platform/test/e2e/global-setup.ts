import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { createDisposableDatabase } from "../integration/disposable-database";

export const E2E_PORT = 3100;
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}`;

// Playwright транспилирует setup в CJS, поэтому import.meta недоступен.
const platformRoot = path.resolve(__dirname, "../..");

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Сервер E2E не поднялся за ${timeoutMs / 1000}с (${url}).`, {
    cause: lastError,
  });
}

async function stopServer(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  server.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const forceTimer = setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 5_000);
    server.once("exit", () => {
      clearTimeout(forceTimer);
      resolve();
    });
  });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(path.join(platformRoot, ".next", "BUILD_ID"))) {
    throw new Error(
      "Нет production-сборки .next: запустите npm run test:e2e " +
        "(он выполняет next build перед прогоном).",
    );
  }

  const database = await createDisposableDatabase();
  const env = {
    ...process.env,
    DATABASE_URL: database.databaseUrl,
    INTEGRATION_TEST_DATABASE_URL: database.databaseUrl,
    AUTH_SECRET:
      process.env.AUTH_SECRET ?? "e2e-example-not-a-secret-32-characters!!",
    APP_ORIGIN: E2E_BASE_URL,
    VERCEL_ENV: "development",
    PLATFORM_PROVIDER: "fake",
  };

  const seed = spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "test/e2e/seed.ts"],
    { cwd: platformRoot, env, stdio: "inherit" },
  );
  if (seed.status !== 0) {
    await database.drop();
    throw new Error("Сидинг одноразовой E2E-базы завершился ошибкой.");
  }

  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "-p", String(E2E_PORT)],
    { cwd: platformRoot, env, stdio: "pipe" },
  );
  server.stdout?.on("data", () => undefined);
  server.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[next start] ${chunk}`);
  });

  try {
    await waitForServer(`${E2E_BASE_URL}/login`, 60_000);
  } catch (error) {
    await stopServer(server);
    await database.drop();
    throw error;
  }

  return async () => {
    await stopServer(server);
    await database.drop();
  };
}
