import { LibraryBig } from "lucide-react";

import { CourseCard } from "@/components/admin/course-card";
import { CourseCreateForm } from "@/components/admin/course-create-form";
import {
  getAdminCourses,
  getAdminMaterials,
  getAdminSections,
} from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

export default async function AdminCoursesPage() {
  const sql = getDatabase();
  const [courses, sections, materials] = await Promise.all([
    getAdminCourses(sql),
    getAdminSections(sql),
    getAdminMaterials(sql),
  ]);

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-page-title">Курсы</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Создавайте курсы, затем собирайте их структуру из разделов и
            заданий.
          </p>
        </div>
        <CourseCreateForm primary />
      </div>

      {courses.length > 0 ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course, coverIndex) => {
            const sectionCount = sections.filter(
              (section) => section.courseId === course.id,
            ).length;
            const materialCount = materials.filter(
              (material) => material.courseId === course.id,
            ).length;

            return (
              <CourseCard
                key={course.id}
                course={course}
                sectionCount={sectionCount}
                materialCount={materialCount}
                coverIndex={coverIndex}
              />
            );
          })}
        </div>
      ) : (
        <section className="mt-8 max-w-2xl rounded-xl border bg-card px-6 py-12">
          <LibraryBig className="size-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display mt-6 text-2xl">Курсов пока нет</h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            Создайте первый курс. Он появится черновиком, после чего можно
            добавить разделы и задания.
          </p>
        </section>
      )}

    </main>
  );
}
