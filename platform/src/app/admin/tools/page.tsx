import {
  AlertTriangle,
  ArrowRight,
  Box,
  CircleDot,
  ExternalLink,
  Plus,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";

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
  const environments = tools.flatMap((tool) =>
    tool.environments.map((environment) => ({ tool, environment })),
  );
  const activeCount = environments.filter(
    ({ environment }) => environment.status === "active",
  ).length;
  const attentionCount = environments.filter(({ environment }) =>
    attentionStatuses.has(environment.status),
  ).length;
  const accessCount = environments.reduce(
    (total, { environment }) => total + environment.accessCount,
    0,
  );

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b pb-6">
        <div>
          <p className="workspace-kicker">СЕРВИСЫ И ЭКЗЕМПЛЯРЫ</p>
          <h1 className="font-display mt-2 text-page-title">
            Учебные инструменты
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Экземпляры, к которым имеют доступ ученики и команда курса.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/tools/n8n">
            <Plus aria-hidden="true" />
            Создать экземпляр
          </Link>
        </Button>
      </div>

      <dl className="grid border-b sm:grid-cols-3">
        <div className="border-b py-5 sm:border-b-0 sm:border-r sm:pr-6">
          <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Экземпляры
          </dt>
          <dd className="font-display mt-1 text-2xl">{environments.length}</dd>
        </div>
        <div className="border-b py-5 sm:border-b-0 sm:border-r sm:px-6">
          <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Работают
          </dt>
          <dd className="font-display mt-1 text-2xl">{activeCount}</dd>
        </div>
        <div className="py-5 sm:pl-6">
          <dt className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground">
            Активные доступы
          </dt>
          <dd className="font-display mt-1 text-2xl">{accessCount}</dd>
        </div>
      </dl>

      {attentionCount > 0 ? (
        <section
          className="mt-6 flex flex-col gap-4 rounded-lg border border-brand/25 bg-brand-soft px-4 py-4 sm:flex-row sm:items-center"
          aria-labelledby="tools-attention-title"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-brand">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="tools-attention-title" className="text-sm font-semibold">
              {attentionCount}{" "}
              {pluralize(
                attentionCount,
                "экземпляр требует",
                "экземпляра требуют",
                "экземпляров требуют",
              )}{" "}
              действия
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Проверьте состояние и продолжите безопасное восстановление в
              карточке экземпляра.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/tools/n8n">Проверить</Link>
          </Button>
        </section>
      ) : null}

      <section className="mt-8" aria-labelledby="instances-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="instances-title" className="font-display text-xl">
              Экземпляры
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Статус, доступ учеников и последнее обновление.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/access">
              <Users aria-hidden="true" />
              Управлять доступами
            </Link>
          </Button>
        </div>

        {environments.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-xl border bg-card">
            <div className="hidden grid-cols-[minmax(0,1.5fr)_minmax(9rem,0.7fr)_minmax(9rem,0.7fr)_minmax(9rem,0.8fr)_auto] gap-4 border-b bg-muted/35 px-5 py-3 text-xs font-medium uppercase tracking-[0.05em] text-muted-foreground lg:grid">
              <span>Экземпляр</span>
              <span>Доступ</span>
              <span>Состояние</span>
              <span>Обновление</span>
              <span className="sr-only">Действия</span>
            </div>
            {environments.map(({ tool, environment }, index) => (
              <article
                key={environment.id}
                className={
                  "grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(9rem,0.7fr)_minmax(9rem,0.7fr)_minmax(9rem,0.8fr)_auto] lg:items-center lg:py-4 " +
                  (index > 0 ? "border-t" : "")
                }
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                    <Box className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">
                      {environment.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tool.name} · {tool.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm lg:block">
                  <span className="text-xs text-muted-foreground lg:hidden">
                    Доступ
                  </span>
                  <span>
                    {environment.accessCount}{" "}
                    {pluralize(
                      environment.accessCount,
                      "ученик",
                      "ученика",
                      "учеников",
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 lg:block">
                  <span className="text-xs text-muted-foreground lg:hidden">
                    Состояние
                  </span>
                  <Badge
                    variant={
                      environment.status === "active"
                        ? "success"
                        : attentionStatuses.has(environment.status)
                          ? "destructive"
                          : "outline"
                    }
                  >
                    <CircleDot aria-hidden="true" />
                    {statusLabels[environment.status] ?? "Обновляется"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm lg:block">
                  <span className="text-xs text-muted-foreground lg:hidden">
                    Обновление
                  </span>
                  <time dateTime={environment.updatedAt}>
                    {formatUpdatedAt(environment.updatedAt)}
                  </time>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {environment.publicUrl ? (
                    <Button asChild variant="ghost" size="sm">
                      <a
                        href={environment.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть
                        <ExternalLink aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/admin/tools/${tool.id}/instances/${environment.id}`}
                    >
                      Детали
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border bg-card px-6 py-10">
            <Wrench className="size-6 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-display mt-5 text-xl">
              Экземпляров пока нет
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Настройте первый n8n. До подтверждённого завершения операции
              ученикам не будет показана рабочая ссылка.
            </p>
            <Button asChild className="mt-5">
              <Link href="/admin/tools/n8n">Перейти к настройке n8n</Link>
            </Button>
          </div>
        )}
      </section>

      <section className="mt-10 border-t pt-6" aria-labelledby="catalog-title">
        <h2 id="catalog-title" className="font-display text-xl">
          Сервисы
        </h2>
        <div className="mt-4 grid gap-3">
          {tools.map((tool) => (
            <Link
              key={tool.id}
              href={tool.setupHref}
              className="flex min-h-16 items-center gap-4 rounded-xl border bg-card px-5 py-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
                <Box className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{tool.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {tool.description}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {tool.environments.length}{" "}
                {pluralize(
                  tool.environments.length,
                  "экземпляр",
                  "экземпляра",
                  "экземпляров",
                )}
              </span>
              <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
