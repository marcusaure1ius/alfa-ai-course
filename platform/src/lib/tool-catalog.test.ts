import { describe, expect, it } from "vitest";

import { composeToolCatalog, type ToolDefinition } from "./tool-catalog";

describe("composeToolCatalog", () => {
  it("adds a second tool type without changing the shell contract", () => {
    const definitions: ToolDefinition[] = [
      {
        id: "n8n",
        name: "n8n",
        description: "Workflow",
        setupHref: "/admin/tools/n8n",
        studentHref: "/student/tools/n8n",
        capabilities: {
          environment: "required",
          studentAccess: true,
          studentLaunch: true,
        },
      },
      {
        id: "notebook",
        name: "Notebook",
        description: "Notes",
        setupHref: "/admin/tools/notebook",
        studentHref: "/student/tools/notebook",
        capabilities: {
          environment: "none",
          studentAccess: true,
          studentLaunch: false,
        },
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
        accessCount: 0,
      },
    ], [
      { toolType: "n8n", studentAccessEnabled: false, activeAccessCount: 3 },
      { toolType: "notebook", studentAccessEnabled: true, activeAccessCount: 2 },
    ]);

    expect(catalog.map((tool) => [tool.id, tool.environments.length])).toEqual([
      ["n8n", 1],
      ["notebook", 0],
    ]);
    expect(catalog[0]).toMatchObject({
      studentAccessEnabled: false,
      activeAccessCount: 3,
      capabilities: { environment: "required" },
    });
    expect(catalog[1]).toMatchObject({
      studentAccessEnabled: true,
      activeAccessCount: 2,
      capabilities: { environment: "none" },
    });
  });
});
