import { Skeleton } from "@/components/ui/skeleton";

export default function StudentLoading() {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-10 xl:px-12">
      <div
        className="mx-auto max-w-6xl"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span className="sr-only">Загружаем учебное пространство</span>
        <div aria-hidden="true">
          <div className="flex items-center justify-between gap-4 border-b pb-5">
            <Skeleton className="h-5 w-full max-w-sm" />
            <Skeleton className="h-5 w-20 shrink-0" />
          </div>
          <Skeleton className="mt-6 h-72 w-full rounded-xl sm:h-80" />
          <div className="mt-8 flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-full max-w-xs" />
            </div>
            <Skeleton className="h-11 w-32 shrink-0" />
          </div>
          <div className="mt-5 overflow-hidden rounded-xl border bg-card">
            <Skeleton className="h-12 w-full rounded-none" />
            <Skeleton className="h-16 w-full rounded-none border-t" />
            <Skeleton className="h-16 w-full rounded-none border-t" />
          </div>
        </div>
      </div>
    </div>
  );
}
