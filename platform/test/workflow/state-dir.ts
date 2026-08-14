import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Каталог состояния workflow-мира, уникальный для каждого запуска vitest.
 *
 * Общий каталог делить нельзя (T-0147): у всех одиночных прогонов один и
 * тот же тег мира `vitest-1`, поэтому world.clear() параллельного запуска
 * удаляет чужие живые run-файлы, и getRun() падает с
 * WorkflowRunNotFoundError. Уникальный на процесс каталог закрывает класс:
 * ни один другой процесс (второй прогон, dev-сервер с его .workflow-data)
 * не видит состояние этого запуска. Каталог удаляется в
 * state-cleanup.ts после прогона.
 */
const platformRoot = fileURLToPath(new URL("../..", import.meta.url));

export const workflowRunStateDir = path.join(
  platformRoot,
  ".workflow-vitest",
  `run-${process.pid}`,
);
