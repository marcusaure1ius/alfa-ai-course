import { describe, expect, it } from "vitest";

import type { ToolDefinition } from "@/lib/tool-catalog";

import { composeStudentToolCatalog } from "./student-tool-catalog";

const definitions: ToolDefinition[] = [
  {
    id: "automation",
    name: "Automation Lab",
    description: "Практика автоматизации",
    setupHref: "/admin/tools/automation",
    studentHref: "/student/tools/automation",
    capabilities: { environment: "required", studentAccess: true, studentLaunch: true },
  },
  {
    id: "notebook",
    name: "Учебный блокнот",
    description: "Работа с заметками",
    setupHref: "/admin/tools/notebook",
    studentHref: "/student/tools/notebook",
    capabilities: { environment: "none", studentAccess: true, studentLaunch: false },
  },
];

describe("composeStudentToolCatalog", () => {
  it("supports zero, one, and many service definitions", () => {
    expect(composeStudentToolCatalog([], [])).toEqual([]);
    expect(composeStudentToolCatalog(definitions.slice(0, 1), [])).toHaveLength(1);
    expect(composeStudentToolCatalog(definitions, [])).toHaveLength(2);
  });

  it("keeps environment capability without inventing environment fields", () => {
    const catalog = composeStudentToolCatalog(definitions, [
      { toolType: "notebook", state: "ready", launchUrl: null, expiresAt: null },
    ]);

    expect(catalog[0]).toMatchObject({
      id: "automation",
      capabilities: { environment: "required" },
      entitlement: { state: "locked" },
    });
    expect(catalog[1]).toMatchObject({
      id: "notebook",
      capabilities: { environment: "none" },
      entitlement: { state: "ready", launchUrl: null },
    });
    expect(catalog[1]).not.toHaveProperty("environments");
    expect(catalog[1]?.entitlement).not.toHaveProperty("environmentId");
  });

  it("preserves service_disabled above an existing assignment", () => {
    const [tool] = composeStudentToolCatalog(definitions.slice(0, 1), [
      {
        toolType: "automation",
        state: "service_disabled",
        launchUrl: null,
        expiresAt: "2026-09-01T00:00:00.000Z",
      },
    ]);

    expect(tool?.entitlement).toEqual({
      toolType: "automation",
      state: "service_disabled",
      launchUrl: null,
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
  });
});
