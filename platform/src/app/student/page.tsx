import {
  ArrowRight,
  Check,
  Circle,
  Clock3,
  Play,
  Wrench,
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
  if (!progress.current) return <StudentEmptyState kind="empty" />;
  const currentSection = course.sections.find((section) =>
    section.materials.some((material) => material.id === progress.current?.id),
  );

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-10 xl:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="size-2 rounded-full bg-brand" />
            <span>{course.title} · {currentSection?.title ?? "Текущий раздел"}</span>
          </div>
          <span className="font-medium tabular-nums text-muted-foreground">
            {progress.completed} / {progress.total}
          </span>
        </div>

        <section className="mt-6 overflow-hidden rounded-xl bg-foreground text-background">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="p-6 sm:p-9 lg:p-11">
              <p className="workspace-kicker !text-background/55">
                {progress.current.kind === "practice"
                  ? "ПРАКТИЧЕСКИЙ ШАГ"
                  : "ТЕКУЩИЙ ШАГ"}
              </p>
              <h1 className="font-display mt-4 max-w-3xl text-3xl leading-[1.12] sm:text-[2.75rem]">
                {progress.current.title}
              </h1>
              {progress.current.summary ? (
                <p className="mt-5 max-w-2xl text-base leading-7 text-background/65 sm:text-lg">
                  {progress.current.summary}
                </p>
              ) : null}
              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/85">
                  <Link href={`/student/materials/${progress.current.slug}`}>
                    <Play aria-hidden="true" />
                    Продолжить
                  </Link>
                </Button>
                {progress.current.estimatedMinutes ? (
                  <span className="flex items-center gap-2 text-sm text-background/60">
                    <Clock3 className="size-4" aria-hidden="true" />
                    {progress.current.estimatedMinutes} мин
                  </span>
                ) : null}
              </div>
            </div>
            <div className="min-h-64 border-t border-background/15 bg-black/20 p-7 lg:min-h-full lg:border-l lg:border-t-0">
              <div className="flex h-full flex-col justify-between">
                <div>
                  <p className="workspace-kicker !text-background/45">МАРШРУТ ШАГА</p>
                  <div className="mt-6 grid gap-5">
                    <div className="grid grid-cols-[2rem_1fr] gap-3 border-b border-background/15 pb-5">
                      <span className="font-display text-sm text-highlight">01</span>
                      <div><p className="text-sm font-medium">Понять контекст</p><p className="mt-1 text-sm leading-5 text-background/55">Прочитайте материал и выделите главное.</p></div>
                    </div>
                    <div className="grid grid-cols-[2rem_1fr] gap-3">
                      <span className="font-display text-sm text-highlight">02</span>
                      <div><p className="text-sm font-medium">Собрать результат</p><p className="mt-1 text-sm leading-5 text-background/55">Примените шаг в учебном инструменте.</p></div>
                    </div>
                  </div>
                </div>
                <p className="mt-8 text-sm leading-6 text-background/50">Один понятный шаг за раз.</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <section className="min-w-0">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Карта курса</p>
                <h2 className="font-display mt-1 text-2xl">Материалы по порядку</h2>
              </div>
              <Link
                href="/student/program"
                className="hidden items-center gap-1 text-sm font-medium hover:underline sm:flex"
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
                  <div className="bg-muted/50 px-5 py-3 text-sm font-semibold">
                    {sectionIndex + 1}. {section.title}
                  </div>
                  {section.materials.map((material) => {
                    const active = material.id === progress.current?.id;
                    return (
                      <Link
                        key={material.id}
                        href={`/student/materials/${material.slug}`}
                        className="group flex min-h-14 items-center gap-3 border-t px-5 py-3 transition-colors hover:bg-accent"
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
                          <span className="block truncate text-sm font-medium">
                            {material.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {material.kind === "practice" ? "Практика" : "Материал"}
                            {material.estimatedMinutes
                              ? ` · ${material.estimatedMinutes} мин`
                              : ""}
                          </span>
                        </span>
                        <ArrowRight
                          className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          aria-hidden="true"
                        />
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <aside className="min-w-0">
            <p className="text-sm text-muted-foreground">Для текущего шага</p>
            <Link
              href="/student/tools"
              className="mt-3 block rounded-xl border bg-card p-5 transition-colors hover:bg-accent"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Wrench className="size-5" aria-hidden="true" />
              </span>
              <h2 className="font-display mt-5 text-xl">Учебные инструменты</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Всё необходимое для практики доступно рядом с материалами курса.
              </p>
              <span className="mt-5 flex items-center gap-1 text-sm font-medium">
                Перейти
                <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}
