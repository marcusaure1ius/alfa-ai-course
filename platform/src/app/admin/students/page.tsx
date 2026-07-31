import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { StudentCreateForm } from "@/components/admin/student-create-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAdminStudents } from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

export default async function StudentsPage() {
  const students = await getAdminStudents(getDatabase());

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-page-title">Ученики</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {students.length} {students.length === 1 ? "аккаунт" : "аккаунтов"}
          </p>
        </div>
      </div>

      <StudentCreateForm />

      <div className="mt-8 overflow-hidden rounded-xl border bg-card">
        {students.length > 0 ? (
          <>
            <div className="divide-y md:hidden">
              {students.map((student) => (
                <Link
                  key={student.id}
                  href={`/admin/students/${student.id}`}
                  className="flex min-h-24 items-center gap-4 px-5 py-4 transition-colors hover:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-all text-sm font-medium">
                      {student.email}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      {student.courseTitles.length > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {student.courseTitles.join(", ")}
                        </span>
                      ) : (
                        <Badge variant="outline">Нет курса</Badge>
                      )}
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {student.publishedMaterials > 0
                          ? `${student.completedMaterials} / ${student.publishedMaterials}`
                          : "—"}
                      </span>
                    </span>
                    {student.status === "blocked" ? (
                      <Badge variant="destructive" className="mt-2">
                        Заблокирован
                      </Badge>
                    ) : null}
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-5">Ученик</TableHead>
                    <TableHead>Доступ</TableHead>
                    <TableHead>Прогресс</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Открыть</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="px-5 py-4">
                        <Link
                          href={`/admin/students/${student.id}`}
                          className="font-medium hover:underline"
                        >
                          {student.email}
                        </Link>
                        {student.status === "blocked" ? (
                          <Badge variant="destructive" className="ml-2">
                            Заблокирован
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {student.courseTitles.length > 0 ? (
                          <span className="text-sm">
                            {student.courseTitles.join(", ")}
                          </span>
                        ) : (
                          <Badge variant="outline">Нет курса</Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {student.publishedMaterials > 0
                          ? `${student.completedMaterials} / ${student.publishedMaterials}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="icon-sm">
                          <Link
                            href={`/admin/students/${student.id}`}
                            aria-label={`Открыть ${student.email}`}
                          >
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="px-6 py-14">
            <h2 className="font-display text-xl">Пока нет учеников</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Добавленные аккаунты появятся здесь. После этого ученику можно
              открыть доступ к курсу.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
