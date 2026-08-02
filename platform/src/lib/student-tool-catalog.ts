import type { ToolDefinition } from "@/lib/tool-catalog";
import type { StudentN8nAccessState } from "@/server/tools/student-access";

export type StudentToolEntitlement = {
  toolType: string;
  state: StudentN8nAccessState;
  launchUrl: string | null;
  expiresAt: string | null;
};

export type StudentToolCatalogItem = Pick<
  ToolDefinition,
  "id" | "name" | "description" | "studentHref" | "capabilities"
> & {
  entitlement: StudentToolEntitlement;
};

const lockedEntitlement = (toolType: string): StudentToolEntitlement => ({
  toolType,
  state: "locked",
  launchUrl: null,
  expiresAt: null,
});

export function composeStudentToolCatalog(
  definitions: readonly ToolDefinition[],
  entitlements: readonly StudentToolEntitlement[],
): StudentToolCatalogItem[] {
  return definitions.map((definition) => ({
    id: definition.id,
    name: definition.name,
    description: definition.description,
    studentHref: definition.studentHref,
    capabilities: definition.capabilities,
    entitlement:
      entitlements.find((candidate) => candidate.toolType === definition.id) ??
      lockedEntitlement(definition.id),
  }));
}
