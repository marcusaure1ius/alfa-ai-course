import { Skeleton } from "@/components/ui/skeleton";

export default function ToolsLoading() {
  return (
    <section
      className="page-container"
      aria-label="Загрузка инструментов"
      aria-busy="true"
    >
      <Skeleton className="h-9 w-44" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-xl border bg-card p-6">
            <div className="flex items-start gap-4">
              <Skeleton className="size-11 shrink-0 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="mt-3 h-4 w-full max-w-md" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        Загружаем инструменты.
      </span>
    </section>
  );
}
