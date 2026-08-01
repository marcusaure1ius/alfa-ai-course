import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ListTree,
  Play,
} from "lucide-react";
import Link from "next/link";

import { StudentEmptyState } from "@/components/student/student-empty-state";
import { Button } from "@/components/ui/button";
import { getCourseProgress } from "@/lib/student-course";
import { requirePageSession } from "@/server/auth/page-access";
import { getStudentWorkspaceCourse } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentPage() {
  const session = await requirePageSession();
  const course = await getStudentWorkspaceCourse(getDatabase(), session.userId);
  if (!course) return <StudentEmptyState kind="locked" />;
  const progress = getCourseProgress(course);
  if (progress.state === "empty") return <StudentEmptyState kind="empty" />;
  const current = progress.current;
  const complete = progress.state === "complete";
  const currentSection = course.sections.find((section) =>
    section.materials.some((material) => material.id === current?.id),
  );

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-10 xl:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-5 text-sm">
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
            <span className="min-w-0 break-words">
              {course.title}
              {currentSection ? ` · ${currentSection.title}` : ""}
            </span>
          </div>
          <span className="font-medium tabular-nums text-muted-foreground">
            <span className="sr-only">Прогресс курса: </span>
            {progress.completed} из {progress.total}
            <span className="sr-only"> материалов завершено</span>
          </span>
        </div>

        <section
          className="mt-6 overflow-hidden rounded-xl bg-foreground text-background"
          aria-labelledby="student-next-step-title"
        >
          <div className="p-6 sm:p-9 xl:p-11">
            <p className="workspace-kicker !text-background/70">
              {complete
                ? "КУРС ЗАВЕРШЁН"
                : current?.kind === "practice"
                  ? "ПРАКТИЧЕСКИЙ ШАГ"
                  : "ТЕКУЩИЙ ШАГ"}
            </p>
            <h1
              id="student-next-step-title"
              className="font-display mt-4 max-w-4xl break-words text-3xl leading-[1.12] text-balance sm:text-[2.75rem]"
            >
              {complete ? "Вы прошли все материалы" : current?.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-background/75 sm:text-lg">
              {complete
                ? "Программа остаётся доступной: к любому материалу можно вернуться и повторить его в удобном темпе."
                : current?.summary ||
                  "Откройте следующий материал и продолжайте с первого незавершённого шага."}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              {complete ? (
                <Button
                  asChild
                  size="lg"
                  className="bg-background text-foreground hover:bg-background/85"
                >
                  <Link href="/student/program">
                    <ListTree aria-hidden="true" />
                    Открыть программу
                  </Link>
                </Button>
              ) : current ? (
                <Button
                  asChild
                  size="lg"
                  className="bg-background text-foreground hover:bg-background/85"
                >
                  <Link href={`/student/materials/${current.slug}`}>
                    <Play aria-hidden="true" />
                    Продолжить
                  </Link>
                </Button>
              ) : null}
              {!complete && current?.estimatedMinutes ? (
                <span className="flex items-center gap-2 text-sm text-background/75">
                  <Clock3 className="size-4" aria-hidden="true" />
                  {current.estimatedMinutes} мин
                </span>
              ) : complete ? (
                <span className="flex items-center gap-2 text-sm text-background/75">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {progress.completed} из {progress.total} завершено
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <div className="mt-8 min-w-0">
          <section className="min-w-0" aria-labelledby="student-course-map-title">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Карта курса</p>
                <h2 id="student-course-map-title" className="font-display mt-1 text-2xl">
                  Материалы по порядку
                </h2>
              </div>
              <Link
                href="/student/program"
                className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Вся программа
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-5 overflow-hidden rounded-xl border bg-card">
              {course.sections.map((section, sectionIndex) => (
                <div
                  key={section.id}
                  className={sectionIndex > 0 ? "border-t" : undefined}
                >
                  <h3 className="break-words bg-muted/50 px-5 py-3 text-sm font-semibold">
                    {sectionIndex + 1}. {section.title}
                  </h3>
                  {section.materials.map((material) => {
                    const active = material.id === current?.id;
                    const statusLabel = material.completedAt
                      ? "Завершено"
                      : active
                        ? "Текущий материал"
                        : "Ещё не начато";
                    return (
                      <Link
                        key={material.id}
                        href={`/student/materials/${material.slug}`}
                        aria-current={active ? "step" : undefined}
                        className="group flex min-h-14 items-center gap-3 border-t px-5 py-3 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                      >
                        {material.completedAt ? (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                            <Check className="size-3.5" aria-hidden="true" />
                          </span>
                        ) : active ? (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                            <Play className="size-3" aria-hidden="true" />
                          </span>
                        ) : (
                          <Circle
                            className="size-6 shrink-0 text-border"
                            aria-hidden="true"
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-medium">
                            {material.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            <span className="sr-only">{statusLabel}. </span>
                            {material.kind === "practice" ? "Практика" : "Материал"}
                            {material.estimatedMinutes
                              ? ` · ${material.estimatedMinutes} мин`
                              : ""}
                          </span>
                        </span>
                        <ArrowRight
                          className="size-4 shrink-0 text-muted-foreground opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"
                          aria-hidden="true"
                        />
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
