import { ArrowRight, Box, CircleDot, ExternalLink } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/server/db/client";
import { getToolCatalog } from "@/server/tools/catalog";

const statusLabels: Record<string, string> = {
  draft: "Не настроен",
  creating: "Среда создаётся",
  active: "Среда работает",
  degraded: "Нужна проверка",
  deleting: "Удаляется",
  cleanup_required: "Нужно завершить удаление",
};

export default async function AdminToolsPage() {
  const tools = await getToolCatalog(getDatabase());

  return (
    <main className="page-container">
      <h1 className="font-display text-page-title">Инструменты</h1>

      <div className="mt-8 space-y-4">
        {tools.map((tool) => {
          const environment = tool.environments[0] ?? null;
          return (
            <section
              key={tool.id}
              className="overflow-hidden rounded-xl border bg-card"
              aria-labelledby={`tool-${tool.id}`}
            >
              <div className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-start">
                <div className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                    <Box className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 id={`tool-${tool.id}`} className="font-display text-xl">
                        {tool.name}
                      </h2>
                      <Badge variant={environment?.status === "active" ? "success" : "outline"}>
                        {environment
                          ? statusLabels[environment.status] ?? "Состояние обновляется"
                          : "Не настроен"}
                      </Badge>
                    </div>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                      {tool.description}
                    </p>
                  </div>
                </div>
                <Button asChild variant={environment ? "outline" : "default"}>
                  <Link href={tool.setupHref}>
                    {environment ? "Управлять" : "Настроить"}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              {environment ? (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t bg-muted/30 px-6 py-4 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <CircleDot className="size-4 text-muted-foreground" aria-hidden="true" />
                    {environment.name}
                  </span>
                  {environment.publicUrl ? (
                    <a
                      href={environment.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 hover:underline"
                    >
                      Открыть среду
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground">
                      Ссылка появится после настройки
                    </span>
                  )}
                  <Link
                    href={`/admin/tools/${tool.id}/instances/${environment.id}`}
                    className="ml-auto font-medium hover:underline"
                  >
                    Технические детали
                  </Link>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}
