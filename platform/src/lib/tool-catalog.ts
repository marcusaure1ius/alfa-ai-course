export type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  setupHref: string;
  studentHref: string;
  capabilities: {
    environment: "required" | "optional" | "none";
    studentAccess: boolean;
    studentLaunch: boolean;
  };
};

export type ToolEnvironment = {
  id: string;
  toolType: string;
  name: string;
  status: string;
  publicUrl: string | null;
  updatedAt: string;
  accessCount: number;
};

export type ToolCatalogItem = ToolDefinition & {
  environments: ToolEnvironment[];
  studentAccessEnabled: boolean;
  activeAccessCount: number;
};

export type ToolServiceState = {
  toolType: string;
  studentAccessEnabled: boolean;
  activeAccessCount: number;
};

export const toolDefinitions: readonly ToolDefinition[] = [
  {
    id: "n8n",
    name: "n8n",
    description: "Среда для практики со сценариями автоматизации.",
    setupHref: "/admin/tools/n8n",
    studentHref: "/student/tools/n8n",
    capabilities: {
      environment: "required",
      studentAccess: true,
      studentLaunch: true,
    },
  },
];

export function getToolDefinition(toolType: string): ToolDefinition | null {
  return toolDefinitions.find((definition) => definition.id === toolType) ?? null;
}

export function composeToolCatalog(
  definitions: readonly ToolDefinition[],
  environments: ToolEnvironment[],
  serviceStates: readonly ToolServiceState[] = [],
): ToolCatalogItem[] {
  return definitions.map((definition) => {
    const state = serviceStates.find(
      (candidate) => candidate.toolType === definition.id,
    );
    return {
      ...definition,
      environments: environments.filter(
        (environment) => environment.toolType === definition.id,
      ),
      studentAccessEnabled: state?.studentAccessEnabled ?? true,
      activeAccessCount: state?.activeAccessCount ?? 0,
    };
  });
}
