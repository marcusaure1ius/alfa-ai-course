import { ArrowRight, BookOpenText, Clock3 } from "lucide-react";
import Link from "next/link";

import { CourseCreateForm } from "@/components/admin/course-create-form";
import { MaterialCreateDialog } from "@/components/admin/material-create-dialog";
import { SectionCreateDialog } from "@/components/admin/section-dialogs";
import { Badge } from "@/components/ui/badge";
import {
  getAdminCourses,
  getAdminMaterials,
  getAdminSections,
} from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}

export default async function AdminContentPage() {
  const sql = getDatabase();
  const [materials, courseOptions, sectionOptions] = await Promise.all([
    getAdminMaterials(sql),
    getAdminCourses(sql),
    getAdminSections(sql),
  ]);
  const published = materials.filter((material) => material.status === "published");
  const courses = groupBy(materials, (material) => material.courseTitle);

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page-title">Материалы</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {published.length} из {materials.length} материалов опубликовано
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <CourseCreateForm />
          <SectionCreateDialog courses={courseOptions} sections={sectionOptions} />
          <MaterialCreateDialog sections={sectionOptions} />
        </div>
      </div>

      {courseOptions.length > 0 && sectionOptions.length === 0 ? (
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          Чтобы создать материал, добавьте первый раздел курса — это можно
          сделать прямо здесь кнопкой «Добавить раздел».
        </p>
      ) : null}

      {courseOptions.length > 0 ? (
        <section className="mt-8 max-w-2xl" aria-labelledby="courses-title">
          <h2 id="courses-title" className="font-display text-xl">
            Курсы
          </h2>
          <div className="mt-4 overflow-hidden rounded-xl border bg-card">
            {courseOptions.map((course, index) => (
              <div
                className={
                  "flex items-center justify-between gap-4 px-5 py-4 " +
                  (index > 0 ? "border-t" : "")
                }
                key={course.id}
              >
                <span className="text-sm font-medium">{course.title}</span>
                <Badge variant={course.status === "published" ? "success" : "outline"}>
                  {course.status === "published" ? "Опубликован" : "Черновик"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {materials.length > 0 ? (
        <div className="mt-8 space-y-8">
          {[...courses.entries()].map(([courseTitle, courseMaterials]) => {
            const sections = groupBy(
              courseMaterials,
              (material) => material.sectionTitle,
            );
            return (
              <section key={courseTitle} aria-labelledby={`course-${courseTitle}`}>
                <h2
                  id={`course-${courseTitle}`}
                  className="font-display text-xl"
                >
                  {courseTitle}
                </h2>
                <div className="mt-4 overflow-hidden rounded-xl border bg-card">
                  {[...sections.entries()].map(
                    ([sectionTitle, sectionMaterials], sectionIndex) => (
                      <div
                        key={sectionTitle}
                        className={sectionIndex > 0 ? "border-t" : ""}
                      >
                        <div className="bg-muted/40 px-5 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {sectionTitle}
                          </p>
                        </div>
                        {sectionMaterials.map((material) => (
                          <Link
                            key={material.id}
                            href={`/admin/content/materials/${material.id}`}
                            className="group grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t px-5 py-4 transition-colors hover:bg-accent sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-x-4 sm:py-3"
                          >
                            <BookOpenText
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">
                                {material.title}
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
                            <Badge
                              className="col-start-2 row-start-2 justify-self-start sm:col-start-auto sm:row-start-auto"
                              variant={
                                material.status === "published"
                                  ? "success"
                                  : "outline"
                              }
                            >
                              {material.status === "published"
                                ? "Виден ученикам"
                                : "Черновик"}
                            </Badge>
                            <ArrowRight
                              className="col-start-3 row-start-1 size-4 text-muted-foreground sm:col-start-auto sm:row-start-auto"
                              aria-hidden="true"
                            />
                          </Link>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="mt-8 max-w-2xl rounded-xl border bg-card px-6 py-12">
          <BookOpenText className="size-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display mt-6 text-2xl">Материалов пока нет</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Добавьте раздел, затем создайте первый материал. Он появится здесь
            в порядке изучения и останется черновиком до публикации.
          </p>
        </section>
      )}
    </main>
  );
}
