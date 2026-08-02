import {
  AlertTriangle,
  ArrowRight,
  Box,
  CircleDot,
  ExternalLink,
  Plus,
  ServerCog,
} from "lucide-react";
import Link from "next/link";

import { ToolAccessGate } from "@/components/admin/tool-access-gate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/server/db/client";
import { getToolCatalog } from "@/server/tools/catalog";

const statusLabels: Record<string, string> = {
  draft: "Не настроен",
  creating: "Создаётся",
  active: "Работает",
  degraded: "Нужна проверка",
  deleting: "Удаляется",
  cleanup_required: "Нужно завершить удаление",
};

const attentionStatuses = new Set(["degraded", "cleanup_required"]);

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function pluralize(count: number, one: string, few: string, many: string) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export default async function AdminToolsPage() {
  const tools = await getToolCatalog(getDatabase());
  const attention = tools.flatMap((tool) =>
    tool.environments
      .filter((environment) => attentionStatuses.has(environment.status))
      .map((environment) => ({ tool, environment })),
  );

  return (
    <div className="page-container">
      <header className="border-b pb-6">
        <p className="text-sm text-muted-foreground">Настройки обучения</p>
        <h1 className="font-display mt-2 text-page-title">Учебные инструменты</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Настраивайте каждый сервис отдельно: среду, состояние и общий доступ учеников.
        </p>
      </header>

      {attention.length > 0 ? (
        <section className="mt-6 rounded-xl border border-brand/25 bg-brand-soft p-5" aria-labelledby="tools-attention-title">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="tools-attention-title" className="font-semibold">
                {attention.length} {pluralize(attention.length, "среда требует", "среды требуют", "сред требуют")} проверки
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {attention.map(({ tool, environment }) => (
                  <li key={environment.id}>
                    <Link className="font-medium underline underline-offset-4" href={`/admin/tools/${tool.id}/instances/${environment.id}`}>
                      {tool.name}: {environment.name}
                    </Link>
                    <span className="text-muted-foreground"> — {statusLabels[environment.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="services-title">
        <div>
          <h2 id="services-title" className="font-display text-xl">Сервисы</h2>
          <p className="mt-1 text-sm text-muted-foreground">Каталог доступных учебных сервисов и их фактическое состояние.</p>
        </div>

        <div className="mt-4 grid gap-5">
          {tools.map((tool) => {
            const hasEnvironment = tool.environments.length > 0;
            return (
              <article key={tool.id} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                      <Box className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-display text-2xl">{tool.name}</h3>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{tool.description}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant={tool.studentAccessEnabled ? "success" : "destructive"}>
                          {tool.studentAccessEnabled ? "Доступ открыт" : "Доступ приостановлен"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {tool.activeAccessCount} {pluralize(tool.activeAccessCount, "активное назначение", "активных назначения", "активных назначений")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button asChild size="sm" className="min-h-11">
                      <Link href={tool.setupHref}>
                        {hasEnvironment ? <ServerCog aria-hidden="true" /> : <Plus aria-hidden="true" />}
                        {hasEnvironment ? "Настроить" : "Настроить сервис"}
                      </Link>
                    </Button>
                    {tool.capabilities.studentAccess ? (
                      <ToolAccessGate
                        toolType={tool.id}
                        displayName={tool.name}
                        enabled={tool.studentAccessEnabled}
                        activeAccessCount={tool.activeAccessCount}
                      />
                    ) : null}
                  </div>
                </div>

                {tool.capabilities.environment === "none" ? (
                  <div className="border-t bg-muted/25 px-5 py-4 text-sm text-muted-foreground sm:px-6">
                    Для этого сервиса не нужна отдельная серверная среда.
                  </div>
                ) : hasEnvironment ? (
                  <div className="border-t">
                    {tool.environments.map((environment) => (
                      <div key={environment.id} className="grid gap-4 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="truncate text-sm font-semibold">{environment.name}</h4>
                            <Badge variant={environment.status === "active" ? "success" : attentionStatuses.has(environment.status) ? "destructive" : "outline"}>
                              <CircleDot aria-hidden="true" />
                              {statusLabels[environment.status] ?? "Состояние обновляется"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Обновлено {formatUpdatedAt(environment.updatedAt)} · {environment.accessCount} {pluralize(environment.accessCount, "ученик", "ученика", "учеников")}
                          </p>
                        </div>
                        {environment.publicUrl ? (
                          <Button asChild variant="ghost" size="sm" className="min-h-11">
                            <a href={environment.publicUrl} target="_blank" rel="noreferrer">
                              Открыть <ExternalLink aria-hidden="true" />
                            </a>
                          </Button>
                        ) : <span />}
                        <Button asChild variant="outline" size="sm" className="min-h-11">
                          <Link href={`/admin/tools/${tool.id}/instances/${environment.id}`}>
                            Детали <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border-t bg-muted/25 px-5 py-5 sm:px-6">
                    <p className="text-sm font-medium">Среда ещё не создана</p>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                      Перейдите к настройке {tool.name}. Ученики не увидят рабочую ссылку, пока среда не будет готова.
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
