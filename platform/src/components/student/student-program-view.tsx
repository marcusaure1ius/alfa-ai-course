import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  Play,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getCourseProgress } from "@/lib/student-course";
import type {
  StudentCourse,
  StudentMaterialSummary,
} from "@/server/course/contracts";

type StudentProgramViewProps = {
  course: StudentCourse;
};

function materialStatus(
  material: StudentMaterialSummary,
  currentId: string | null,
): "Завершено" | "Следующий" | "Доступно" {
  if (material.completedAt) return "Завершено";
  if (material.id === currentId) return "Следующий";
  return "Доступно";
}

export function StudentProgramView({ course }: StudentProgramViewProps) {
  const progress = getCourseProgress(course);
  const currentSectionId = progress.current
    ? course.sections.find((section) =>
        section.materials.some(
          (material) => material.id === progress.current?.id,
        ),
      )?.id ?? null
    : null;

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-10 xl:px-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/student"
          className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Все курсы
        </Link>
        <div className="border-b pb-6">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Программа курса</p>
            <h1 className="font-display mt-2 max-w-4xl break-words text-3xl leading-tight text-balance [overflow-wrap:anywhere] sm:text-4xl">
              {course.title}
            </h1>
            <p className="mt-3 max-w-[72ch] break-words text-base leading-7 text-muted-foreground [overflow-wrap:anywhere]">
              {course.description ||
                "Материалы курса собраны по разделам и идут в рекомендованном порядке."}
            </p>
          </div>
        </div>

        {progress.state === "empty" ? (
          <section
            className="mt-8 flex max-w-3xl items-start gap-4 rounded-xl border bg-card p-5 sm:p-6"
            aria-labelledby="program-empty-title"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-highlight text-foreground">
              <BookOpenText className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2
                id="program-empty-title"
                className="font-display break-words text-xl sm:text-2xl"
              >
                Программа готовится
              </h2>
              <p className="mt-2 max-w-2xl text-base leading-7 text-muted-foreground">
                Доступ к курсу уже открыт. Первый опубликованный материал
                появится здесь без дополнительных действий.
              </p>
            </div>
          </section>
        ) : (
          <>
            {progress.state === "in_progress" && progress.current ? (
              <section
                className="mt-8 rounded-xl border bg-card p-5 sm:p-7"
                aria-labelledby="program-next-title"
              >
                <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand">
                      Следующий материал
                    </p>
                    <h2
                      id="program-next-title"
                      className="font-display mt-2 max-w-3xl break-words text-2xl text-balance [overflow-wrap:anywhere] sm:text-3xl"
                    >
                      {progress.current.title}
                    </h2>
                    <p className="mt-3 max-w-2xl break-words text-base leading-7 text-muted-foreground [overflow-wrap:anywhere]">
                      {progress.current.summary ||
                        "Это первый незавершённый материал в программе курса."}
                    </p>
                  </div>
                  <Button asChild size="lg" className="w-full shrink-0 sm:w-auto">
                    <Link href={`/student/materials/${progress.current.slug}`}>
                      <Play aria-hidden="true" />
                      Открыть материал
                    </Link>
                  </Button>
                </div>
              </section>
            ) : (
              <section
                className="mt-8 rounded-xl bg-foreground p-5 text-background sm:p-7"
                aria-labelledby="program-complete-title"
              >
                <div className="flex items-start gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-highlight text-foreground">
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-background/75">
                      Курс завершён
                    </p>
                    <h2
                      id="program-complete-title"
                      className="font-display mt-2 break-words text-2xl text-balance sm:text-3xl"
                    >
                      Все материалы пройдены
                    </h2>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-background/75">
                      Можно раскрыть любой раздел и вернуться к нужному
                      материалу для повторения.
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section className="mt-8" aria-labelledby="program-sections-title">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {course.sections.length} разделов
                  </p>
                  <h2
                    id="program-sections-title"
                    className="font-display mt-1 text-2xl"
                  >
                    Разделы курса
                  </h2>
                </div>
                <p className="hidden text-sm text-muted-foreground sm:block">
                  Раскройте раздел, чтобы увидеть материалы
                </p>
              </div>

              <div className="mt-5 space-y-3">
                {course.sections.map((section, sectionIndex) => {
                  const completedInSection = section.materials.filter(
                    (material) => material.completedAt,
                  ).length;
                  const sectionHasCurrent = section.id === currentSectionId;
                  return (
                    <details
                      key={section.id}
                      id={`section-${section.slug}`}
                      className="group scroll-mt-24 overflow-hidden rounded-xl border bg-card"
                      open={
                        sectionHasCurrent ||
                        (progress.state === "complete" && sectionIndex === 0)
                      }
                    >
                      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 px-5 py-4 marker:content-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:px-6 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-muted-foreground">
                            Раздел {sectionIndex + 1}
                          </p>
                          <h3 className="font-display mt-1 break-words text-lg [overflow-wrap:anywhere]">
                            {section.title}
                          </h3>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {completedInSection} из {section.materials.length}
                          <span className="sr-only"> материалов завершено</span>
                        </span>
                        <ChevronDown
                          className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                          aria-hidden="true"
                        />
                      </summary>

                      {section.materials.length > 0 ? (
                        <ol className="border-t">
                          {section.materials.map((material, materialIndex) => {
                            const status = materialStatus(
                              material,
                              progress.current?.id ?? null,
                            );
                            const current = status === "Следующий";
                            return (
                              <li
                                key={material.id}
                                className="border-b last:border-b-0"
                              >
                                <Link
                                  href={`/student/materials/${material.slug}`}
                                  aria-current={current ? "step" : undefined}
                                  className="group/row flex min-h-16 items-center gap-3 px-5 py-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:gap-4 sm:px-6"
                                >
                                  {material.completedAt ? (
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                                      <Check
                                        className="size-4"
                                        aria-hidden="true"
                                      />
                                    </span>
                                  ) : current ? (
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                                      <Play
                                        className="size-3.5"
                                        aria-hidden="true"
                                      />
                                    </span>
                                  ) : (
                                    <Circle
                                      className="size-7 shrink-0 text-border"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span className="block break-words text-sm font-medium [overflow-wrap:anywhere]">
                                      {materialIndex + 1}. {material.title}
                                    </span>
                                    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground">
                                        {status}
                                      </span>
                                      <span aria-hidden="true">·</span>
                                      <span>
                                        {material.kind === "practice"
                                          ? "Практика"
                                          : "Материал"}
                                      </span>
                                      {material.estimatedMinutes ? (
                                        <>
                                          <span aria-hidden="true">·</span>
                                          <span className="inline-flex items-center gap-1">
                                            <Clock3
                                              className="size-3"
                                              aria-hidden="true"
                                            />
                                            {material.estimatedMinutes} мин
                                          </span>
                                        </>
                                      ) : null}
                                    </span>
                                  </span>
                                  <ArrowRight
                                    className="size-4 shrink-0 text-muted-foreground opacity-100 transition-transform duration-150 group-hover/row:translate-x-0.5 motion-reduce:transition-none sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-focus-visible/row:opacity-100"
                                    aria-hidden="true"
                                  />
                                </Link>
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <p className="border-t px-5 py-5 text-base leading-7 text-muted-foreground sm:px-6">
                          Материалы этого раздела ещё не опубликованы.
                        </p>
                      )}
                    </details>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
