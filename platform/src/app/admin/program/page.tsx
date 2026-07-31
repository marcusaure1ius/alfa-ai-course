import { ArrowRight, BookOpenText, CheckCircle2, CircleDashed } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAdminCourses,
  getAdminMaterials,
  getAdminSections,
} from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

export default async function AdminProgramPage() {
  const sql = getDatabase();
  const [courses, materials, allSections] = await Promise.all([
    getAdminCourses(sql),
    getAdminMaterials(sql),
    getAdminSections(sql),
  ]);

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div>
          <p className="workspace-kicker">СТРУКТУРА КУРСА</p>
          <h1 className="font-display mt-2 text-page-title">Программа</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Курсы, разделы и порядок опубликованных учебных шагов.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/content">
            <BookOpenText aria-hidden="true" />
            Управлять материалами
          </Link>
        </Button>
      </div>

      <div className="mt-8 grid gap-5">
        {courses.length > 0 ? courses.map((course, courseIndex) => {
          const courseMaterials = materials.filter((item) => item.courseId === course.id);
          const sections = allSections.filter(
            (section) => section.courseId === course.id,
          );
          return (
            <section className="workspace-section overflow-hidden" key={course.id}>
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
                      {courseMaterials.length === 1 ? "материал" : "материалов"}
                    </p>
                  </div>
                </div>
                <Badge variant={course.status === "published" ? "success" : "outline"}>
                  {course.status === "published" ? "Опубликован" : "Черновик"}
                </Badge>
              </div>
              {sections.length > 0 ? (
                <ol>
                  {sections.map((section, sectionIndex) => {
                    const sectionMaterials = courseMaterials.filter(
                      (item) => item.sectionId === section.id,
                    );
                    const published = sectionMaterials.filter((item) => item.status === "published").length;
                    return (
                      <li className="flex items-center gap-4 border-b px-5 py-4 last:border-b-0 sm:px-7" key={section.id}>
                        {published === sectionMaterials.length && sectionMaterials.length > 0 ? (
                          <CheckCircle2 className="size-5 shrink-0 text-status-ready" aria-hidden="true" />
                        ) : (
                          <CircleDashed className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{sectionIndex + 1}. {section.title}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{published} из {sectionMaterials.length} опубликовано</span>
                        </span>
                        <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="px-7 py-8 text-sm text-muted-foreground">Разделы появятся после добавления первого материала.</p>
              )}
            </section>
          );
        }) : (
          <section className="workspace-section px-6 py-12">
            <h2 className="font-display text-xl">Программа пока пуста</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Создайте курс и добавьте первый учебный материал.</p>
          </section>
        )}
      </div>
    </main>
  );
}
