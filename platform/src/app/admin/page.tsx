import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  CircleAlert,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getAdminOverview } from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

const dateFormatter = new Intl.DateTimeFormat("ru", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminPage() {
  const overview = await getAdminOverview(getDatabase());
  const metrics = [
    {
      label: "Ученики",
      value: overview.students,
      detail: `${overview.activeStudents} с доступом`,
      icon: Users,
      href: "/admin/students",
    },
    {
      label: "Материалы",
      value: overview.totalMaterials,
      detail: `${overview.publishedMaterials} опубликовано`,
      icon: BookOpenText,
      href: "/admin/content",
    },
    {
      label: "Инструменты",
      value: overview.activeTools,
      detail: overview.activeTools === 1 ? "активен сейчас" : "активно сейчас",
      icon: Wrench,
      href: "/admin/infrastructure",
    },
  ];

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-page-title">Обзор</h1>
        <Button asChild>
          <Link href="/admin/content">Открыть контент</Link>
        </Button>
      </div>

      <section aria-labelledby="attention-title" className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 id="attention-title" className="font-display text-xl">
            Требует внимания
          </h2>
          <span className="text-sm tabular-nums text-muted-foreground">
            {overview.attention.length}
          </span>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border bg-card">
          {overview.attention.length > 0 ? (
            overview.attention.map((item, index) => (
              <Link
                key={item.key}
                href={item.href}
                className={
                  "group flex min-h-20 items-center gap-4 px-5 py-4 transition-colors hover:bg-accent " +
                  (index > 0 ? "border-t" : "")
                }
              >
                <span
                  className={
                    "flex size-9 shrink-0 items-center justify-center rounded-full " +
                    (item.tone === "warning"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-secondary text-secondary-foreground")
                  }
                >
                  <CircleAlert className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                <span className="text-sm font-medium tabular-nums">{item.count}</span>
                <ArrowRight
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))
          ) : (
            <div className="flex min-h-28 items-center gap-4 px-5 py-6">
              <span className="flex size-10 items-center justify-center rounded-full bg-highlight">
                <CheckCircle2 className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium">Ничего срочного</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Доступы, публикации и операции не требуют решения.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="workspace-title">
          <h2 id="workspace-title" className="font-display text-xl">
            Рабочее пространство
          </h2>
          <div className="mt-4 grid overflow-hidden rounded-xl border bg-card sm:grid-cols-3">
            {metrics.map((metric, index) => {
              const Icon = metric.icon;
              return (
                <Link
                  key={metric.href}
                  href={metric.href}
                  className={
                    "group p-5 transition-colors hover:bg-accent " +
                    (index > 0 ? "border-t sm:border-l sm:border-t-0" : "")
                  }
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  <p className="mt-8 text-sm text-muted-foreground">{metric.label}</p>
                  <p className="font-display mt-1 text-3xl tabular-nums">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {metric.detail}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="activity-title">
          <h2 id="activity-title" className="font-display text-xl">
            Последние изменения
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border bg-card">
            {overview.activity.length > 0 ? (
              overview.activity.map((item, index) => (
                <div
                  key={item.id}
                  className={"px-5 py-4 " + (index > 0 ? "border-t" : "")}
                >
                  <p className="text-sm font-medium">{item.action}</p>
                  <time className="mt-1 block text-xs text-muted-foreground">
                    {dateFormatter.format(new Date(item.occurredAt))}
                  </time>
                </div>
              ))
            ) : (
              <p className="px-5 py-8 text-sm leading-6 text-muted-foreground">
                История появится после первого изменения курса.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
