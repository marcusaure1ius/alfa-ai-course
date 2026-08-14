import { rm } from "node:fs/promises";

import { workflowRunStateDir } from "./state-dir";

export default async function globalSetup(): Promise<() => Promise<void>> {
  return async () => {
    await rm(workflowRunStateDir, { recursive: true, force: true });
  };
}
