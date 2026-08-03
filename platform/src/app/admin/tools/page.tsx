import { ToolServiceCatalog } from "@/components/admin/tool-service-catalog";
import { getDatabase } from "@/server/db/client";
import { getToolCatalog } from "@/server/tools/catalog";

export default async function AdminToolsPage() {
  const tools = await getToolCatalog(getDatabase());
  return (
    <div className="page-container">
      <header className="border-b pb-6">
        <p className="text-sm text-muted-foreground">Настройки обучения</p>
        <h1 className="font-display mt-2 text-page-title">Учебные инструменты</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Настраивайте каждый сервис отдельно: среду, состояние и общий доступ учеников.
        </p>
      </header>
      <ToolServiceCatalog tools={tools} />
    </div>
  );
}
