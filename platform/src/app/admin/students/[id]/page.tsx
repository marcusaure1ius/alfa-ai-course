import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StudentCourseAccess } from "@/components/admin/student-course-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAdminCourses,
  getAdminStudent,
} from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sql = getDatabase();
  const [student, courses] = await Promise.all([
    getAdminStudent(sql, id),
    getAdminCourses(sql),
  ]);
  if (!student) notFound();

  return (
    <main className="page-container">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/admin/students">
          <ArrowLeft aria-hidden="true" />
          Ученики
        </Link>
      </Button>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-page-title">{student.email}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={student.status === "active" ? "success" : "destructive"}>
              {student.status === "active" ? "Активен" : "Заблокирован"}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {student.courseTitles.length > 0
                ? student.courseTitles.join(", ")
                : "Курс не назначен"}
            </span>
          </div>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">
          {student.completedMaterials} из {student.publishedMaterials} завершено
        </p>
      </div>

      <section className="mt-10 max-w-3xl" aria-labelledby="access-title">
        <h2 id="access-title" className="font-display text-xl">
          Доступ к курсу
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Изменение применяется сразу к кабинету ученика.
        </p>
        <div className="mt-4">
          <StudentCourseAccess
            studentId={student.id}
            currentCourseIds={student.courseIds}
            courses={courses}
          />
        </div>
      </section>
    </main>
  );
}
