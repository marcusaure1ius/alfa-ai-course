import { ArrowRight } from "lucide-react";
import Link from "next/link";

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

      <div className="mt-8 overflow-hidden rounded-xl border bg-card">
        {students.length > 0 ? (
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
                    {student.courseTitle ? (
                      <span className="text-sm">{student.courseTitle}</span>
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
        ) : (
          <div className="px-6 py-14">
            <h2 className="font-display text-xl">Пока нет учеников</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Аккаунты появятся здесь после добавления через административный
              процесс. Декоративные данные не показываются.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
