import {
  ArrowRight,
  Check,
  Circle,
  Clock3,
  Play,
} from "lucide-react";
import Link from "next/link";

import { StudentEmptyState } from "@/components/student/student-empty-state";
import { Button } from "@/components/ui/button";
import { getCourseProgress } from "@/lib/student-course";
import { requirePageSession } from "@/server/auth/page-access";
import { getStudentWorkspaceCourse } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentProgramPage() {
  const session = await requirePageSession();
  const course = await getStudentWorkspaceCourse(getDatabase(), session.userId);
  if (!course) return <StudentEmptyState kind="locked" />;
  const progress = getCourseProgress(course);

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm text-muted-foreground">Программа</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="font-display text-3xl leading-tight sm:text-4xl">
              {course.title}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
              {course.description ||
                "Ваше текущее место и материалы, которые идут следом."}
            </p>
          </div>
          <p className="text-sm font-medium tabular-nums text-muted-foreground">
            {progress.completed} из {progress.total}
          </p>
        </div>

        {progress.current ? (
          <section className="mt-9 rounded-2xl border bg-card p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <p className="text-sm font-medium text-brand">Текущее место</p>
                <h2 className="font-display mt-2 text-2xl sm:text-3xl">
                  {progress.current.title}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {progress.current.summary ||
                    "Продолжите с первого незавершённого материала."}
                </p>
              </div>
              <Button asChild size="lg" className="shrink-0">
                <Link href={`/student/materials/${progress.current.slug}`}>
                  <Play aria-hidden="true" />
                  Продолжить
                </Link>
              </Button>
            </div>
            <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${progress.percent}%` }}
                aria-hidden="true"
              />
            </div>
          </section>
        ) : (
          <div className="mt-9">
            <StudentEmptyState kind="empty" />
          </div>
        )}

        <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <section aria-labelledby="program-sections-title">
            <h2 id="program-sections-title" className="font-display text-2xl">
              Разделы курса
            </h2>
            <div className="mt-5 space-y-4">
              {course.sections.map((section, sectionIndex) => (
                <section
                  key={section.id}
                  className="overflow-hidden rounded-2xl border bg-card"
                >
                  <div className="flex items-center justify-between gap-4 border-b bg-muted/40 px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        Раздел {String(sectionIndex + 1).padStart(2, "0")}
                      </p>
                      <h3 className="font-display mt-1 text-lg">{section.title}</h3>
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {
                        section.materials.filter((material) => material.completedAt)
                          .length
                      }{" "}
                      / {section.materials.length}
                    </span>
                  </div>
                  {section.materials.length > 0 ? (
                    <ol>
                      {section.materials.map((material, materialIndex) => (
                        <li key={material.id} className="border-b last:border-b-0">
                          <Link
                            href={`/student/materials/${material.slug}`}
                            className="group flex min-h-16 items-center gap-4 px-5 py-3 transition-colors hover:bg-accent sm:px-6"
                          >
                            {material.completedAt ? (
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                                <Check className="size-4" aria-hidden="true" />
                              </span>
                            ) : material.id === progress.current?.id ? (
                              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                                <Play className="size-3.5" aria-hidden="true" />
                              </span>
                            ) : (
                              <Circle
                                className="size-7 shrink-0 text-border"
                                aria-hidden="true"
                              />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">
                                {materialIndex + 1}. {material.title}
                              </span>
                              <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                {material.kind === "practice"
                                  ? "Практика"
                                  : "Материал"}
                                {material.estimatedMinutes ? (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <Clock3 className="size-3" aria-hidden="true" />
                                    {material.estimatedMinutes} мин
                                  </>
                                ) : null}
                              </span>
                            </span>
                            <ArrowRight
                              className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="px-6 py-5 text-sm leading-6 text-muted-foreground">
                      Материалы этого раздела ещё не опубликованы.
                    </p>
                  )}
                </section>
              ))}
            </div>
          </section>

          <aside className="self-start rounded-2xl bg-foreground p-6 text-background xl:sticky xl:top-24">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-background/55">
              Ориентир
            </p>
            <p className="font-display mt-4 text-2xl leading-tight">
              Сначала понять.
              <br />
              Потом сделать.
            </p>
            <p className="mt-5 text-sm leading-6 text-background/65">
              Идите по порядку. Практические шаги опираются на предыдущие материалы.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
