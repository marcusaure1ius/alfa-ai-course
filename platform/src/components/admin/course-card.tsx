import { ArrowRight, BookOpenText, LibraryBig, ListTree } from "lucide-react";
import Link from "next/link";

import { CourseSettingsDialog } from "@/components/admin/course-settings-dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AdminCourseItem } from "@/server/admin/workspace";

const coverTones = [
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
] as const;

const russianPluralRules = new Intl.PluralRules("ru-RU");

function formatCount(
  value: number,
  words: { one: string; few: string; many: string },
): string {
  const form = russianPluralRules.select(value);
  const word = form === "one" ? words.one : form === "few" ? words.few : words.many;
  return `${value} ${word}`;
}

export function CourseCard({
  course,
  sectionCount,
  materialCount,
  coverIndex,
}: {
  course: AdminCourseItem;
  sectionCount: number;
  materialCount: number;
  coverIndex: number;
}) {
  const titleId = `course-${course.id}`;
  const coverTone = coverTones[coverIndex % coverTones.length];

  return (
    <article className="group relative flex min-h-[28rem] flex-col overflow-hidden rounded-2xl border bg-card transition-[transform,border-color] duration-[220ms] ease-out hover:-translate-y-1 hover:border-foreground/30 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <Link
        href={`/admin/program?course=${course.id}`}
        aria-labelledby={titleId}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:ring-inset"
      />
      <span
        className={cn(
          "pointer-events-none relative z-10 flex h-52 shrink-0 items-center justify-center overflow-hidden p-5",
          coverTone,
        )}
      >
        <span className="absolute top-4 left-4">
          <Badge className="bg-card/90 text-foreground">Курс</Badge>
        </span>
        <Badge
          variant={course.status === "published" ? "success" : "outline"}
          className="absolute top-4 right-4 bg-card/90"
        >
          {course.status === "published" ? "Опубликован" : "Черновик"}
        </Badge>

        <span
          aria-hidden="true"
          className="relative mt-4 flex size-28 items-center justify-center"
        >
          <span className="absolute size-20 rotate-6 rounded-xl bg-foreground/80 transition-transform duration-[220ms] ease-out group-hover:rotate-12 motion-reduce:transition-none" />
          <span className="absolute size-20 -rotate-6 rounded-xl border border-foreground/10 bg-card/65 transition-transform duration-[220ms] ease-out group-hover:-rotate-12 motion-reduce:transition-none" />
          <span className="relative flex size-20 items-center justify-center rounded-xl border border-foreground/10 bg-card text-foreground transition-transform duration-[220ms] ease-out group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
            <LibraryBig className="size-8" />
          </span>
        </span>
      </span>

      <span className="pointer-events-none relative z-10 flex flex-1 flex-col p-5 sm:p-6">
        <span className="text-xs text-muted-foreground">/{course.slug}</span>
        <h2
          id={titleId}
          className="font-display mt-3 text-[1.35rem] leading-[1.2]"
        >
          {course.title}
        </h2>
        <span className="mt-3 line-clamp-2 min-h-12 text-sm leading-6 text-muted-foreground">
          {course.description || "Описание пока не добавлено"}
        </span>

        <span className="mt-auto flex items-end justify-between gap-4 pt-7">
          <span className="flex min-w-0 flex-col gap-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <ListTree className="size-4 shrink-0" aria-hidden="true" />
              {formatCount(sectionCount, {
                one: "раздел",
                few: "раздела",
                many: "разделов",
              })}
            </span>
            <span className="flex items-center gap-2">
              <BookOpenText className="size-4 shrink-0" aria-hidden="true" />
              {formatCount(materialCount, {
                one: "задание",
                few: "задания",
                many: "заданий",
              })}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <CourseSettingsDialog
              course={course}
              sectionCount={sectionCount}
              taskCount={materialCount}
            />
            <span className="flex size-10 items-center justify-center rounded-full bg-foreground text-background">
              <ArrowRight
                className="size-4 transition-transform duration-[220ms] ease-out group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                aria-hidden="true"
              />
              <span className="sr-only">Открыть разделы курса</span>
            </span>
          </span>
        </span>
      </span>
    </article>
  );
}
