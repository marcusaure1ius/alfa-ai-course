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
import type { ToolCatalogItem } from "@/lib/tool-catalog";

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

export function ToolServiceCatalog({ tools }: { tools: ToolCatalogItem[] }) {
  return (
    <section className="mt-8" aria-labelledby="services-title">
      <div>
        <h2 id="services-title" className="font-display text-xl">Сервисы</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Каталог доступных учебных сервисов и их фактическое состояние.
        </p>
      </div>

      {tools.length === 0 ? (
        <div className="mt-4 rounded-xl border bg-card p-6">
          <p className="font-medium">Сервисы пока не подключены</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Добавьте server-side definition сервиса, чтобы начать его настройку.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-5" aria-label="Каталог учебных сервисов">
          {tools.map((tool) => {
            const hasEnvironment = tool.environments.length > 0;
            return (
              <li key={tool.id} className="min-w-0">
                <article className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
                        <Box className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display break-words text-2xl [overflow-wrap:anywhere]">{tool.name}</h3>
                        <p className="mt-1 max-w-2xl break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{tool.description}</p>
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
                    <ul className="border-t" aria-label={`Среды сервиса ${tool.name}`}>
                      {tool.environments.map((environment) => {
                        const needsAttention = attentionStatuses.has(environment.status);
                        return (
                          <li key={environment.id} className="grid gap-4 px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{environment.name}</h4>
                                <Badge variant={environment.status === "active" ? "success" : needsAttention ? "destructive" : "outline"}>
                                  <CircleDot aria-hidden="true" />
                                  {statusLabels[environment.status] ?? "Состояние обновляется"}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Обновлено {formatUpdatedAt(environment.updatedAt)} · {environment.accessCount} {pluralize(environment.accessCount, "ученик", "ученика", "учеников")}
                              </p>
                              {needsAttention ? (
                                <Link
                                  className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md font-medium text-brand underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                  href={`/admin/tools/${tool.id}/instances/${environment.id}`}
                                >
                                  <AlertTriangle className="size-4" aria-hidden="true" />
                                  Проверить {tool.name}: {environment.name}
                                </Link>
                              ) : null}
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
                          </li>
                        );
                      })}
                    </ul>
                  ) : tool.capabilities.environment === "optional" ? (
                    <div className="border-t bg-muted/25 px-5 py-5 sm:px-6">
                      <p className="text-sm font-medium">Отдельная среда не настроена</p>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                        {tool.name} может работать без неё. При необходимости добавьте среду в настройках сервиса.
                      </p>
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
