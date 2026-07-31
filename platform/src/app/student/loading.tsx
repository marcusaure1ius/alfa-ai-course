import { Skeleton } from "@/components/ui/skeleton";

export default function StudentLoading() {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
      <div className="mx-auto max-w-6xl" aria-label="Загрузка учебного пространства">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-5 h-12 w-full max-w-2xl" />
        <Skeleton className="mt-4 h-6 w-full max-w-xl" />
        <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
