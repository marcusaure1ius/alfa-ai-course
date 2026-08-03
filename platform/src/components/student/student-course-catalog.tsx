import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  CircleDot,
  Layers3,
} from "lucide-react";
import Link from "next/link";

import { getCourseProgress } from "@/lib/student-course";
import type { StudentCourse } from "@/server/course/contracts";

type StudentCourseCatalogProps = {
  courses: StudentCourse[];
};

function materialCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? "материалов"
      : mod10 === 1
        ? "материал"
        : mod10 >= 2 && mod10 <= 4
          ? "материала"
          : "материалов";
  return `${count} ${word}`;
}

function sectionCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? "разделов"
      : mod10 === 1
        ? "раздел"
        : mod10 >= 2 && mod10 <= 4
          ? "раздела"
          : "разделов";
  return `${count} ${word}`;
}

export function StudentCourseCatalog({ courses }: StudentCourseCatalogProps) {
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-10 xl:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="border-b pb-6">
          <p className="text-sm text-muted-foreground">Обучение</p>
          <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
            Мои курсы
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            Выберите курс, чтобы открыть его программу и продолжить с нужного
            занятия.
          </p>
        </div>

        <section
          className="mt-8 grid gap-5 lg:grid-cols-2"
          aria-label="Доступные курсы"
        >
          {courses.map((course, index) => {
            const progress = getCourseProgress(course);
            const statusLabel =
              progress.state === "empty" ? "Скоро начнётся" : "В процессе";
            const nextLabel =
              progress.state === "empty"
                ? "Программа готовится"
                : progress.state === "complete"
                  ? "Курс завершён"
                  : `Далее: ${progress.current?.title}`;

            return (
              <Link
                key={course.id}
                href={`/student/program?course=${encodeURIComponent(course.slug)}`}
                className="group flex min-h-72 flex-col overflow-hidden rounded-xl border bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transform-none motion-reduce:transition-none"
              >
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                    <span className="font-medium tabular-nums">
                      Курс {String(index + 1).padStart(2, "0")}
                    </span>
                    {progress.state === "complete" ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-status-ready">
                        <CheckCircle2 className="size-4" aria-hidden="true" />
                        Пройден
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <CircleDot className="size-4 text-brand" aria-hidden="true" />
                        {statusLabel}
                      </span>
                    )}
                  </div>

                  <h2 className="font-display mt-7 max-w-xl break-words text-2xl leading-tight text-balance [overflow-wrap:anywhere] sm:text-3xl">
                    {course.title}
                  </h2>
                  <p className="mt-3 max-w-xl break-words text-base leading-7 text-muted-foreground [overflow-wrap:anywhere]">
                    {course.description ||
                      "Программа курса и занятия в рекомендованном порядке."}
                  </p>

                  <div className="mt-auto pt-8">
                    <progress
                      className="sr-only"
                      value={progress.completed}
                      max={Math.max(progress.total, 1)}
                      aria-label={`Прогресс курса: ${progress.completed} из ${progress.total} материалов завершено`}
                    />
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Layers3 className="size-4" aria-hidden="true" />
                        {sectionCountLabel(course.sections.length)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <BookOpenText className="size-4" aria-hidden="true" />
                        {materialCountLabel(progress.total)}
                      </span>
                      <span className="ml-auto font-medium tabular-nums text-foreground">
                        {progress.completed} из {progress.total}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-16 items-center gap-3 border-t bg-muted/35 px-5 py-3 sm:px-6">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {nextLabel}
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-2 text-sm font-medium">
                    Открыть курс
                    <ArrowRight
                      className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </div>
  );
}
