export type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  setupHref: string;
  studentHref: string;
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
};

export const toolDefinitions: readonly ToolDefinition[] = [
  {
    id: "n8n",
    name: "n8n",
    description: "Среда для практики со сценариями автоматизации.",
    setupHref: "/admin/tools/n8n",
    studentHref: "/student/tools/n8n",
  },
];

export function composeToolCatalog(
  definitions: readonly ToolDefinition[],
  environments: ToolEnvironment[],
): ToolCatalogItem[] {
  return definitions.map((definition) => ({
    ...definition,
    environments: environments.filter(
      (environment) => environment.toolType === definition.id,
    ),
  }));
}
