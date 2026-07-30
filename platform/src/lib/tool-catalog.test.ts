import { describe, expect, it } from "vitest";

import { composeToolCatalog, type ToolDefinition } from "./tool-catalog";

describe("composeToolCatalog", () => {
  it("adds a second tool type without changing the shell contract", () => {
    const definitions: ToolDefinition[] = [
      {
        id: "n8n",
        name: "n8n",
        description: "Workflow",
        setupHref: "/admin/infrastructure/n8n",
        studentHref: "/student/tools/n8n",
      },
      {
        id: "notebook",
        name: "Notebook",
        description: "Notes",
        setupHref: "/admin/infrastructure/notebook",
        studentHref: "/student/tools/notebook",
      },
    ];
    const catalog = composeToolCatalog(definitions, [
      {
        id: "environment-1",
        toolType: "n8n",
        name: "Основная среда",
        status: "active",
        publicUrl: null,
        updatedAt: "2026-07-31T00:00:00.000Z",
      },
    ]);

    expect(catalog.map((tool) => [tool.id, tool.environments.length])).toEqual([
      ["n8n", 1],
      ["notebook", 0],
    ]);
  });
});
