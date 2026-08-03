import { describe, expect, it } from "vitest";

import type { ToolDefinition } from "@/lib/tool-catalog";

import {
  composeStudentToolCatalog,
  resolveStudentToolAction,
  type StudentToolAccessState,
} from "./student-tool-catalog";

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
      { toolType: "notebook", state: "available", expiresAt: null },
    ]);

    expect(catalog[0]).toMatchObject({
      id: "automation",
      capabilities: { environment: "required" },
      entitlement: { state: "locked" },
    });
    expect(catalog[1]).toMatchObject({
      id: "notebook",
      capabilities: { environment: "none" },
      entitlement: { state: "available" },
    });
    expect(catalog[1]).not.toHaveProperty("environments");
    expect(catalog[1]?.entitlement).not.toHaveProperty("environmentId");
  });

  it("preserves service_disabled above an existing assignment", () => {
    const [tool] = composeStudentToolCatalog(definitions.slice(0, 1), [
      {
        toolType: "automation",
        state: "service_disabled",
        expiresAt: "2026-09-01T00:00:00.000Z",
      },
    ]);

    expect(tool?.entitlement).toEqual({
      toolType: "automation",
      state: "service_disabled",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("omits definitions that do not expose student access", () => {
    const hidden: ToolDefinition = {
      ...definitions[0]!,
      id: "admin-only",
      capabilities: {
        ...definitions[0]!.capabilities,
        studentAccess: false,
      },
    };
    expect(
      composeStudentToolCatalog([hidden, ...definitions], []).map(
        (tool) => tool.id,
      ),
    ).toEqual(["automation", "notebook"]);
  });

  it.each([
    ["locked", true, "details"],
    ["service_disabled", true, "details"],
    ["preparing", true, "details"],
    ["available", true, "launch"],
    ["available", false, "details"],
    ["attention", true, "recovery"],
    ["expired", true, "recovery"],
  ] as const)(
    "resolves %s with studentLaunch=%s to %s",
    (state, studentLaunch, expected) => {
      const [tool] = composeStudentToolCatalog(
        [
          {
            ...definitions[0]!,
            capabilities: {
              ...definitions[0]!.capabilities,
              studentLaunch,
            },
          },
        ],
        [
          {
            toolType: "automation",
            state: state as StudentToolAccessState,
            expiresAt: null,
          },
        ],
      );

      expect(tool && resolveStudentToolAction(tool)).toBe(expected);
    },
  );
});
