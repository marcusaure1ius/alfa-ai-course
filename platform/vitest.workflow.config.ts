import path from "node:path";
import { fileURLToPath } from "node:url";

import { workflow } from "@workflow/vitest";
import { defineConfig } from "vitest/config";

import { workflowRunStateDir } from "./test/workflow/state-dir";

export default defineConfig({
  plugins: [
    workflow({
      dataDir: path.join(workflowRunStateDir, "data"),
      outDir: path.join(workflowRunStateDir, "out"),
    }),
  ],
  resolve: {
    alias: {
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/workflows/**/*.workflow.test.ts"],
    globalSetup: [
      "./test/integration/global-setup.ts",
      "./test/workflow/state-cleanup.ts",
    ],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
