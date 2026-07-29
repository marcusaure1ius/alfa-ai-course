import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function InfrastructureLoading() {
  return (
    <section
      className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      aria-label="Загрузка учебных сред"
      aria-busy="true"
    >
      <div>
        <Skeleton className="h-3 w-44" />
        <Skeleton className="mt-3 h-9 w-64 max-w-full" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} size="sm">
            <CardContent className="flex items-center gap-3">
              <Skeleton className="size-9" />
              <div className="flex-1">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="mt-2 h-3 w-28" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-52 max-w-full" />
        </CardHeader>
        <CardContent className="grid gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </CardContent>
      </Card>
      <span className="sr-only" aria-live="polite">
        Загружаем учебные среды.
      </span>
    </section>
  );
}
