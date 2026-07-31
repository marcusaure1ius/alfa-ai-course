import { ArrowLeft, CircleDot, ExternalLink, ServerCog } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDatabase } from "@/server/db/client";
import { getToolEnvironmentDetail } from "@/server/tools/catalog";

const statusLabels: Record<string, string> = {
  creating: "Создаётся",
  active: "Работает",
  degraded: "Нужна проверка",
  deleting: "Удаляется",
  cleanup_required: "Нужно завершить удаление",
};

const resourceLabels: Record<string, string> = {
  server: "Вычислительная среда",
  public_ip: "Публичный IP",
  backup: "Резервные копии",
};

const resourceStatusLabels: Record<string, string> = {
  creating: "Создаётся",
  active: "Активен",
  degraded: "Нужна проверка",
  deleting: "Удаляется",
  deleted: "Удалён",
};

const operationLabels: Record<string, string> = {
  create_environment: "Создание среды",
  delete_environment: "Удаление среды",
};

const operationStatusLabels: Record<string, string> = {
  queued: "В очереди",
  running: "Выполняется",
  succeeded: "Завершена",
  failed: "Ошибка",
  manual_confirmation_required: "Нужно подтверждение",
};

const dateFormatter = new Intl.DateTimeFormat("ru", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function EnvironmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const environment = await getToolEnvironmentDetail(getDatabase(), id);
  if (!environment) notFound();
  const monthlyRoubles = environment.resources.reduce(
    (total, resource) => total + resource.monthlyRoubles,
    0,
  );

  return (
    <main className="page-container">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/admin/tools">
          <ArrowLeft aria-hidden="true" />
          Инструменты
        </Link>
      </Button>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm text-muted-foreground">n8n / Среда</p>
          <h1 className="font-display mt-2 text-page-title">{environment.name}</h1>
          <div className="mt-3 flex items-center gap-2">
            <CircleDot className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm">
              {statusLabels[environment.status] ?? "Состояние обновляется"}
            </span>
          </div>
        </div>
        {environment.publicUrl ? (
          <Button asChild>
            <a href={environment.publicUrl} target="_blank" rel="noreferrer">
              Открыть среду
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
        ) : null}
      </div>

      <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="resources-title">
          <h2 id="resources-title" className="font-display text-xl">
            Ресурсы
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border bg-card">
            {environment.resources.length > 0 ? (
              environment.resources.map((resource, index) => (
                <div
                  key={`${resource.kind}-${index}`}
                  className={
                    "flex flex-wrap items-center justify-between gap-4 px-5 py-4 " +
                    (index > 0 ? "border-t" : "")
                  }
                >
                  <div>
                    <p className="text-sm font-medium">
                      {resourceLabels[resource.kind] ?? resource.kind}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {resource.address ??
                        resourceStatusLabels[resource.status] ??
                        "Состояние обновляется"}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">
                    {resource.monthlyRoubles.toLocaleString("ru-RU")} ₽/мес
                  </span>
                </div>
              ))
            ) : (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                Ресурсы появятся после начала создания среды.
              </p>
            )}
          </div>

          <h2 className="font-display mt-10 text-xl">Последние операции</h2>
          <div className="mt-4 overflow-hidden rounded-xl border bg-card">
            {environment.operations.length > 0 ? (
              environment.operations.map((operation, index) => (
                <div
                  key={operation.id}
                  className={
                    "flex flex-wrap items-center justify-between gap-4 px-5 py-4 " +
                    (index > 0 ? "border-t" : "")
                  }
                >
                  <div>
                    <p className="text-sm font-medium">
                      {operationLabels[operation.kind] ?? "Операция со средой"}
                    </p>
                    <time className="mt-1 block text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(operation.createdAt))}
                    </time>
                    {operation.errorMessage ? (
                      <p className="mt-2 text-sm text-destructive">
                        {operation.errorMessage}
                      </p>
                    ) : null}
                  </div>
                  <Badge
                    variant={
                      ["failed", "manual_confirmation_required"].includes(
                        operation.status,
                      )
                        ? "destructive"
                        : operation.status === "succeeded"
                          ? "success"
                          : "outline"
                    }
                  >
                    {operationStatusLabels[operation.status] ??
                      "Состояние обновляется"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                Операций для этой среды пока нет.
              </p>
            )}
          </div>
        </section>

        <aside className="self-start rounded-xl border bg-card p-5 xl:sticky xl:top-24">
          <ServerCog className="size-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display mt-5 text-lg">Технические параметры</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Провайдер</dt>
              <dd className="mt-1">
                {environment.provider === "timeweb"
                  ? "Timeweb"
                  : environment.provider ?? "Не назначен"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Регион</dt>
              <dd className="mt-1">
                {[environment.region, environment.zone].filter(Boolean).join(" / ") ||
                  "Не назначен"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Конфигурация</dt>
              <dd className="mt-1">{environment.preset ?? "Не назначена"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Образ</dt>
              <dd className="mt-1">{environment.image ?? "Не назначен"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Стоимость</dt>
              <dd className="mt-1 tabular-nums">
                {monthlyRoubles.toLocaleString("ru-RU")} ₽/мес
              </dd>
            </div>
          </dl>
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            Обновлено {dateFormatter.format(new Date(environment.updatedAt))}
          </p>
        </aside>
      </div>
    </main>
  );
}
