import { CheckCircle2, CircleDashed } from "lucide-react";

import {
  SectionCreateDialog,
} from "@/components/admin/section-dialogs";
import { SortableSectionList } from "@/components/admin/sortable-section-list";
import {
  getAdminCourses,
  getAdminMaterials,
  getAdminSections,
} from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

export default async function AdminProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const sql = getDatabase();
  const [courses, materials, allSections, params] = await Promise.all([
    getAdminCourses(sql),
    getAdminMaterials(sql),
    getAdminSections(sql),
    searchParams,
  ]);
  const selectedCourse = courses.find((course) => course.id === params.course);
  const visibleCourses = selectedCourse ? [selectedCourse] : courses;

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="font-display text-page-title">Разделы</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Соберите структуру курса, затем откройте раздел, чтобы работать с
            его заданиями.
          </p>
        </div>
        <SectionCreateDialog courses={courses} sections={allSections} />
      </div>

      <div className="mt-8 grid gap-5">
        {visibleCourses.length > 0 ? (
          visibleCourses.map((course, courseIndex) => {
            const courseMaterials = materials.filter(
              (item) => item.courseId === course.id,
            );
            const sections = allSections.filter(
              (section) => section.courseId === course.id,
            );
            const sectionItems = sections.map((section) => {
              const sectionMaterials = courseMaterials.filter(
                (item) => item.sectionId === section.id,
              );
              return {
                section,
                materialCount: sectionMaterials.length,
                publishedMaterialCount: sectionMaterials.filter(
                  (item) => item.status === "published",
                ).length,
              };
            });
            const coursePublished = course.status === "published";
            return (
              <section
                className="workspace-section overflow-hidden"
                key={course.id}
              >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-5 sm:px-7">
                <div className="flex items-start gap-4">
                  <span className="font-display flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-sm text-background">
                    {String(courseIndex + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h2 className="font-display text-xl">{course.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {sections.length}{" "}
                      {sections.length === 1 ? "раздел" : "разделов"} ·{" "}
                      {courseMaterials.length}{" "}
                      {courseMaterials.length === 1 ? "задание" : "заданий"}
                    </p>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    coursePublished
                      ? "text-status-ready-ink"
                      : "text-muted-foreground"
                  }`}
                >
                  {coursePublished ? (
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                  ) : (
                    <CircleDashed className="size-4" aria-hidden="true" />
                  )}
                  {coursePublished
                    ? "Курс опубликован"
                    : "Курс не опубликован"}
                </span>
              </div>
              {sections.length > 0 ? (
                <SortableSectionList
                  courseId={course.id}
                  courseStatus={course.status}
                  initialItems={sectionItems}
                />
              ) : (
                <div className="px-7 py-8">
                  <p className="text-sm text-muted-foreground">
                    Добавьте первый раздел кнопкой вверху, чтобы собрать
                    последовательность заданий.
                  </p>
                </div>
              )}
              </section>
            );
          })
        ) : (
          <section className="workspace-section px-6 py-12">
            <h2 className="font-display text-xl">Разделов пока нет</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Создайте курс, затем добавьте в него первый раздел.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
