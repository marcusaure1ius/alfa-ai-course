import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Eye,
  EyeOff,
  ListChecks,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TaskCreateDialog } from "@/components/admin/task-create-dialog";
import { Button } from "@/components/ui/button";
import { resolveSectionVisibility } from "@/lib/publication-visibility";
import { cn } from "@/lib/utils";
import {
  getAdminCourses,
  getAdminMaterials,
  getAdminSections,
} from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

const pluralRules = new Intl.PluralRules("ru-RU");

function taskCountLabel(count: number): string {
  const form = pluralRules.select(count);
  const word = form === "one" ? "задание" : form === "few" ? "задания" : "заданий";
  return `${count} ${word}`;
}

export default async function AdminSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sql = getDatabase();
  const [courses, sections, materials] = await Promise.all([
    getAdminCourses(sql),
    getAdminSections(sql),
    getAdminMaterials(sql),
  ]);
  const section = sections.find((item) => item.id === id);
  if (!section) notFound();

  const course = courses.find((item) => item.id === section.courseId);
  if (!course) notFound();

  const sectionMaterials = materials.filter(
    (item) => item.sectionId === section.id,
  );
  const visibility = resolveSectionVisibility(course.status, section.status);

  return (
    <main className="page-container">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href={`/admin/program?course=${course.id}`}>
          <ArrowLeft aria-hidden="true" />
          Все разделы
        </Link>
      </Button>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-5 border-b pb-7">
        <div className="min-w-0">
          <h1 className="font-display text-page-title">{section.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Раздел {section.position + 1} · {taskCountLabel(sectionMaterials.length)}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-4">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium",
              visibility.visible
                ? "text-status-ready"
                : "text-muted-foreground",
            )}
          >
            {visibility.visible ? (
              <Eye className="size-4" aria-hidden="true" />
            ) : (
              <EyeOff className="size-4" aria-hidden="true" />
            )}
            {visibility.label}
          </span>
          <TaskCreateDialog
            courseId={course.id}
            sectionId={section.id}
            sectionTitle={section.title}
            nextPosition={section.nextMaterialPosition}
          />
        </div>
      </div>

      <section className="workspace-section mt-8 overflow-hidden" aria-labelledby="tasks-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-5 sm:px-7">
          <div>
            <h2 id="tasks-title" className="font-display text-xl">
              Задания раздела
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Порядок, в котором их увидит ученик
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {taskCountLabel(sectionMaterials.length)}
          </span>
        </div>

        {sectionMaterials.length > 0 ? (
          <ol>
            {sectionMaterials.map((material, index) => (
              <li className="border-b last:border-b-0" key={material.id}>
                <Link
                  href={`/admin/content/materials/${material.id}`}
                  className="group grid min-h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:px-7 motion-reduce:transition-none"
                >
                  <span className="font-display flex size-9 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground transition-colors group-hover:bg-foreground group-hover:text-background motion-reduce:transition-none">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {material.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {material.kind === "practice" ? "Практика" : "Теория"}
                      {material.estimatedMinutes ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <Clock3 className="size-3" aria-hidden="true" />
                          {material.estimatedMinutes} мин
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "col-start-2 row-start-2 text-xs font-medium sm:col-start-auto sm:row-start-auto",
                      material.status === "published"
                        ? "text-status-ready"
                        : "text-muted-foreground",
                    )}
                  >
                    {material.status === "published"
                      ? "Виден ученикам"
                      : "Черновик"}
                  </span>
                  <ArrowRight
                    className="col-start-3 row-start-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:col-start-auto sm:row-start-auto motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="px-6 py-12 sm:px-8">
            <ListChecks
              className="size-6 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 className="font-display mt-6 text-2xl">Заданий пока нет</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Задания этого раздела появятся здесь в том порядке, в котором их
              будет проходить ученик.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
