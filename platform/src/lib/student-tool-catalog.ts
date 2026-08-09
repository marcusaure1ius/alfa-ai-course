import type { ToolDefinition } from "@/lib/tool-catalog";

export type StudentToolAccessState =
  | "locked"
  | "service_disabled"
  | "preparing"
  // Доступ выдан, но без действия самого ученика инструментом не воспользоваться.
  // Состояние общее, а не про n8n: ожидание ученика отличается и от «готовится»
  // (ждём систему), и от «можно работать» (ничего делать не нужно).
  | "action_required"
  | "available"
  | "attention"
  | "expired";

export type StudentToolEntitlement = {
  toolType: string;
  state: StudentToolAccessState;
  expiresAt: string | null;
};

export type StudentToolCatalogItem = Pick<
  ToolDefinition,
  "id" | "name" | "description" | "studentHref" | "capabilities"
> & {
  entitlement: StudentToolEntitlement;
};

export type StudentToolAction = "details" | "launch" | "recovery";

export function resolveStudentToolAction(
  tool: StudentToolCatalogItem,
): StudentToolAction {
  if (
    tool.entitlement.state === "attention" ||
    tool.entitlement.state === "expired"
  ) {
    return "recovery";
  }

  if (
    tool.entitlement.state === "available" &&
    tool.capabilities.studentLaunch
  ) {
    return "launch";
  }

  return "details";
}

const lockedEntitlement = (toolType: string): StudentToolEntitlement => ({
  toolType,
  state: "locked",
  expiresAt: null,
});

export function composeStudentToolCatalog(
  definitions: readonly ToolDefinition[],
  entitlements: readonly StudentToolEntitlement[],
): StudentToolCatalogItem[] {
  return definitions
    .filter((definition) => definition.capabilities.studentAccess)
    .map((definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      studentHref: definition.studentHref,
      capabilities: definition.capabilities,
      entitlement:
        entitlements.find(
          (candidate) => candidate.toolType === definition.id,
        ) ?? lockedEntitlement(definition.id),
    }));
}
