import { ArrowRight, KeyRound } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminStudents } from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

export default async function AdminAccessPage() {
  const students = await getAdminStudents(getDatabase());
  const withoutCourse = students.filter((student) => student.courseIds.length === 0).length;

  return (
    <main className="page-container">
      <div className="border-b pb-6">
        <p className="workspace-kicker">ДОСТУП К ОБУЧЕНИЮ</p>
        <h1 className="font-display mt-2 text-page-title">Доступы</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Курсы и учебные инструменты назначаются ученику без передачи
          облачных логинов, паролей и ключей.
        </p>
      </div>

      {withoutCourse > 0 ? (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-brand/20 bg-brand-soft px-4 py-3 text-sm leading-6">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          <p><strong>{withoutCourse}</strong> {withoutCourse === 1 ? "ученик ждёт" : "ученика ждут"} назначения курса.</p>
        </div>
      ) : null}

      <section className="workspace-section mt-8 overflow-hidden" aria-labelledby="access-list-title">
        <div className="border-b px-5 py-4 sm:px-7">
          <h2 id="access-list-title" className="font-display text-xl">Ученики и курсы</h2>
        </div>
        {students.length > 0 ? students.map((student, index) => (
          <div className={`grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,1fr)_auto] sm:items-center sm:px-7 ${index > 0 ? "border-t" : ""}`} key={student.id}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{student.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">Прогресс {student.publishedMaterials > 0 ? `${student.completedMaterials} / ${student.publishedMaterials}` : "—"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {student.courseTitles.length > 0 ? student.courseTitles.map((title) => <Badge key={title} variant="outline">{title}</Badge>) : <Badge variant="destructive">Курс не назначен</Badge>}
            </div>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={`/admin/students/${student.id}`} aria-label={`Настроить доступ ${student.email}`}>
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        )) : <p className="px-7 py-10 text-sm text-muted-foreground">Сначала добавьте ученика.</p>}
      </section>
    </main>
  );
}
